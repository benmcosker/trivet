import { z } from "zod";

/**
 * The parts of reviews that carry no database access.
 *
 * Kept apart from `reviews.ts` deliberately: the star widget and the review
 * form are client components, and a single value imported from a module that
 * touches Prisma pulls the Postgres driver into the browser bundle. Types alone
 * would be erased, but constants and schemas are real imports.
 */

export const MIN_STARS = 1;
export const MAX_STARS = 5;

/** Matches the CHECK constraint on recipe_review.stars. */
export const starsInput = z
  .number()
  .int("Ratings are whole stars.")
  .min(MIN_STARS, `Ratings run from ${MIN_STARS} to ${MAX_STARS} stars.`)
  .max(MAX_STARS, `Ratings run from ${MIN_STARS} to ${MAX_STARS} stars.`);

export const MAX_BODY_LENGTH = 2000;

/**
 * What they thought, if they had anything to add.
 *
 * Long enough for "swapped the cream for coconut milk and cut the sugar by
 * half, worked better on the second try", short enough that nobody pastes an
 * entire competing recipe into the thread.
 *
 * Empty and whitespace-only both become null: "no words" is one state, not
 * three, and the CHECK constraint refuses the alternatives anyway.
 */
export const bodyInput = z
  .string()
  .max(MAX_BODY_LENGTH, `Keep it under ${MAX_BODY_LENGTH} characters.`)
  .nullish()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  });

export const reviewInput = z.object({
  stars: starsInput,
  body: bodyInput,
});

export type ReviewInput = z.input<typeof reviewInput>;

export type ReviewSummary = {
  /** Mean of every review's stars, or null when nobody has reviewed it yet. */
  average: number | null;
  /** How many people have reviewed it. Every review carries a score. */
  count: number;
};

export const NO_REVIEWS: ReviewSummary = { average: null, count: 0 };

export type ReviewWithAuthor = {
  id: string;
  stars: number;
  body: string | null;
  createdAt: Date;
  updatedAt: Date;
  author: {
    id: string;
    name: string;
    /** So a review from another household can be reported or hidden. */
    householdId: string | null;
    householdName: string | null;
  };
};
