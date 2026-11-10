import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { createRecipe, deleteRecipe } from "@/lib/recipe-mutations";
import { recipeInput } from "@/lib/recipe-schema";
import { getRecipe, searchRecipes } from "@/lib/recipes";
import { MAX_BODY_LENGTH } from "@/lib/review-schema";
import { makeHousehold, resetDatabase as reset } from "./support/db";
import {
  deleteReview,
  getMyReview,
  getReviewSummaries,
  getReviewSummary,
  listReviews,
  saveReview,
} from "@/lib/reviews";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("reviews", () => {
  let householdId: string;
  let alice: string;
  let bob: string;
  let carol: string;
  let recipeId: string;

  beforeEach(async () => {
    await reset();
    // One household: reviews are a conversation between people who share a
    // kitchen, so every one of them can see and rate the same dish.
    ({ householdId, userId: alice } = await makeHousehold());
    [bob, carol] = await Promise.all([
      addUser("bob", "Bob", householdId),
      addUser("carol", "Carol", householdId),
    ]);
    recipeId = await addRecipe("Chicken Piccata", householdId, alice);
  });

  afterAll(async () => {
    await reset();
    await prisma.$disconnect();
  });

  describe("the average", () => {
    it("is null until somebody reviews the recipe", async () => {
      expect(await getReviewSummary(recipeId, householdId)).toEqual({
        average: null,
        count: 0,
      });
    });

    it("averages the stars from every review", async () => {
      await saveReview(recipeId, alice, householdId, { stars: 5 });
      await saveReview(recipeId, bob, householdId, { stars: 4 });
      await saveReview(recipeId, carol, householdId, { stars: 3 });

      expect(await getReviewSummary(recipeId, householdId)).toEqual({
        average: 4,
        count: 3,
      });
    });

    it("rounds to one decimal place rather than implying false precision", async () => {
      // 5, 4, 4 averages to 4.333...
      await saveReview(recipeId, alice, householdId, { stars: 5 });
      await saveReview(recipeId, bob, householdId, { stars: 4 });
      await saveReview(recipeId, carol, householdId, { stars: 4 });

      expect((await getReviewSummary(recipeId, householdId)).average).toBe(4.3);
    });

    it("counts a review whether or not it carries words", async () => {
      await saveReview(recipeId, alice, householdId, {
        stars: 5,
        body: "Excellent.",
      });
      await saveReview(recipeId, bob, householdId, { stars: 1 });

      expect(await getReviewSummary(recipeId, householdId)).toEqual({
        average: 3,
        count: 2,
      });
    });

    it("counts each person once, however many times they revise", async () => {
      // The failure this guards against: one enthusiast re-reviewing a dish
      // repeatedly and outvoting the rest of the household.
      await saveReview(recipeId, alice, householdId, { stars: 1 });
      await saveReview(recipeId, alice, householdId, { stars: 5 });
      await saveReview(recipeId, alice, householdId, {
        stars: 5,
        body: "Still great.",
      });
      await saveReview(recipeId, bob, householdId, { stars: 1 });

      expect(await getReviewSummary(recipeId, householdId)).toEqual({
        average: 3,
        count: 2,
      });
    });

    it("drops a withdrawn review out of the average entirely", async () => {
      await saveReview(recipeId, alice, householdId, { stars: 5 });
      await saveReview(recipeId, bob, householdId, { stars: 1 });
      await deleteReview(recipeId, bob);

      expect(await getReviewSummary(recipeId, householdId)).toEqual({
        average: 5,
        count: 1,
      });
    });

    it("treats withdrawing as different from awarding one star", async () => {
      await saveReview(recipeId, alice, householdId, { stars: 1 });
      expect((await getReviewSummary(recipeId, householdId)).count).toBe(1);

      await deleteReview(recipeId, alice);
      expect(await getReviewSummary(recipeId, householdId)).toEqual({
        average: null,
        count: 0,
      });
    });

    it("keeps each recipe's reviews to itself", async () => {
      const other = await addRecipe("Lentil Dahl", householdId, alice);
      await saveReview(recipeId, alice, householdId, { stars: 5 });
      await saveReview(other, alice, householdId, { stars: 1 });

      const summaries = await getReviewSummaries(
        [recipeId, other],
        householdId,
      );
      expect(summaries.get(recipeId)?.average).toBe(5);
      expect(summaries.get(other)?.average).toBe(1);
    });

    it("omits unreviewed recipes from a batch rather than inventing a zero", async () => {
      const unreviewed = await addRecipe("Lentil Dahl", householdId, alice);
      await saveReview(recipeId, alice, householdId, { stars: 4 });

      const summaries = await getReviewSummaries(
        [recipeId, unreviewed],
        householdId,
      );
      expect(summaries.has(unreviewed)).toBe(false);
    });

    it("handles an empty batch without querying", async () => {
      expect((await getReviewSummaries([], householdId)).size).toBe(0);
    });
  });

  describe("the scale", () => {
    it.each([0, 6, -1, 100])("refuses %i stars", async (stars) => {
      await expect(
        saveReview(recipeId, alice, householdId, { stars }),
      ).rejects.toThrow();
    });

    it("refuses half stars", async () => {
      await expect(
        saveReview(recipeId, alice, householdId, { stars: 3.5 }),
      ).rejects.toThrow();
    });

    it.each([1, 2, 3, 4, 5])("accepts %i stars", async (stars) => {
      await saveReview(recipeId, alice, householdId, { stars });
      expect((await getMyReview(recipeId, alice))?.stars).toBe(stars);
    });

    it("is enforced by the database, not only by the schema", async () => {
      // Validation in TypeScript is one refactor away from being bypassed. A
      // zero-star row would silently drag every average down, so the column
      // itself has to refuse it. Named explicitly: a bare rejection would also
      // be produced by a typo in this very query, which would prove nothing.
      await expect(
        prisma.$executeRaw`
          INSERT INTO "recipe_review" ("id", "stars", "recipeId", "userId", "updatedAt")
          VALUES ('forced', 0, ${recipeId}, ${alice}, now())
        `,
      ).rejects.toThrow(/recipe_review_stars_range/);
    });

    it("refuses a blank body at the database level too", async () => {
      await expect(
        prisma.$executeRaw`
          INSERT INTO "recipe_review" ("id", "stars", "body", "recipeId", "userId", "updatedAt")
          VALUES ('forced', 4, '   ', ${recipeId}, ${alice}, now())
        `,
      ).rejects.toThrow(/recipe_review_body_not_blank/);
    });
  });

  describe("stars and words travel together", () => {
    it("stores the words alongside the score", async () => {
      await saveReview(recipeId, alice, householdId, {
        stars: 4,
        body: "Used thighs, needed ten more minutes.",
      });

      const [review] = await listReviews(recipeId, householdId);
      expect(review.stars).toBe(4);
      expect(review.body).toBe("Used thighs, needed ten more minutes.");
    });

    it("allows a score with nothing to add", async () => {
      await saveReview(recipeId, alice, householdId, { stars: 5 });
      expect((await listReviews(recipeId, householdId))[0].body).toBeNull();
    });

    it.each([undefined, null, "", "   ", "\n\t "])(
      "treats %j as having nothing to add rather than as empty words",
      async (body) => {
        await saveReview(recipeId, alice, householdId, { stars: 5, body });
        expect((await listReviews(recipeId, householdId))[0].body).toBeNull();
      },
    );

    it("trims surrounding whitespace off the words", async () => {
      await saveReview(recipeId, alice, householdId, {
        stars: 4,
        body: "  Used thighs.\n",
      });
      expect((await listReviews(recipeId, householdId))[0].body).toBe(
        "Used thighs.",
      );
    });

    it("keeps line breaks inside the words", async () => {
      await saveReview(recipeId, alice, householdId, {
        stars: 4,
        body: "Swaps:\n- thighs\n- less salt",
      });
      expect((await listReviews(recipeId, householdId))[0].body).toBe(
        "Swaps:\n- thighs\n- less salt",
      );
    });

    it("refuses words longer than the limit", async () => {
      await expect(
        saveReview(recipeId, alice, householdId, {
          stars: 4,
          body: "x".repeat(MAX_BODY_LENGTH + 1),
        }),
      ).rejects.toThrow();
    });

    it("accepts words exactly at the limit", async () => {
      await saveReview(recipeId, alice, householdId, {
        stars: 4,
        body: "x".repeat(MAX_BODY_LENGTH),
      });
      expect((await listReviews(recipeId, householdId))[0].body).toHaveLength(
        MAX_BODY_LENGTH,
      );
    });

    it("lets a revision add words to a score left bare", async () => {
      await saveReview(recipeId, alice, householdId, { stars: 3 });
      await saveReview(recipeId, alice, householdId, {
        stars: 5,
        body: "Better second go.",
      });

      const reviews = await listReviews(recipeId, householdId);
      expect(reviews).toHaveLength(1);
      expect(reviews[0]).toMatchObject({
        stars: 5,
        body: "Better second go.",
      });
    });

    it("lets a revision take the words back off", async () => {
      await saveReview(recipeId, alice, householdId, {
        stars: 3,
        body: "Too salty.",
      });
      await saveReview(recipeId, alice, householdId, { stars: 3, body: "" });
      expect((await listReviews(recipeId, householdId))[0].body).toBeNull();
    });
  });

  describe("the list", () => {
    it("puts the newest review first", async () => {
      await saveReview(recipeId, alice, householdId, {
        stars: 5,
        body: "First.",
      });
      await saveReview(recipeId, bob, householdId, {
        stars: 4,
        body: "Second.",
      });
      await saveReview(recipeId, carol, householdId, {
        stars: 3,
        body: "Third.",
      });

      expect(
        (await listReviews(recipeId, householdId)).map((r) => r.body),
      ).toEqual(["Third.", "Second.", "First."]);
    });

    it("names the author", async () => {
      await saveReview(recipeId, bob, householdId, {
        stars: 4,
        body: "Needed lemon.",
      });
      expect((await listReviews(recipeId, householdId))[0].author).toEqual({
        id: bob,
        name: "Bob",
        householdId,
        householdName: expect.any(String),
      });
    });

    it("keeps each recipe's reviews to itself", async () => {
      const other = await addRecipe("Lentil Dahl", householdId, alice);
      await saveReview(recipeId, alice, householdId, {
        stars: 5,
        body: "On the piccata.",
      });
      await saveReview(other, alice, householdId, {
        stars: 2,
        body: "On the dahl.",
      });

      expect(
        (await listReviews(recipeId, householdId)).map((r) => r.body),
      ).toEqual(["On the piccata."]);
    });
  });

  describe("your own review", () => {
    it("is null when you have not left one", async () => {
      await saveReview(recipeId, bob, householdId, { stars: 5 });
      expect(await getMyReview(recipeId, alice)).toBeNull();
    });

    it("is yours, not somebody else's", async () => {
      await saveReview(recipeId, alice, householdId, {
        stars: 1,
        body: "Bland.",
      });
      await saveReview(recipeId, bob, householdId, {
        stars: 5,
        body: "Superb.",
      });

      expect(await getMyReview(recipeId, alice)).toMatchObject({
        stars: 1,
        body: "Bland.",
      });
    });
  });

  describe("withdrawing", () => {
    it("removes your own", async () => {
      await saveReview(recipeId, alice, householdId, { stars: 5 });
      expect(await deleteReview(recipeId, alice)).toBe(true);
      expect(await listReviews(recipeId, householdId)).toEqual([]);
    });

    it("leaves everyone else's standing", async () => {
      await saveReview(recipeId, alice, householdId, { stars: 5 });
      await saveReview(recipeId, bob, householdId, {
        stars: 1,
        body: "Bland.",
      });

      await deleteReview(recipeId, alice);

      const remaining = await listReviews(recipeId, householdId);
      expect(remaining).toHaveLength(1);
      expect(remaining[0].author.id).toBe(bob);
    });

    it("is not something the recipe's owner can do to a critic", async () => {
      // Alice uploaded the recipe. That does not make Bob's verdict on it hers
      // to remove.
      await saveReview(recipeId, bob, householdId, {
        stars: 1,
        body: "Bland.",
      });
      expect(await deleteReview(recipeId, alice)).toBe(false);
      expect(await listReviews(recipeId, householdId)).toHaveLength(1);
    });

    it("reports nothing removed when there was nothing to remove", async () => {
      expect(await deleteReview(recipeId, alice)).toBe(false);
    });
  });

  describe("cascades", () => {
    it("takes reviews with the recipe", async () => {
      await saveReview(recipeId, alice, householdId, {
        stars: 5,
        body: "Good.",
      });
      await deleteRecipe(recipeId, householdId);
      expect(await prisma.recipeReview.count()).toBe(0);
    });

    it("takes a departing user's reviews with them", async () => {
      await saveReview(recipeId, alice, householdId, { stars: 5 });
      await saveReview(recipeId, bob, householdId, {
        stars: 1,
        body: "Bland.",
      });

      await prisma.user.delete({ where: { id: bob } });

      expect(await getReviewSummary(recipeId, householdId)).toEqual({
        average: 5,
        count: 1,
      });
      expect(await listReviews(recipeId, householdId)).toHaveLength(1);
    });
  });

  describe("what the pages load", () => {
    it("attaches the average to a recipe fetched by id", async () => {
      await saveReview(recipeId, alice, householdId, { stars: 4 });
      await saveReview(recipeId, bob, householdId, { stars: 2 });

      expect((await getRecipe(recipeId, householdId))?.reviews).toEqual({
        average: 3,
        count: 2,
      });
    });

    it("attaches a review count to a recipe fetched by id", async () => {
      await saveReview(recipeId, alice, householdId, { stars: 4 });
      expect((await getRecipe(recipeId, householdId))?._count.reviews).toBe(1);
    });

    it("attaches the average to every search result", async () => {
      const other = await addRecipe("Lentil Dahl", householdId, alice);
      await saveReview(recipeId, alice, householdId, { stars: 5 });

      const byId = new Map(
        (await searchRecipes({ householdId })).map((r) => [r.id, r]),
      );

      expect(byId.get(recipeId)?.reviews).toEqual({ average: 5, count: 1 });
      // Unreviewed recipes still carry a summary, so no page has to guard
      // against it being undefined.
      expect(byId.get(other)?.reviews).toEqual({ average: null, count: 0 });
    });
  });
});

async function addUser(
  id: string,
  name: string,
  householdId: string,
): Promise<string> {
  const user = await prisma.user.create({
    data: {
      id,
      name,
      email: `${id}@example.com`,
      emailVerified: true,
      updatedAt: new Date(),
      householdId,
    },
  });
  return user.id;
}

function addRecipe(
  title: string,
  householdId: string,
  createdById: string,
): Promise<string> {
  return createRecipe(
    recipeInput.parse({
      title,
      instructions: ["Cook"],
      ingredients: [],
      tags: [],
    }),
    householdId,
    createdById,
  );
}
