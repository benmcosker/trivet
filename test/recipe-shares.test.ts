import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { weekStartOf } from "@/lib/grocery";
import { resolveReport } from "@/lib/moderation";
import { plannerLibrary } from "@/lib/plan-mutations";
import { createRecipe, setRecipeShared } from "@/lib/recipe-mutations";
import { recipeInput } from "@/lib/recipe-schema";
import {
  LOOKUPS_PER_HOUR,
  listSharedWith,
  removeSharedWithUs,
  shareWithHousehold,
  stopSharingWith,
} from "@/lib/recipe-shares";
import { libraryEmails } from "@/lib/recipe-visibility";
import { getRecipe, searchRecipes } from "@/lib/recipes";

import {
  makeHousehold,
  resetDatabase as reset,
  treatAsLibrary,
} from "./support/db";

const hasDb = Boolean(process.env.DATABASE_URL);

describe("libraryEmails", () => {
  it("is LIBRARY_EMAILS, read like ADMIN_EMAILS", () => {
    expect(
      libraryEmails({ LIBRARY_EMAILS: ' "Ben@Example.com", b@x.com ' }),
    ).toEqual(["ben@example.com", "b@x.com"]);
  });

  it("falls back to the admins, whose household holds the library", () => {
    expect(libraryEmails({ ADMIN_EMAILS: "ben@example.com" })).toEqual([
      "ben@example.com",
    ]);
    expect(libraryEmails({})).toEqual([]);
  });
});

describe.skipIf(!hasDb)("sharing", () => {
  type H = { householdId: string; userId: string };
  let library: H;
  let ours: H;
  let friends: H;
  let strangers: H;
  const week = weekStartOf(new Date());

  const recipe = (householdId: string, userId: string, title: string) =>
    createRecipe(
      recipeInput.parse({
        title,
        course: "DINNER",
        instructions: ["Cook"],
        ingredients: [],
        tags: [],
      }),
      householdId,
      userId,
    );

  /** Whether a household can find a recipe by each way the app reads one. */
  const reaches = async (householdId: string, id: string, query: string) => {
    const [page, search, planner] = await Promise.all([
      getRecipe(id, householdId),
      searchRecipes({ householdId, query }),
      plannerLibrary(householdId, week),
    ]);
    return {
      page: page !== null,
      search: search.some((r) => r.id === id),
      planner: planner.some((r) => r.id === id),
    };
  };
  const everywhere = { page: true, search: true, planner: true };
  const nowhere = { page: false, search: false, planner: false };

  beforeEach(async () => {
    await reset();
    library = await makeHousehold("Library");
    ours = await makeHousehold("Ours");
    friends = await makeHousehold("Friends");
    strangers = await makeHousehold("Strangers");
    await treatAsLibrary(library.householdId);
  });

  afterAll(async () => {
    await reset();
    await prisma.$disconnect();
  });

  const emailOf = async (h: H) =>
    (await prisma.user.findUniqueOrThrow({ where: { id: h.userId } })).email;

  describe("with every household", () => {
    it("is the base library's alone", async () => {
      const base = await recipe(library.householdId, library.userId, "Ragu");
      expect(await setRecipeShared(base, library.householdId, true)).toBe(true);
      expect(await reaches(ours.householdId, base, "ragu")).toEqual(everywhere);

      const mine = await recipe(ours.householdId, ours.userId, "Stew");
      expect(await setRecipeShared(mine, ours.householdId, true)).toBe(false);
      expect(await reaches(friends.householdId, mine, "stew")).toEqual(nowhere);
    });

    it("can still be taken back by a household that shared before the rule", async () => {
      const mine = await recipe(ours.householdId, ours.userId, "Stew");
      await prisma.recipe.update({
        where: { id: mine },
        data: { isShared: true },
      });
      // Not the library, so nobody else sees it even though it is marked...
      expect(await reaches(friends.householdId, mine, "stew")).toEqual(nowhere);
      // ...and the owner can clear the mark.
      expect(await setRecipeShared(mine, ours.householdId, false)).toBe(true);
    });
  });

  describe("with one household", () => {
    let stew: string;

    beforeEach(async () => {
      stew = await recipe(ours.householdId, ours.userId, "Stew");
    });

    it("reaches that household everywhere, and nobody else", async () => {
      const result = await shareWithHousehold(
        stew,
        ours.householdId,
        (await emailOf(friends)).toUpperCase(),
      );
      expect(result).toEqual({
        ok: true,
        household: { householdId: friends.householdId, name: "Friends" },
      });
      expect(await reaches(friends.householdId, stew, "stew")).toEqual(
        everywhere,
      );
      expect(await reaches(strangers.householdId, stew, "stew")).toEqual(
        nowhere,
      );
      expect(await listSharedWith(stew, ours.householdId)).toEqual([
        { householdId: friends.householdId, name: "Friends" },
      ]);
    });

    it("stops when the owner stops it, or the other household removes it", async () => {
      await shareWithHousehold(stew, ours.householdId, await emailOf(friends));
      await stopSharingWith(stew, ours.householdId, friends.householdId);
      expect(await reaches(friends.householdId, stew, "stew")).toEqual(nowhere);

      await shareWithHousehold(stew, ours.householdId, await emailOf(friends));
      await removeSharedWithUs(stew, friends.householdId);
      expect(await reaches(friends.householdId, stew, "stew")).toEqual(nowhere);
    });

    it("cannot be done with someone else's recipe, or stopped by a stranger", async () => {
      const theirs = await shareWithHousehold(
        stew,
        strangers.householdId,
        await emailOf(strangers),
      );
      expect(theirs.ok).toBe(false);

      await shareWithHousehold(stew, ours.householdId, await emailOf(friends));
      await stopSharingWith(stew, strangers.householdId, friends.householdId);
      expect((await reaches(friends.householdId, stew, "stew")).page).toBe(
        true,
      );
    });

    it("says so for an unknown address, your own household, and a hidden one", async () => {
      expect(
        await shareWithHousehold(stew, ours.householdId, "nobody@example.com"),
      ).toEqual({ ok: false, error: "Nobody on Trivet has that address." });
      expect(
        await shareWithHousehold(stew, ours.householdId, await emailOf(ours)),
      ).toEqual({ ok: false, error: "That address is in your own household." });

      // Either side's hiding ends it, and reads as an unknown address.
      await prisma.householdBlock.create({
        data: { blockerId: friends.householdId, blockedId: ours.householdId },
      });
      expect(
        await shareWithHousehold(
          stew,
          ours.householdId,
          await emailOf(friends),
        ),
      ).toEqual({ ok: false, error: "Nobody on Trivet has that address." });
    });

    it("leaves a household that hides the owner, though shared before", async () => {
      await shareWithHousehold(stew, ours.householdId, await emailOf(friends));
      await prisma.householdBlock.create({
        data: { blockerId: friends.householdId, blockedId: ours.householdId },
      });
      expect(await reaches(friends.householdId, stew, "stew")).toEqual(nowhere);
    });

    it("keeps a photo that came with the source at home", async () => {
      const imported = await createRecipe(
        recipeInput.parse({
          title: "Piccata",
          instructions: ["Cook"],
          ingredients: [],
          tags: [],
        }),
        ours.householdId,
        ours.userId,
        { source: "URL", imageUrl: "https://example.test/site.jpg" },
      );
      await shareWithHousehold(
        imported,
        ours.householdId,
        await emailOf(friends),
      );
      expect((await getRecipe(imported, friends.householdId))?.imageUrl).toBe(
        null,
      );
    });

    it("is taken away from everyone when an admin removes a reported recipe", async () => {
      await shareWithHousehold(stew, ours.householdId, await emailOf(friends));
      const report = await prisma.contentReport.create({
        data: {
          recipeId: stew,
          reporterId: friends.userId,
          reason: "COPYRIGHT",
        },
      });
      await resolveReport(report.id, "unshare");
      expect(await reaches(friends.householdId, stew, "stew")).toEqual(nowhere);
    });

    it(`allows ${LOOKUPS_PER_HOUR} addresses an hour`, async () => {
      for (let i = 0; i < LOOKUPS_PER_HOUR; i++) {
        await shareWithHousehold(stew, ours.householdId, `n${i}@example.com`);
      }
      const over = await shareWithHousehold(
        stew,
        ours.householdId,
        await emailOf(friends),
      );
      expect(over.ok).toBe(false);
      await prisma.rateLimit.deleteMany();
    });
  });
});
