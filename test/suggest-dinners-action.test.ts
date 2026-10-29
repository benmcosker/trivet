import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/db";

import { makeHousehold, resetDatabase } from "./support/db";

const session = vi.hoisted(() => ({
  current: { id: "", householdId: "", householdName: "", name: "" },
}));
vi.mock("@/lib/session", () => ({
  requireHousehold: async () => session.current,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { addSuggestedDinnersAction } =
  await import("@/app/plan/suggest-actions");

const hasDb = Boolean(process.env.DATABASE_URL);

const MONDAY = "2026-11-02";
const TUESDAY = "2026-11-03";
const WEDNESDAY = "2026-11-04";
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe.skipIf(!hasDb)("addSuggestedDinnersAction", () => {
  let ours: { householdId: string; userId: string };
  let theirs: { householdId: string; userId: string };
  let n = 0;

  const recipe = async (
    who: { householdId: string; userId: string },
    title: string,
    over: { isShared?: boolean; servings?: number } = {},
  ) =>
    (
      await prisma.recipe.create({
        data: {
          publicId: `cafe${String(++n).padStart(4, "0")}`,
          title,
          servings: over.servings ?? 4,
          isShared: over.isShared ?? false,
          householdId: who.householdId,
          createdById: who.userId,
        },
        select: { id: true },
      })
    ).id;

  const week = async () =>
    (
      await prisma.plannedMeal.findMany({
        where: { householdId: ours.householdId },
        orderBy: [{ date: "asc" }, { slot: "asc" }],
        select: { date: true, slot: true, recipeId: true, customTitle: true },
      })
    ).map((m) => ({ ...m, date: m.date.toISOString().slice(0, 10) }));

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

  it("plans each evening's first dinner", async () => {
    const ragu = await recipe(ours, "Ragu");
    const dal = await recipe(ours, "Dal");

    const result = await addSuggestedDinnersAction([
      { date: MONDAY, recipeId: ragu },
      { date: TUESDAY, recipeId: dal },
    ]);

    expect(result).toEqual({ added: 2 });
    expect(await week()).toEqual([
      { date: MONDAY, slot: "DINNER", recipeId: ragu, customTitle: null },
      { date: TUESDAY, slot: "DINNER", recipeId: dal, customTitle: null },
    ]);
  });

  it("never overwrites an evening somebody planned in the meantime", async () => {
    const ragu = await recipe(ours, "Ragu");
    const dal = await recipe(ours, "Dal");
    const tacos = await recipe(ours, "Tacos");
    // Monday got a dinner; Tuesday only a typed-in second dinner. Both are
    // evenings with a dinner on them now.
    await prisma.plannedMeal.createMany({
      data: [
        {
          householdId: ours.householdId,
          date: day(MONDAY),
          slot: "DINNER",
          recipeId: tacos,
        },
        {
          householdId: ours.householdId,
          date: day(TUESDAY),
          slot: "DINNER_2",
          customTitle: "Leftovers",
        },
      ],
    });

    const result = await addSuggestedDinnersAction([
      { date: MONDAY, recipeId: ragu },
      { date: TUESDAY, recipeId: dal },
      { date: WEDNESDAY, recipeId: dal },
    ]);

    expect(result).toEqual({ added: 1 });
    expect(await week()).toEqual([
      { date: MONDAY, slot: "DINNER", recipeId: tacos, customTitle: null },
      {
        date: TUESDAY,
        slot: "DINNER_2",
        recipeId: null,
        customTitle: "Leftovers",
      },
      { date: WEDNESDAY, slot: "DINNER", recipeId: dal, customTitle: null },
    ]);
  });

  it("will not plan another household's private recipe", async () => {
    const theirsPrivate = await recipe(theirs, "Family Secret");
    const theirsShared = await recipe(theirs, "Shared Soup", {
      isShared: true,
    });

    const result = await addSuggestedDinnersAction([
      { date: MONDAY, recipeId: theirsPrivate },
      { date: TUESDAY, recipeId: theirsShared },
    ]);

    expect(result).toEqual({ added: 1 });
    expect((await week()).map((m) => m.recipeId)).toEqual([theirsShared]);
  });

  it("plans for the household's number, as a single pick would", async () => {
    // Scaled up to the household, never below what the dish makes - the
    // same rule as picking one by hand.
    await prisma.household.update({
      where: { id: ours.householdId },
      data: { defaultServings: 6 },
    });
    const small = await recipe(ours, "Ragu", { servings: 4 });
    const big = await recipe(ours, "Lasagne", { servings: 12 });

    await addSuggestedDinnersAction([
      { date: MONDAY, recipeId: small },
      { date: TUESDAY, recipeId: big },
    ]);

    const meals = await prisma.plannedMeal.findMany({
      where: { householdId: ours.householdId },
      orderBy: { date: "asc" },
    });
    expect(meals.map((m) => m.servings)).toEqual([6, 12]);
  });

  it("ignores a malformed date and a second pick for the same evening", async () => {
    const ragu = await recipe(ours, "Ragu");
    const dal = await recipe(ours, "Dal");

    const result = await addSuggestedDinnersAction([
      { date: "next tuesday", recipeId: ragu },
      { date: MONDAY, recipeId: ragu },
      { date: MONDAY, recipeId: dal },
    ]);

    expect(result).toEqual({ added: 1 });
    expect((await week()).map((m) => m.recipeId)).toEqual([ragu]);
  });
});
