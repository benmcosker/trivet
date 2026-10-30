import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/db";
import { combineHistory, historyLine, mealHistory } from "@/lib/meal-history";

import { makeHousehold, resetDatabase } from "./support/db";

const session = vi.hoisted(() => ({
  current: { id: "", householdId: "", householdName: "", name: "" },
}));
vi.mock("@/lib/session", () => ({
  requireHousehold: async () => session.current,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { cookedOnDate, markCookedAction } =
  await import("@/app/recipes/[id]/cook/actions");

const hasDb = Boolean(process.env.DATABASE_URL);
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("combineHistory", () => {
  it("counts planned and cooked days together, each day once", () => {
    const history = combineHistory(
      [
        { recipeId: "ragu", date: day("2026-09-01") },
        { recipeId: "ragu", date: day("2026-10-06") },
        { recipeId: null, date: day("2026-10-07") },
      ],
      [
        // Planned for the 6th and cooked from the planner that day: one meal.
        { recipeId: "ragu", date: day("2026-10-06") },
        // Cooked without being planned.
        { recipeId: "ragu", date: day("2026-10-20") },
        { recipeId: "dal", date: day("2026-08-15") },
      ],
    );
    expect(history.get("ragu")).toEqual({ count: 3, lastIso: "2026-10-20" });
    expect(history.get("dal")).toEqual({ count: 1, lastIso: "2026-08-15" });
    expect(history.size).toBe(2);
  });
});

describe("historyLine", () => {
  const today = "2026-10-30";

  it("says nothing for a dish never had", () => {
    expect(historyLine(undefined, today)).toBeNull();
  });

  it("reads as a sentence at every count", () => {
    expect(historyLine({ count: 1, lastIso: "2026-08-12" }, today)).toBe(
      "Made once, on 12 August.",
    );
    expect(historyLine({ count: 2, lastIso: "2026-08-12" }, today)).toBe(
      "Made twice, last on 12 August.",
    );
    expect(historyLine({ count: 9, lastIso: "2026-08-12" }, today)).toBe(
      "Made nine times, last on 12 August.",
    );
  });

  it("gives the year only when it is not this one", () => {
    expect(historyLine({ count: 4, lastIso: "2025-08-12" }, today)).toBe(
      "Made four times, last on 12 August 2025.",
    );
  });
});

describe("cookedOnDate", () => {
  // 01:30 UTC on the 31st is still the 30th in New York.
  const now = new Date("2026-10-31T01:30:00.000Z");

  it("takes the cook's own day, a day either side of the server", async () => {
    expect(await cookedOnDate("2026-10-30", now)).toBe("2026-10-30");
    expect(await cookedOnDate("2026-11-01", now)).toBe("2026-11-01");
  });

  it("falls back to the server's day for anything further or malformed", async () => {
    expect(await cookedOnDate("2026-10-01", now)).toBe("2026-10-31");
    expect(await cookedOnDate("yesterday", now)).toBe("2026-10-31");
  });
});

describe.skipIf(!hasDb)("recording and reading the history", () => {
  let ours: { householdId: string; userId: string };
  let theirs: { householdId: string; userId: string };
  let n = 0;

  const recipe = async (
    who: { householdId: string; userId: string },
    title: string,
    isShared = false,
  ) =>
    (
      await prisma.recipe.create({
        data: {
          publicId: `beef${String(++n).padStart(4, "0")}`,
          title,
          isShared,
          householdId: who.householdId,
          createdById: who.userId,
        },
        select: { id: true },
      })
    ).id;

  beforeEach(async () => {
    await resetDatabase();
    ours = await makeHousehold("Ours");
    theirs = await makeHousehold("Theirs");
    session.current = {
      id: ours.userId,
      householdId: ours.householdId,
      householdName: "",
      name: "",
    };
  });

  afterAll(async () => {
    await resetDatabase();
    await prisma.$disconnect();
  });

  const today = new Date().toISOString().slice(0, 10);

  it("records a dish cooked through, once a day however often Done is pressed", async () => {
    const ragu = await recipe(ours, "Ragu");

    expect(await markCookedAction(ragu, today)).toEqual({ recorded: true });
    expect(await markCookedAction(ragu, today)).toEqual({ recorded: false });

    expect(
      await prisma.cookedMeal.count({
        where: { householdId: ours.householdId },
      }),
    ).toBe(1);
  });

  it("records a shared recipe, but never another household's private one", async () => {
    const shared = await recipe(theirs, "Shared Soup", true);
    const secret = await recipe(theirs, "Family Secret");

    expect(await markCookedAction(shared, today)).toEqual({ recorded: true });
    expect(await markCookedAction(secret, today)).toEqual({ recorded: false });
    expect(await prisma.cookedMeal.count()).toBe(1);
  });

  it("reads planned and cooked together, and leaves out what is not yet eaten", async () => {
    const ragu = await recipe(ours, "Ragu");
    await prisma.plannedMeal.createMany({
      data: [
        {
          householdId: ours.householdId,
          date: day("2026-09-01"),
          slot: "DINNER",
          recipeId: ragu,
        },
        // Next week's plan: not history yet.
        {
          householdId: ours.householdId,
          date: day("2099-01-05"),
          slot: "DINNER",
          recipeId: ragu,
        },
      ],
    });
    await prisma.cookedMeal.create({
      data: {
        householdId: ours.householdId,
        recipeId: ragu,
        date: day("2026-10-20"),
      },
    });
    // Another household's meals are theirs.
    await prisma.cookedMeal.create({
      data: {
        householdId: theirs.householdId,
        recipeId: ragu,
        date: day("2026-10-25"),
      },
    });

    const history = await mealHistory(ours.householdId, {
      plannedBefore: day("2026-10-31"),
      recipeId: ragu,
    });
    expect(history.get(ragu)).toEqual({ count: 2, lastIso: "2026-10-20" });
  });
});
