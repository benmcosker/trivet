import { Prisma } from "@/generated/prisma/client";

import { prisma } from "./db";
import { PAGE_SIZE } from "./recipe-page";
import { DEFAULT_SORT, type RecipeSort } from "./recipe-sort";
import { NO_REVIEWS, type ReviewSummary } from "./review-schema";
import { publicIdFromPath } from "./recipe-url";
import { visibleRecipes, visibleRecipesSql } from "./recipe-visibility";
import { getReviewSummaries } from "./reviews";

export type RecipeSearchHit = {
  id: string;
  rank: number;
};

export type RecipeSearchOptions = {
  /**
   * Whose view of the library this is: their own recipes, plus everything
   * other households have shared. Required rather than optional, so a new
   * call site cannot quietly search the lot.
   */
  householdId: string;
  /** Free-text query. Empty or whitespace-only returns the newest recipes. */
  query?: string;
  /** Tag slugs. A recipe must carry every slug listed to match. */
  tagSlugs?: string[];
  /**
   * Defaults to newest, which defers to relevance when there is also a search
   * query: a search for "lemon" answering with the least relevant match simply
   * because it was added most recently would be a worse search. Any other
   * choice is authoritative.
   */
  sort?: RecipeSort;
  limit?: number;
  offset?: number;
};

/**
 * Search recipe IDs, ranked.
 *
 * Two matching strategies run together, because either alone leaves obvious
 * gaps:
 *
 * - Full-text against the trigger-maintained `search_vector`. Handles word
 *   stemming and multi-word queries, and gives us ranking.
 * - Case-insensitive substring, via the pg_trgm indexes. Full-text alone misses
 *   partial words and near-misses the English stemmer treats as distinct - a
 *   search for "lemon" does not match a recipe described as "lemony", because
 *   those stem to `lemon` and `lemoni`. Substring matching catches it.
 *
 * Ingredients and tags live in other tables, so they are matched with EXISTS
 * subqueries rather than being folded into the recipe's own vector.
 *
 * Returned as IDs rather than rows: ranking needs raw SQL, but the caller wants
 * a fully-hydrated Prisma object, so it re-fetches by ID and re-applies order.
 */
/**
 * Everything that decides whether a recipe is in these results.
 *
 * Built once and handed to both the search and the count, because the range
 * line ("Dishes 25-48 of 163") is a claim about the same set the grid is
 * drawn from. Two copies of this clause would agree right up until one of them
 * was edited, and a count that disagrees with the grid is worse than no count
 * at all - it is the page lying quietly.
 *
 * Ordering, the rating join and LIMIT/OFFSET are deliberately not in here: the
 * count needs none of them, and paying for a review aggregate to count rows
 * would be paying for a sort nobody asked for.
 */
function searchWhere(options: RecipeSearchOptions): Prisma.Sql {
  const query = options.query?.trim() ?? "";
  const tagSlugs = options.tagSlugs?.filter(Boolean) ?? [];

  const visible = visibleRecipesSql(options.householdId);

  const tagFilter =
    tagSlugs.length > 0
      ? Prisma.sql`
          AND (
            SELECT COUNT(DISTINCT t."slug")
            FROM "recipe_tag" rt
            JOIN "tag" t ON t."id" = rt."tagId"
            WHERE rt."recipeId" = r."id" AND t."slug" IN (${Prisma.join(tagSlugs)})
          ) = ${tagSlugs.length}
        `
      : Prisma.empty;

  if (query === "") return Prisma.sql`${visible} ${tagFilter}`;

  // Escape LIKE wildcards so a user typing "100%" searches for that literally.
  const like = `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

  return Prisma.sql`${visible} AND (
      r."search_vector" @@ websearch_to_tsquery('english', ${query})
      OR r."title" ILIKE ${like}
      OR r."description" ILIKE ${like}
      OR EXISTS (
        SELECT 1 FROM "ingredient" i
        WHERE i."recipeId" = r."id"
          AND (
            to_tsvector('english', i."name") @@ websearch_to_tsquery('english', ${query})
            OR i."name" ILIKE ${like}
          )
      )
      OR EXISTS (
        SELECT 1 FROM "recipe_tag" rt
        JOIN "tag" t ON t."id" = rt."tagId"
        WHERE rt."recipeId" = r."id" AND t."name" ILIKE ${like}
      )
    )
    ${tagFilter}`;
}

/**
 * How many recipes this search finds, ignoring the page.
 *
 * Distinct from `countRecipes`, which counts the whole box: that is the right
 * number for the eyebrow above the grid, and the wrong one for a range line
 * about a filtered search.
 */
export async function countSearchRecipes(
  options: RecipeSearchOptions,
): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: number }[]>(Prisma.sql`
    SELECT COUNT(*)::int AS count
    FROM "recipe" r
    WHERE ${searchWhere(options)}
  `);
  return rows[0]?.count ?? 0;
}

export async function searchRecipeIds(
  options: RecipeSearchOptions,
): Promise<RecipeSearchHit[]> {
  const query = options.query?.trim() ?? "";
  const sort = options.sort ?? DEFAULT_SORT;

  // Only "highest rated" needs the review aggregate, so the join is paid for
  // only when it is asked for.
  const ratingJoin =
    sort === "rating"
      ? Prisma.sql`
          LEFT JOIN (
            SELECT "recipeId",
                   AVG("stars")::float8 AS avg_stars,
                   COUNT(*)::int AS review_count
            FROM "recipe_review"
            GROUP BY "recipeId"
          ) rr ON rr."recipeId" = r."id"
        `
      : Prisma.empty;

  const orderBy = {
    newest: Prisma.sql`r."createdAt" DESC`,
    oldest: Prisma.sql`r."createdAt" ASC`,
    // Rounded to the same one place the card shows, so two recipes both
    // reading "4.3" are a genuine tie rather than being separated by a digit
    // nobody can see. Ties then go to the recipe more people have rated -
    // four fives is a stronger four-and-a-half than one is. Unrated recipes
    // sort last: Postgres would otherwise lead with them, NULL being "greater
    // than" everything in a DESC order.
    rating: Prisma.sql`round(rr.avg_stars::numeric, 1) DESC NULLS LAST, rr.review_count DESC, r."createdAt" DESC`,
    // Case-insensitive, or "apple crumble" sorts after "Zabaglione".
    title: Prisma.sql`lower(r."title") ASC`,
  }[sort];

  /*
   * The default is a page, not the library.
   *
   * It used to be 50 with no caller passing anything, which truncated the
   * grid at fifty while the eyebrow above it counted the whole box - a page
   * showing less than it claimed, and saying nothing. Callers pass a real
   * limit and offset now; the default matches a page so that a caller which
   * forgets is merely on page one rather than silently wrong.
   */
  const limit = Math.min(options.limit ?? PAGE_SIZE, 200);
  const offset = Math.max(options.offset ?? 0, 0);

  const where = searchWhere(options);

  if (query === "") {
    return prisma.$queryRaw<RecipeSearchHit[]>(Prisma.sql`
      SELECT r."id", 0::float8 AS rank
      FROM "recipe" r
      ${ratingJoin}
      WHERE ${where}
      ORDER BY ${orderBy}
      LIMIT ${limit} OFFSET ${offset}
    `);
  }

  return prisma.$queryRaw<RecipeSearchHit[]>(Prisma.sql`
    SELECT
      r."id",
      ts_rank(r."search_vector", websearch_to_tsquery('english', ${query}))::float8 AS rank
    FROM "recipe" r
    ${ratingJoin}
    WHERE ${where}
    ORDER BY ${
      // Relevance leads only for the default order. Someone who has explicitly
      // asked for oldest or A-Z means it, search or no search.
      sort === DEFAULT_SORT ? Prisma.sql`rank DESC, ${orderBy}` : orderBy
    }
    LIMIT ${limit} OFFSET ${offset}
  `);
}

const recipeInclude = {
  ingredients: { orderBy: { position: "asc" } },
  tags: { include: { tag: true } },
  createdBy: { select: { id: true, name: true } },
  // Named on the page rather than only compared against: in a shared library
  // "whose is this" is the answer to "why can I not edit it", and worth
  // knowing on its own.
  household: { select: { name: true } },
  _count: { select: { reviews: true } },
} satisfies Prisma.RecipeInclude;

/**
 * The review average rides along with every recipe the app loads.
 *
 * Prisma cannot average a relation inside an `include`, so it is a second
 * query stitched on here rather than at each call site - otherwise every new
 * page that shows a recipe has to remember to fetch it, and the one that
 * forgets shows an unreviewed dish.
 */
export type RecipeWithRelations = Prisma.RecipeGetPayload<{
  include: typeof recipeInclude;
}> & { reviews: ReviewSummary };

async function withReviewSummaries<T extends { id: string }>(
  recipes: T[],
): Promise<(T & { reviews: ReviewSummary })[]> {
  const summaries = await getReviewSummaries(recipes.map((r) => r.id));
  return recipes.map((recipe) => ({
    ...recipe,
    reviews: summaries.get(recipe.id) ?? NO_REVIEWS,
  }));
}

/** Search and hydrate in one call, preserving rank order. */
export async function searchRecipes(
  options: RecipeSearchOptions,
): Promise<RecipeWithRelations[]> {
  const hits = await searchRecipeIds(options);
  if (hits.length === 0) return [];

  const ids = hits.map((h) => h.id);
  const recipes = await withReviewSummaries(
    await prisma.recipe.findMany({
      // The ids came from a query that already applied the rule; applying it
      // again costs an indexed comparison and means the hydrate cannot be the
      // step that widens what a search returned.
      where: {
        AND: [{ id: { in: ids } }, visibleRecipes(options.householdId)],
      },
      include: recipeInclude,
    }),
  );

  // `IN (...)` does not preserve order, so restore the ranking from the search.
  const byId = new Map(recipes.map((r) => [r.id, r]));
  return ids
    .map((id) => byId.get(id))
    .filter((r): r is RecipeWithRelations => r !== undefined);
}

/**
 * One recipe, if this household may read it.
 *
 * Null covers both "no such recipe" and "not yours to see", and the caller
 * turns either into the same 404. Telling the two apart would answer a
 * stranger's guessed id with the news that it exists.
 */
/**
 * One recipe, by whatever the address said.
 *
 * Two kinds of address reach this. The current one carries the title and ends
 * in a public id - `pork-ragu-a3f91c47` - and everything before that last
 * hyphen is thrown away. The old one is the cuid itself, which is what every
 * link saved before this change looks like, and those go on working: the
 * parameter is tried against `id` as well.
 *
 * One query rather than two. A cuid has no hyphens, so it survives
 * `publicIdFromPath` whole and simply fails to match a `publicId`; a current
 * address yields eight characters that cannot match anybody's `id`. Neither
 * can find the wrong recipe.
 */
export async function getRecipe(
  param: string,
  householdId: string,
): Promise<RecipeWithRelations | null> {
  const recipe = await prisma.recipe.findFirst({
    where: {
      AND: [
        { OR: [{ publicId: publicIdFromPath(param) }, { id: param }] },
        visibleRecipes(householdId),
      ],
    },
    include: recipeInclude,
  });
  if (!recipe) return null;

  const [withSummary] = await withReviewSummaries([recipe]);
  return withSummary;
}

/** Turn free-text tag names into Tag rows, reusing any that already exist. */
export async function upsertTags(names: string[]): Promise<string[]> {
  const cleaned = [...new Set(names.map((n) => n.trim()).filter(Boolean))];

  const tags = await Promise.all(
    cleaned.map((name) => {
      const slug = slugifyTag(name);
      return prisma.tag.upsert({
        where: { slug },
        create: { name, slug },
        update: {},
      });
    }),
  );

  return tags.map((t) => t.id);
}

export function slugifyTag(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * How many dishes this household can see: its own, plus what is shared.
 *
 * The same rule as the library it heads, or the count promises dishes the
 * grid will not show.
 */
export async function countRecipes(householdId: string): Promise<number> {
  return prisma.recipe.count({ where: visibleRecipes(householdId) });
}
