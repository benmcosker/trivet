import { prisma } from "./db";
import { visibleRecipes, visibleReviews } from "./recipe-visibility";
import {
  NO_REVIEWS,
  reviewInput,
  type ReviewInput,
  type ReviewSummary,
  type ReviewWithAuthor,
} from "./review-schema";

/**
 * Averages for a set of recipes, in one query.
 *
 * Computed on read rather than kept in a counter column on the recipe. The
 * library is a household's worth of recipes, not a catalogue, so a grouped
 * aggregate over an indexed column is cheap - and a stored average is a number
 * that can drift out of step with the rows it claims to summarise, which is a
 * worse failure than a slightly slower page.
 */
export async function getReviewSummaries(
  recipeIds: string[],
  /** Whose view: a household it has hidden does not count towards it. */
  householdId: string,
): Promise<Map<string, ReviewSummary>> {
  const summaries = new Map<string, ReviewSummary>();
  if (recipeIds.length === 0) return summaries;

  const groups = await prisma.recipeReview.groupBy({
    by: ["recipeId"],
    where: { recipeId: { in: recipeIds }, ...visibleReviews(householdId) },
    _avg: { stars: true },
    _count: { stars: true },
  });

  for (const group of groups) {
    summaries.set(group.recipeId, {
      // Rounded to one place: the difference between 4.33 and 4.3 is noise, and
      // the extra digits imply a precision five opinions do not have.
      average:
        group._avg.stars == null
          ? null
          : Math.round(group._avg.stars * 10) / 10,
      count: group._count.stars,
    });
  }

  return summaries;
}

export async function getReviewSummary(
  recipeId: string,
  householdId: string,
): Promise<ReviewSummary> {
  const summaries = await getReviewSummaries([recipeId], householdId);
  return summaries.get(recipeId) ?? NO_REVIEWS;
}

/**
 * Newest first.
 *
 * The opposite of a comment thread, and deliberately: reviews are independent
 * verdicts rather than a conversation, and the one written after the most
 * recent attempt is the one worth reading first.
 */
export async function listReviews(
  recipeId: string,
  /** Whose view: reviews from a household it has hidden are left out. */
  householdId: string,
): Promise<ReviewWithAuthor[]> {
  const reviews = await prisma.recipeReview.findMany({
    where: { recipeId, ...visibleReviews(householdId) },
    orderBy: { createdAt: "desc" },
    include: { user: { select: authorSelect } },
  });

  return reviews.map((review) => ({
    id: review.id,
    stars: review.stars,
    body: review.body,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
    author: author(review.user),
  }));
}

/** This person's own review, if they have left one. */
export async function getMyReview(
  recipeId: string,
  userId: string,
): Promise<ReviewWithAuthor | null> {
  const review = await prisma.recipeReview.findUnique({
    where: { recipeId_userId: { recipeId, userId } },
    include: { user: { select: authorSelect } },
  });
  if (!review) return null;

  return {
    id: review.id,
    stars: review.stars,
    body: review.body,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
    author: author(review.user),
  };
}

const authorSelect = {
  id: true,
  name: true,
  householdId: true,
  household: { select: { name: true } },
} as const;

function author(user: {
  id: string;
  name: string;
  householdId: string | null;
  household: { name: string } | null;
}): ReviewWithAuthor["author"] {
  return {
    id: user.id,
    name: user.name,
    householdId: user.householdId,
    householdName: user.household?.name ?? null,
  };
}

/**
 * Leave a review, replacing any earlier one from the same person.
 *
 * An upsert rather than a create: changing your mind about a dish you have now
 * cooked three times should move the average, not vote twice.
 *
 * Anyone who can see a recipe may review it, whichever household added it.
 * Ratings follow visibility exactly: a shared recipe carries one average over
 * everybody who can open it, which says far more than one family's three
 * opinions - and a private one is rated only by the family that has it.
 *
 * The check is on visibility rather than existence, because the id arrives
 * from a form post. Without it a guessed id would let somebody move the
 * average on a recipe they cannot read, and learn from the response that it is
 * there.
 */
export async function saveReview(
  recipeId: string,
  userId: string,
  householdId: string,
  input: ReviewInput,
): Promise<string> {
  const { stars, body } = reviewInput.parse(input);

  const recipe = await prisma.recipe.findFirst({
    where: { AND: [{ id: recipeId }, visibleRecipes(householdId)] },
    select: { id: true },
  });
  if (!recipe) throw new Error("No such recipe");

  const review = await prisma.recipeReview.upsert({
    where: { recipeId_userId: { recipeId, userId } },
    create: { recipeId, userId, stars, body },
    update: { stars, body },
    select: { id: true },
  });

  return review.id;
}

/**
 * Withdraw your review, which is different from rating a dish one star.
 *
 * Scoped by userId rather than checked and then deleted: there is no window
 * between the two, and a request for someone else's review removes nothing
 * instead of erroring, which is the same outcome as a review already gone.
 *
 * Returns whether anything was actually removed.
 */
export async function deleteReview(
  recipeId: string,
  userId: string,
): Promise<boolean> {
  const { count } = await prisma.recipeReview.deleteMany({
    where: { recipeId, userId },
  });
  return count > 0;
}
