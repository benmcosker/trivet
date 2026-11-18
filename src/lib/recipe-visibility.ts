import { Prisma } from "@/generated/prisma/client";

import { adminEmails, parseEmailList } from "./admin";
import { prisma } from "./db";

/**
 * Whose shared recipes every household sees: the base library's.
 *
 * Trivet's shared library is the set of base recipes written for it - their
 * words rewritten, their photos taken for Trivet - and nothing else. A
 * household's own recipes are its own; sharing them with every household
 * there is, and every one there will be, is republishing whatever they were
 * copied from, and no reminder or rewrite makes that as safe as not doing it.
 *
 * The library is the household of anyone listed in `LIBRARY_EMAILS`, read
 * like `ADMIN_EMAILS` and falling back to it when unset, because the person
 * who runs Trivet is the person whose household holds the library. Unset
 * both, and no recipe is shared with anybody.
 */
export function libraryEmails(
  env: Record<string, string | undefined> = process.env,
): string[] {
  const own = parseEmailList(env.LIBRARY_EMAILS);
  return own.length > 0 ? own : adminEmails(env);
}

/** Whether this household holds the base library, and so may share. */
export async function isLibraryHousehold(
  householdId: string,
): Promise<boolean> {
  const emails = libraryEmails();
  if (emails.length === 0) return false;
  const count = await prisma.user.count({
    where: { householdId, email: { in: emails, mode: "insensitive" } },
  });
  return count > 0;
}

/**
 * Which recipes a household may read.
 *
 * Its own, the base library's shared recipes (`libraryEmails`), and any
 * another household has shared with it by name (`RecipeShare`). Written
 * once and used by every read, because "who can see this" is the kind of rule
 * that is right in four places and forgotten in the fifth - and the fifth is
 * the one that shows somebody another family's dinner.
 *
 * `isShared` still matters inside the library household: a recipe there is
 * part of the library only once it is shared, so a new one can be worked on
 * before every household sees it.
 *
 * Everyone except a household this one has hidden (`HouseholdBlock`): that
 * household's shared recipes leave this library. Its own recipes are never
 * hidden from it, whatever anybody else has done.
 */
export function visibleRecipes(householdId: string): Prisma.RecipeWhereInput {
  const library = libraryEmails();
  const notHidden = { blocksReceived: { none: { blockerId: householdId } } };
  return {
    OR: [
      { householdId },
      {
        sharedWith: { some: { householdId } },
        household: notHidden,
      },
      ...(library.length > 0
        ? [
            {
              isShared: true,
              household: {
                members: {
                  some: {
                    email: { in: library, mode: "insensitive" as const },
                  },
                },
                ...notHidden,
              },
            },
          ]
        : []),
    ],
  };
}

/**
 * The same rule as SQL, for the search query.
 *
 * Search ranks in raw SQL because Prisma cannot, so the predicate has to exist
 * twice. Both live in this file so the pair can be read at once and changed
 * together; `r` is the alias the search gives the recipe table.
 */
export function visibleRecipesSql(householdId: string): Prisma.Sql {
  const library = libraryEmails();
  return Prisma.sql`(r."householdId" = ${householdId} OR ((
    EXISTS (
      SELECT 1 FROM "recipe_share" s
      WHERE s."recipeId" = r."id" AND s."householdId" = ${householdId}
    ) OR (r."isShared" AND EXISTS (
      SELECT 1 FROM "user" u
      WHERE u."householdId" = r."householdId" AND lower(u."email") = ANY(${library}::text[])
    ))
  ) AND NOT EXISTS (
    SELECT 1 FROM "household_block" b
    WHERE b."blockerId" = ${householdId} AND b."blockedId" = r."householdId"
  )))`;
}

/**
 * Reviews this household may read: everyone's but those written by members of
 * a household it has hidden. For a `RecipeReview` query's `where`.
 */
export function visibleReviews(
  householdId: string,
): Prisma.RecipeReviewWhereInput {
  return {
    NOT: {
      user: {
        household: { blocksReceived: { some: { blockerId: householdId } } },
      },
    },
  };
}

/** Whether this household may change or delete it. Owners only, shared or not. */
export function canEdit(
  recipe: { householdId: string },
  householdId: string,
): boolean {
  return recipe.householdId === householdId;
}

/**
 * The photo this household is shown for a recipe.
 *
 * Sharing a recipe shares the recipe, not a photo the household never took. A
 * picture that came with the source - a food site's photo, the one inside a
 * meal kit's PDF - is someone else's work, so it stays with the household that
 * imported it, and everyone else gets the placeholder until that household
 * adds a photo of their own (`Recipe.imageFromSource`).
 *
 * Every read that hands a recipe's `imageUrl` to a page goes through this, for
 * the same reason `visibleRecipes` exists: the rule has to hold in the fifth
 * place as well as the first four.
 */
export function shownImageUrl(
  recipe: {
    householdId: string;
    imageUrl: string | null;
    imageFromSource: boolean;
  },
  householdId: string,
): string | null {
  if (!recipe.imageUrl) return null;
  if (recipe.householdId === householdId) return recipe.imageUrl;
  return recipe.imageFromSource ? null : recipe.imageUrl;
}

/** A recipe with `imageUrl` replaced by what this household may see. */
export function withShownImage<
  R extends {
    householdId: string;
    imageUrl: string | null;
    imageFromSource: boolean;
  },
>(recipe: R, householdId: string): R {
  return { ...recipe, imageUrl: shownImageUrl(recipe, householdId) };
}
