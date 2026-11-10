import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Hiding a household, reporting shared content, and deleting an account:
 * what Apple asks of an app where people see each other's content (1.2) and
 * one where they can make an account (5.1.1(v)). Against the database, since
 * every rule here is a query.
 */
const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@/lib/email", () => ({
  emailAvailable: () => true,
  getEmailSender: () => ({ send: mocks.send }),
}));

const { prisma } = await import("@/lib/db");
const { deleteAccount, deletionPreview } =
  await import("@/lib/account-deletion");
const {
  hideHousehold,
  listHiddenHouseholds,
  listOpenReports,
  reportContent,
  resolveReport,
  showHousehold,
} = await import("@/lib/moderation");
const { addPantryItem } = await import("@/lib/pantry");
const { createRecipe, setRecipeShared } =
  await import("@/lib/recipe-mutations");
const { recipeInput } = await import("@/lib/recipe-schema");
const { getRecipe, searchRecipes } = await import("@/lib/recipes");
const { getReviewSummary, listReviews, saveReview } =
  await import("@/lib/reviews");
const { makeHousehold, makeUser, resetDatabase } = await import("./support/db");

type Kitchen = { householdId: string; userId: string };

const add = async (kitchen: Kitchen, title: string, shared = true) => {
  const id = await createRecipe(
    recipeInput.parse({
      title,
      instructions: ["Cook"],
      ingredients: [{ name: "butter", quantity: 1, unit: "tbsp" }],
    }),
    kitchen.householdId,
    kitchen.userId,
  );
  if (shared) await setRecipeShared(id, kitchen.householdId, true);
  return id;
};

let ours: Kitchen;
let theirs: Kitchen;

beforeEach(async () => {
  await resetDatabase();
  mocks.send.mockReset().mockResolvedValue({ ok: true });
  process.env.ADMIN_EMAILS = "admin@example.com";
  ours = await makeHousehold("Ours");
  theirs = await makeHousehold("Theirs");
});

afterAll(async () => {
  await resetDatabase();
  await prisma.$disconnect();
});

describe("hiding a household", () => {
  it("takes its shared recipes out of the library, search and direct links", async () => {
    const soup = await add(theirs, "Their Soup");
    await hideHousehold(ours.householdId, theirs.householdId);

    expect(await getRecipe(soup, ours.householdId)).toBeNull();
    const found = await searchRecipes({
      householdId: ours.householdId,
      query: "soup",
    });
    expect(found.map((r) => r.id)).not.toContain(soup);
  });

  it("never hides a household's own recipes from itself", async () => {
    const soup = await add(theirs, "Their Soup");
    await hideHousehold(ours.householdId, theirs.householdId);
    expect(await getRecipe(soup, theirs.householdId)).not.toBeNull();
    expect(await hideHousehold(ours.householdId, ours.householdId)).toBe(false);
  });

  it("leaves other households' view alone", async () => {
    const third = await makeHousehold("Third");
    const soup = await add(theirs, "Their Soup");
    await hideHousehold(ours.householdId, theirs.householdId);
    expect(await getRecipe(soup, third.householdId)).not.toBeNull();
  });

  it("takes its members' reviews out of the list and the average", async () => {
    const pie = await add(ours, "Our Pie");
    await saveReview(pie, ours.userId, ours.householdId, {
      stars: 5,
      body: "Lovely",
    });
    await saveReview(pie, theirs.userId, theirs.householdId, {
      stars: 1,
      body: "Rude words",
    });
    await hideHousehold(ours.householdId, theirs.householdId);

    const reviews = await listReviews(pie, ours.householdId);
    expect(reviews.map((r) => r.body)).toEqual(["Lovely"]);
    expect(await getReviewSummary(pie, ours.householdId)).toEqual({
      average: 5,
      count: 1,
    });
  });

  it("can be undone", async () => {
    const soup = await add(theirs, "Their Soup");
    await hideHousehold(ours.householdId, theirs.householdId);
    expect(await listHiddenHouseholds(ours.householdId)).toMatchObject([
      { id: theirs.householdId, name: "Theirs" },
    ]);
    await showHousehold(ours.householdId, theirs.householdId);
    expect(await listHiddenHouseholds(ours.householdId)).toEqual([]);
    expect(await getRecipe(soup, ours.householdId)).not.toBeNull();
  });
});

describe("reporting", () => {
  it("files a report on another household's shared recipe and emails the admins", async () => {
    const soup = await add(theirs, "Their Soup");
    const ok = await reportContent(
      { id: ours.userId, householdId: ours.householdId },
      { recipeId: soup, reason: "OFFENSIVE", note: "  Not nice  " },
    );
    expect(ok).toBe(true);

    const [report] = await listOpenReports();
    expect(report).toMatchObject({
      reason: "Offensive or abusive",
      note: "Not nice",
      recipe: { id: soup, household: "Theirs", isShared: true },
    });
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "admin@example.com",
        text: expect.stringContaining(
          'the recipe "Their Soup", shared by Theirs',
        ),
      }),
    );
  });

  it("refuses your own recipe, and one you cannot see", async () => {
    const mine = await add(ours, "Our Soup");
    const privateOne = await add(theirs, "Their Secret", false);
    for (const recipeId of [mine, privateOne]) {
      expect(
        await reportContent(
          { id: ours.userId, householdId: ours.householdId },
          { recipeId, reason: "OTHER" },
        ),
      ).toBe(false);
    }
    expect(await listOpenReports()).toEqual([]);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("refuses an unknown reason", async () => {
    const soup = await add(theirs, "Their Soup");
    await expect(
      reportContent(
        { id: ours.userId, householdId: ours.householdId },
        { recipeId: soup, reason: "BORED" },
      ),
    ).rejects.toThrow();
  });

  it("reports a review from another household, and an admin can delete it", async () => {
    const pie = await add(ours, "Our Pie");
    await saveReview(pie, theirs.userId, theirs.householdId, {
      stars: 1,
      body: "Rude words",
    });
    const [review] = await listReviews(pie, ours.householdId);
    await reportContent(
      { id: ours.userId, householdId: ours.householdId },
      { reviewId: review.id, reason: "OFFENSIVE" },
    );

    const [report] = await listOpenReports();
    expect(report.review).toMatchObject({ body: "Rude words", author: "Cook" });
    await resolveReport(report.id, "deleteReview");
    expect(await listReviews(pie, ours.householdId)).toEqual([]);
    expect(await listOpenReports()).toEqual([]);
  });

  it("lets an admin take a recipe out of the shared library, closing every report on it", async () => {
    const soup = await add(theirs, "Their Soup");
    const third = await makeHousehold("Third");
    for (const reporter of [ours, third]) {
      await reportContent(
        { id: reporter.userId, householdId: reporter.householdId },
        { recipeId: soup, reason: "COPYRIGHT" },
      );
    }
    const [first] = await listOpenReports();
    await resolveReport(first.id, "unshare");

    expect(await listOpenReports()).toEqual([]);
    expect(await getRecipe(soup, ours.householdId)).toBeNull();
    // Its own household keeps it.
    expect(await getRecipe(soup, theirs.householdId)).not.toBeNull();
  });
});

describe("deleting an account", () => {
  it("hands a leaving member's rows to the family, which keeps everything", async () => {
    const partner = await makeUser(ours.householdId);
    const pie = await add(
      { householdId: ours.householdId, userId: partner },
      "Pie",
    );
    await addPantryItem("Flour", ours.householdId, partner);
    await saveReview(pie, partner, ours.householdId, { stars: 4, body: null });

    expect(await deletionPreview(partner)).toMatchObject({ lastMember: false });
    await deleteAccount(partner);

    expect(await prisma.user.findUnique({ where: { id: partner } })).toBeNull();
    const kept = await prisma.recipe.findUnique({ where: { id: pie } });
    expect(kept?.createdById).toBe(ours.userId);
    expect(
      await prisma.pantryItem.count({
        where: { householdId: ours.householdId },
      }),
    ).toBe(1);
    // Their own opinion goes with them.
    expect(await getReviewSummary(pie, ours.householdId)).toEqual({
      average: null,
      count: 0,
    });
  });

  it("takes the household, and what it shared, with the last one out", async () => {
    const soup = await add(theirs, "Their Soup");
    await add(theirs, "Their Notes", false);

    expect(await deletionPreview(theirs.userId)).toEqual({
      lastMember: true,
      recipes: 2,
      sharedRecipes: 1,
    });
    await deleteAccount(theirs.userId);

    expect(
      await prisma.household.findUnique({ where: { id: theirs.householdId } }),
    ).toBeNull();
    expect(
      await prisma.user.findUnique({ where: { id: theirs.userId } }),
    ).toBeNull();
    expect(await getRecipe(soup, ours.householdId)).toBeNull();
    // Nobody else's household is touched.
    expect(
      await prisma.household.findUnique({ where: { id: ours.householdId } }),
    ).not.toBeNull();
  });

  it("keeps a report standing when the reporter's account goes", async () => {
    const soup = await add(theirs, "Their Soup");
    const partner = await makeUser(ours.householdId);
    await reportContent(
      { id: partner, householdId: ours.householdId },
      { recipeId: soup, reason: "OTHER" },
    );
    await deleteAccount(partner);
    const [report] = await listOpenReports();
    expect(report.reporter).toBeNull();
  });
});
