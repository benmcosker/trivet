import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/db";
import { toRecipeInput } from "@/lib/recipe-mutations";
import { recipeInput } from "@/lib/recipe-schema";

import { makeHousehold, resetDatabase } from "./support/db";

/**
 * The signed-in household, swapped per test. The action under test is only
 * as safe as the household it believes it is acting for, so that is the one
 * thing the tests control.
 */
const session = vi.hoisted(() => ({
  current: { id: "", householdId: "", householdName: "", name: "" },
}));
vi.mock("@/lib/session", () => ({
  requireHousehold: async () => session.current,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { setCourseAction } = await import("@/app/recipes/sort/actions");

const hasDb = Boolean(process.env.DATABASE_URL);

describe("a recipe's course", () => {
  it("accepts the six courses and nothing else", () => {
    const base = {
      title: "Pancakes",
      servings: 4,
      equipment: [],
      instructions: ["Whisk."],
      ingredients: [],
      tags: [],
    };
    for (const course of [
      "DINNER",
      "SIDE",
      "BREAKFAST",
      "DESSERT",
      "SNACK",
      "OTHER",
    ]) {
      expect(recipeInput.safeParse({ ...base, course }).success).toBe(true);
    }
    expect(recipeInput.safeParse({ ...base, course: "LUNCH" }).success).toBe(
      false,
    );
    // Unsorted is a real answer, not a missing one.
    expect(recipeInput.safeParse({ ...base, course: null }).success).toBe(true);
  });

  it("survives the edit form's round trip", () => {
    // The class of bug that once deleted every recipe's nutrition on edit:
    // a field the update writes but the form's starting values forgot.
    const initial = toRecipeInput({
      title: "Buttermilk Pancakes",
      description: null,
      servings: 4,
      prepMinutes: 10,
      cookMinutes: 20,
      restMinutes: null,
      ovenTemp: null,
      ovenTempUnit: null,
      yieldNote: null,
      equipment: [],
      caloriesKcal: null,
      proteinG: null,
      carbsG: null,
      fatG: null,
      course: "BREAKFAST",
      sourceUrl: null,
      sourceName: null,
      notes: null,
      instructions: ["Whisk."],
      ingredients: [],
      tags: [],
    } as never);

    expect(recipeInput.parse(initial).course).toBe("BREAKFAST");
  });
});

describe.skipIf(!hasDb)("setCourseAction", () => {
  let ours: { householdId: string; userId: string };
  let theirs: { householdId: string; userId: string };
  let recipeId: string;

  const actAs = (who: { householdId: string; userId: string }) => {
    session.current = {
      id: who.userId,
      householdId: who.householdId,
      householdName: "",
      name: "",
    };
  };

  beforeEach(async () => {
    await resetDatabase();
    ours = await makeHousehold("Ours");
    theirs = await makeHousehold("Theirs");
    ({ id: recipeId } = await prisma.recipe.create({
      data: {
        publicId: "cafe0001",
        title: "Buttermilk Pancakes",
        householdId: ours.householdId,
        createdById: ours.userId,
      },
      select: { id: true },
    }));
  });

  afterAll(async () => {
    await resetDatabase();
    await prisma.$disconnect();
  });

  const courseOf = async () =>
    (
      await prisma.recipe.findUniqueOrThrow({
        where: { id: recipeId },
        select: { course: true },
      })
    ).course;

  it("starts unsorted, and records what the household says", async () => {
    expect(await courseOf()).toBeNull();

    actAs(ours);
    expect(await setCourseAction(recipeId, "BREAKFAST")).toEqual({ ok: true });
    expect(await courseOf()).toBe("BREAKFAST");
  });

  it("will not let another household re-sort a recipe it does not own", async () => {
    actAs(ours);
    await setCourseAction(recipeId, "BREAKFAST");

    actAs(theirs);
    const result = await setCourseAction(recipeId, "DINNER");

    expect(result.ok).toBe(false);
    expect(await courseOf()).toBe("BREAKFAST");
  });

  it("refuses a course that does not exist", async () => {
    actAs(ours);
    const result = await setCourseAction(recipeId, "LUNCH" as never);

    expect(result.ok).toBe(false);
    expect(await courseOf()).toBeNull();
  });
});
