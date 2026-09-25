import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { findRecipeBySourceHash, findSimilarlyTitled } from "@/lib/duplicates";
import { getWeeklySkips, getWeekPlan, weekStartOf } from "@/lib/grocery";
import {
  defaultHouseholdName,
  defaultServingsFor,
  getHousehold,
  setDefaultServings,
} from "@/lib/household";
import { createInvite, redeemInvite } from "@/lib/invites";
import { addPantryItem, listPantryItems, removePantryItem } from "@/lib/pantry";
import {
  createRecipe,
  deleteRecipe,
  listTagsWithCounts,
  setRecipeShared,
  updateRecipe,
} from "@/lib/recipe-mutations";
import { recipeInput } from "@/lib/recipe-schema";
import { setRecipeImage } from "@/lib/recipe-image";
import { getRecipe, searchRecipes } from "@/lib/recipes";
import { getReviewSummary, saveReview } from "@/lib/reviews";

import { makeHousehold, makeUser, resetDatabase as reset } from "./support/db";

const hasDb = Boolean(process.env.DATABASE_URL);

describe("defaultHouseholdName", () => {
  it("names it after whoever it was made for", () => {
    expect(defaultHouseholdName("Ben")).toBe("Ben's Household");
  });

  it("does not double the s on a name that ends in one", () => {
    expect(defaultHouseholdName("Chris")).toBe("Chris' Household");
  });

  it("falls back when there is no name to use", () => {
    expect(defaultHouseholdName("   ")).toBe("My Household");
  });
});

describe.skipIf(!hasDb)("how many a household cooks for", () => {
  let home: { householdId: string; userId: string };

  beforeEach(async () => {
    await reset();
    home = await makeHousehold("Ours");
  });

  it("has no answer until somebody gives one", async () => {
    // Null and four are different answers: one is "we are four" and the other
    // is "nobody has been asked", which plans each dish for what it makes.
    expect(await defaultServingsFor(home.householdId)).toBeNull();
    expect((await getHousehold(home.householdId))?.defaultServings).toBeNull();
  });

  it("remembers the number it was given", async () => {
    await setDefaultServings(home.householdId, 6);
    expect(await defaultServingsFor(home.householdId)).toBe(6);
  });

  it("can be told to stop answering", async () => {
    await setDefaultServings(home.householdId, 6);
    await setDefaultServings(home.householdId, null);
    expect(await defaultServingsFor(home.householdId)).toBeNull();
  });

  it.each([
    [40, 8],
    [0, 1],
    [-3, 1],
    [6.7, 6],
  ])("brings %j inside the cap as %i", async (given, expected) => {
    // A default of forty would reach the planner as forty and be clamped
    // there one dish at a time, leaving a number on the household page that
    // nothing else agrees with.
    expect(await setDefaultServings(home.householdId, given)).toBe(expected);
    expect(await defaultServingsFor(home.householdId)).toBe(expected);
  });
});

describe.skipIf(!hasDb)("two households", () => {
  let ours: { householdId: string; userId: string };
  let theirs: { householdId: string; userId: string };

  beforeEach(async () => {
    await reset();
    ours = await makeHousehold("Ours");
    theirs = await makeHousehold("Theirs");
  });

  afterAll(async () => {
    await reset();
    await prisma.$disconnect();
  });

  const add = (
    household: { householdId: string; userId: string },
    title: string,
    extra: Parameters<typeof createRecipe>[3] = {},
  ) =>
    createRecipe(
      recipeInput.parse({
        title,
        instructions: ["Cook"],
        ingredients: [{ name: "butter", quantity: 1, unit: "tbsp" }],
        tags: ["Weeknight"],
      }),
      household.householdId,
      household.userId,
      extra,
    );

  /** Put a recipe into the shared part of the library. */
  const share = (id: string) =>
    prisma.recipe.update({ where: { id }, data: { isShared: true } });

  describe("the hybrid library", () => {
    it("keeps a household's own recipes to itself until they are shared", async () => {
      await add(ours, "Our Piccata");
      await add(theirs, "Their Dahl");

      expect(
        (await searchRecipes({ householdId: ours.householdId })).map(
          (r) => r.title,
        ),
      ).toEqual(["Our Piccata"]);
      expect(
        (await searchRecipes({ householdId: theirs.householdId })).map(
          (r) => r.title,
        ),
      ).toEqual(["Their Dahl"]);
    });

    it("mixes a shared recipe into the other household's library", async () => {
      await add(ours, "Our Piccata");
      await share(await add(theirs, "Their Dahl"));

      // Mixed in and sorted with the rest, not held in a section of its own.
      expect(
        (await searchRecipes({ householdId: ours.householdId }))
          .map((r) => r.title)
          .sort(),
      ).toEqual(["Our Piccata", "Their Dahl"]);
    });

    it("does not find a private recipe by any search term", async () => {
      await add(theirs, "Their Dahl");

      for (const query of ["dahl", "butter", "weeknight"]) {
        expect(
          await searchRecipes({ householdId: ours.householdId, query }),
        ).toHaveLength(0);
      }
    });

    it("finds a shared one by the same terms", async () => {
      await share(await add(theirs, "Their Dahl"));

      for (const query of ["dahl", "butter", "weeknight"]) {
        expect(
          await searchRecipes({ householdId: ours.householdId, query }),
        ).toHaveLength(1);
      }
    });

    it("answers a private recipe's id with nothing, as a wrong id would", async () => {
      const id = await add(theirs, "Their Dahl");

      // The page turns null into a 404 either way, so an id somebody guessed
      // cannot be told apart from an id that does not exist.
      expect(await getRecipe(id, ours.householdId)).toBeNull();
      expect(await getRecipe(id, theirs.householdId)).not.toBeNull();
    });

    it("opens a shared recipe by id", async () => {
      const id = await share(await add(theirs, "Their Dahl"));
      expect((await getRecipe(id.id, ours.householdId))?.title).toBe(
        "Their Dahl",
      );
    });

    it("counts tags over what the household can see", async () => {
      await add(ours, "Our Piccata");
      await add(theirs, "Their Dahl");

      // Both carry the Weeknight tag, but one of them is not ours to count -
      // and the number would say how many recipes sit behind a closed door.
      expect(
        (await listTagsWithCounts(ours.householdId)).map((t) => [
          t.name,
          t.count,
        ]),
      ).toEqual([["Weeknight", 1]]);

      await share(await add(theirs, "Their Tagine"));
      expect(
        (await listTagsWithCounts(ours.householdId)).map((t) => [
          t.name,
          t.count,
        ]),
      ).toEqual([["Weeknight", 2]]);
    });

    it("lets two households own the same card without calling it a duplicate", async () => {
      // A widely printed card is not a duplicate of anything, and the old
      // global constraint answered the second family with the existence of a
      // recipe they could not see.
      const sourceFileSha256 = "a".repeat(64);
      await add(theirs, "Piccata", { source: "PDF", sourceFileSha256 });

      expect(
        await findRecipeBySourceHash(sourceFileSha256, ours.householdId),
      ).toBeNull();
      await expect(
        add(ours, "Piccata", { source: "PDF", sourceFileSha256 }),
      ).resolves.toBeTruthy();
    });

    it("still refuses the same card twice within one household", async () => {
      const sourceFileSha256 = "b".repeat(64);
      await add(ours, "Piccata", { source: "PDF", sourceFileSha256 });

      expect(
        (await findRecipeBySourceHash(sourceFileSha256, ours.householdId))
          ?.title,
      ).toBe("Piccata");
      await expect(
        add(ours, "Piccata again", { source: "PDF", sourceFileSha256 }),
      ).rejects.toThrow();
    });

    it("does not warn about a title it will not show", async () => {
      await add(theirs, "Chicken Piccata");
      expect(
        await findSimilarlyTitled("Chicken Piccata", ours.householdId),
      ).toHaveLength(0);

      await share(await add(theirs, "Chicken Piccata Two"));
      expect(
        await findSimilarlyTitled("Chicken Piccata", ours.householdId),
      ).toHaveLength(1);
    });
  });

  describe("who may share a recipe", () => {
    it("lets the owning household share and unshare it", async () => {
      const id = await add(ours, "Our Piccata");

      expect(await setRecipeShared(id, ours.householdId, true)).toBe(true);
      expect(
        (await searchRecipes({ householdId: theirs.householdId })).map(
          (r) => r.title,
        ),
      ).toEqual(["Our Piccata"]);

      expect(await setRecipeShared(id, ours.householdId, false)).toBe(true);
      expect(
        await searchRecipes({ householdId: theirs.householdId }),
      ).toHaveLength(0);
    });

    it("refuses to share a recipe another household added", async () => {
      const id = await add(theirs, "Their Dahl");

      expect(await setRecipeShared(id, ours.householdId, true)).toBe(false);
      expect(
        await searchRecipes({ householdId: ours.householdId }),
      ).toHaveLength(0);
    });

    it("refuses to unshare somebody else's shared recipe", async () => {
      // The other direction matters just as much: a recipe two households are
      // cooking from is not ours to withdraw.
      const id = await add(theirs, "Their Dahl");
      await share(id);

      expect(await setRecipeShared(id, ours.householdId, false)).toBe(false);
      expect(
        await searchRecipes({ householdId: ours.householdId }),
      ).toHaveLength(1);
    });

    it("leaves a week already planned alone when it is unshared", async () => {
      /*
       * Un-sharing is not retroactive. Pulling dinner out of somebody's week
       * days later, because another family changed its mind, is worse than the
       * recipe staying readable to the few who had committed to cooking it.
       */
      const id = await add(theirs, "Their Dahl");
      await share(id);

      const monday = weekStartOf(new Date("2026-09-07T12:00:00.000Z"));
      await prisma.plannedMeal.create({
        data: {
          date: monday,
          slot: "DINNER",
          servings: 4,
          recipeId: id,
          householdId: ours.householdId,
        },
      });

      await setRecipeShared(id, theirs.householdId, false);

      const plan = await getWeekPlan(monday, ours.householdId);
      expect(plan).toHaveLength(1);
      expect(plan[0].recipe?.title).toBe("Their Dahl");
    });
  });

  describe("who may change a recipe", () => {
    it("refuses to edit a recipe another household added", async () => {
      // Everyone reads the library; only the family who put a card in it can
      // reword the card everybody else cooks from.
      const id = await add(theirs, "Their Dahl");

      const edited = await updateRecipe(
        id,
        ours.householdId,
        recipeInput.parse({
          title: "Hijacked",
          instructions: ["Cook"],
          ingredients: [],
          tags: [],
        }),
      );
      expect(edited).toBe(false);
      expect((await getRecipe(id, theirs.householdId))?.title).toBe(
        "Their Dahl",
      );
    });

    it("refuses to delete a recipe another household added", async () => {
      // A delete is not a private act here: it takes the recipe away from
      // everybody, including whoever planned it for Thursday.
      const id = await add(theirs, "Their Dahl");

      expect(await deleteRecipe(id, ours.householdId)).toBe(false);
      expect(await getRecipe(id, theirs.householdId)).not.toBeNull();
    });

    it("refuses to change the photo on another household's recipe", async () => {
      // The picture is part of the card everybody cooks from, so it follows
      // the same rule as the words.
      const id = await add(theirs, "Their Dahl");

      await expect(
        setRecipeImage(
          id,
          ours.householdId,
          new Uint8Array([1, 2, 3]),
          "photo.jpg",
          "image/jpeg",
        ),
      ).rejects.toThrow(/No such recipe/);
    });

    it("lets the household that added it edit and delete it", async () => {
      const id = await add(ours, "Our Piccata");

      expect(
        await updateRecipe(
          id,
          ours.householdId,
          recipeInput.parse({
            title: "Our Better Piccata",
            instructions: ["Cook"],
            ingredients: [],
            tags: [],
          }),
        ),
      ).toBe(true);
      expect((await getRecipe(id, ours.householdId))?.title).toBe(
        "Our Better Piccata",
      );
      expect(await deleteRecipe(id, ours.householdId)).toBe(true);
    });
  });

  describe("the week", () => {
    const monday = weekStartOf(new Date("2026-03-04T12:00:00.000Z"));

    const plan = (household: { householdId: string }, recipeId: string) =>
      prisma.plannedMeal.create({
        data: {
          householdId: household.householdId,
          date: monday,
          slot: "DINNER",
          recipeId,
          servings: 4,
        },
      });

    it("lets both households book the same Tuesday dinner", async () => {
      // The constraint that made the app single-family: one row per (date,
      // slot) in the entire database. Two families sharing a calendar slot is
      // the ordinary case, not a conflict.
      await plan(ours, await add(ours, "Our Piccata"));
      await expect(
        plan(theirs, await add(theirs, "Their Dahl")),
      ).resolves.toBeTruthy();
    });

    it("shows each household only its own week", async () => {
      await plan(ours, await add(ours, "Our Piccata"));
      await plan(theirs, await add(theirs, "Their Dahl"));

      const ourWeek = await getWeekPlan(monday, ours.householdId);
      expect(ourWeek.map((m) => m.recipe?.title)).toEqual(["Our Piccata"]);
    });

    it("keeps this week's skips apart", async () => {
      await prisma.weeklySkip.create({
        data: {
          householdId: theirs.householdId,
          createdById: theirs.userId,
          name: "Milk",
          normalisedName: "milk",
          weekStart: monday,
        },
      });

      expect(await getWeeklySkips(monday, ours.householdId)).toEqual([]);
      expect(await getWeeklySkips(monday, theirs.householdId)).toHaveLength(1);
    });
  });

  describe("the pantry", () => {
    it("lets both households keep the same staple in", async () => {
      await addPantryItem("Olive oil", ours.householdId, ours.userId);
      const other = await addPantryItem(
        "Olive oil",
        theirs.householdId,
        theirs.userId,
      );
      expect(other.ok).toBe(true);
    });

    it("shows each household only its own", async () => {
      await addPantryItem("Olive oil", ours.householdId, ours.userId);
      await addPantryItem("Gochujang", theirs.householdId, theirs.userId);

      expect((await listPantryItems(ours.householdId)).map((i) => i.name)) //
        .toEqual(["Olive oil"]);
    });

    it("refuses to remove another household's staple", async () => {
      const added = await addPantryItem(
        "Gochujang",
        theirs.householdId,
        theirs.userId,
      );
      if (!added.ok) throw new Error("setup failed");

      await removePantryItem(added.item.id, ours.householdId);
      expect(await listPantryItems(theirs.householdId)).toHaveLength(1);
    });
  });

  describe("reviews", () => {
    it("pools opinions from every household that can see the recipe", async () => {
      // The reason sharing carries the rating with it: an average over one
      // family's verdicts says much less than one over everybody who cooked it.
      const id = await add(ours, "Our Piccata");
      await share(id);

      await saveReview(id, ours.userId, ours.householdId, {
        stars: 5,
        body: null,
      });
      await saveReview(id, theirs.userId, theirs.householdId, {
        stars: 3,
        body: null,
      });

      expect(await getReviewSummary(id)).toEqual({ average: 4, count: 2 });
    });

    it("refuses a review on a recipe the household cannot see", async () => {
      // Otherwise a guessed id moves the average on a dish somebody cannot
      // read, and the response tells them it is there.
      const id = await add(ours, "Our Piccata");

      await expect(
        saveReview(id, theirs.userId, theirs.householdId, {
          stars: 1,
          body: null,
        }),
      ).rejects.toThrow(/No such recipe/);
      expect(await getReviewSummary(id)).toEqual({ average: null, count: 0 });
    });

    it("still refuses a review on a recipe that does not exist", async () => {
      await expect(
        saveReview("no-such-recipe", ours.userId, ours.householdId, {
          stars: 1,
          body: null,
        }),
      ).rejects.toThrow(/No such recipe/);
    });

    it("lets every member of a household review its own recipes", async () => {
      const id = await add(ours, "Our Piccata");
      const partner = await makeUser(ours.householdId);

      await saveReview(id, ours.userId, ours.householdId, {
        stars: 5,
        body: null,
      });
      await saveReview(id, partner, ours.householdId, { stars: 3, body: null });

      expect(await getReviewSummary(id)).toEqual({ average: 4, count: 2 });
    });
  });

  describe("invites", () => {
    it("puts a family invite's redeemer in the sender's household", async () => {
      const { code } = await createInvite({
        createdById: ours.userId,
        householdId: ours.householdId,
      });

      const joiner = await newAccount("joiner");
      expect(await redeemInvite(code, joiner)).toBe(true);

      const detail = await getHousehold(ours.householdId);
      expect(detail?.members.map((m) => m.id)).toContain(joiner);
    });

    it("gives an outside invite's redeemer a household of their own", async () => {
      const { code } = await createInvite({
        createdById: ours.userId,
        householdId: null,
      });

      const stranger = await newAccount("stranger", "Dana");
      expect(await redeemInvite(code, stranger)).toBe(true);

      const placed = await prisma.user.findUnique({
        where: { id: stranger },
        select: { household: { select: { id: true, name: true } } },
      });
      expect(placed?.household?.id).not.toBe(ours.householdId);
      expect(placed?.household?.name).toBe("Dana's Household");
    });

    it("shares the library but not the week with an outside invite", async () => {
      await add(ours, "Our Piccata");
      await addPantryItem("Gochujang", ours.householdId, ours.userId);

      const { code } = await createInvite({
        createdById: ours.userId,
        householdId: null,
      });
      const stranger = await newAccount("stranger");
      await redeemInvite(code, stranger);

      const placed = await prisma.user.findUnique({
        where: { id: stranger },
        select: { householdId: true },
      });

      // A household of their own, and an empty library to start: they see a
      // recipe of ours only once we have shared it.
      const strangerHousehold = placed!.householdId!;
      expect(
        await searchRecipes({ householdId: strangerHousehold }),
      ).toHaveLength(0);
      // They do not inherit the pantry, and so not the shopping list either.
      expect(await listPantryItems(strangerHousehold)).toEqual([]);
    });

    it("names the new household when the sender chose a name", async () => {
      const { code } = await createInvite({
        createdById: ours.userId,
        householdId: null,
        householdName: "The Smiths",
      });

      const smith = await newAccount("smith", "Pat");
      await redeemInvite(code, smith);

      const placed = await prisma.user.findUnique({
        where: { id: smith },
        select: { household: { select: { name: true } } },
      });
      expect(placed?.household?.name).toBe("The Smiths");
    });

    it("falls back to the redeemer's name when the sender left it blank", async () => {
      const { code } = await createInvite({
        createdById: ours.userId,
        householdId: null,
        householdName: "   ",
      });

      const pat = await newAccount("pat", "Pat");
      await redeemInvite(code, pat);

      const placed = await prisma.user.findUnique({
        where: { id: pat },
        select: { household: { select: { name: true } } },
      });
      expect(placed?.household?.name).toBe("Pat's Household");
    });

    it("ignores a name on a family invite, which already has one", async () => {
      const { code } = await createInvite({
        createdById: ours.userId,
        householdId: ours.householdId,
        householdName: "Something Else",
      });

      // Not merely unused at redemption - never stored. A name sitting on a
      // family invite would read, to anyone looking at the row later, as a
      // household that code was going to create.
      const stored = await prisma.invite.findUnique({
        where: { code },
        select: { householdName: true },
      });
      expect(stored?.householdName).toBeNull();

      const joiner = await newAccount("joiner-named");
      await redeemInvite(code, joiner);

      const placed = await prisma.user.findUnique({
        where: { id: joiner },
        select: { household: { select: { name: true } } },
      });
      expect(placed?.household?.name).toBe("Ours");
    });

    it("says which family a code joins before it is redeemed", async () => {
      const family = await createInvite({
        createdById: ours.userId,
        householdId: ours.householdId,
      });
      const outside = await createInvite({
        createdById: ours.userId,
        householdId: null,
      });

      const { checkInvite } = await import("@/lib/invites");
      const forFamily = await checkInvite(family.code);
      const forOutside = await checkInvite(outside.code);

      expect(forFamily.ok && forFamily.householdName).toBe("Ours");
      expect(forOutside.ok && forOutside.householdName).toBeNull();
    });

    it("leaves the code usable when only one of two racing signups wins", async () => {
      const { code } = await createInvite({
        createdById: ours.userId,
        householdId: ours.householdId,
      });

      const [first, second] = await Promise.all([
        newAccount("racer-one"),
        newAccount("racer-two"),
      ]);
      const results = await Promise.all([
        redeemInvite(code, first).catch(() => false),
        redeemInvite(code, second).catch(() => false),
      ]);

      expect(results.filter(Boolean)).toHaveLength(1);
    });
  });
});

/** An account with no household yet - what better-auth leaves behind. */
async function newAccount(id: string, name = "Newcomer"): Promise<string> {
  const user = await prisma.user.create({
    data: {
      id,
      name,
      email: `${id}@example.com`,
      emailVerified: true,
      updatedAt: new Date(),
    },
  });
  return user.id;
}
