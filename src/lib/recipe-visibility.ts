import { Prisma } from "@/generated/prisma/client";

/**
 * Which recipes a household may read.
 *
 * Its own, and anything another household has shared. Written once and used by
 * every read, because "who can see this" is the kind of rule that is right in
 * four places and forgotten in the fifth - and the fifth is the one that shows
 * somebody another family's dinner.
 *
 * Sharing is not per household pair: a shared recipe is shared with everyone.
 * See the schema comment on `Recipe.isShared` for why, and for what would have
 * to change if that stops being true.
 *
 * Everyone except a household this one has hidden (`HouseholdBlock`): that
 * household's shared recipes leave this library. Its own recipes are never
 * hidden from it, whatever anybody else has done.
 */
export function visibleRecipes(householdId: string): Prisma.RecipeWhereInput {
  return {
    OR: [
      { householdId },
      {
        isShared: true,
        household: { blocksReceived: { none: { blockerId: householdId } } },
      },
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
  return Prisma.sql`(r."householdId" = ${householdId} OR (r."isShared" AND NOT EXISTS (
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
