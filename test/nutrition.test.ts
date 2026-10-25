import { describe, expect, it } from "vitest";

import { readNutrition } from "@/lib/extract-recipe";
import { toRecipeInput } from "@/lib/recipe-mutations";
import { recipeInput } from "@/lib/recipe-schema";

/**
 * Macros are transcribed, never calculated, and nothing downstream can check
 * one: a misread 820 is as plausible on the page as a printed 620. So what
 * is worth asserting here is the handful of rules that stop a figure being
 * recorded as something the source did not say.
 */

const base = {
  title: "Pork Shoulder Ragu",
  servings: 6,
  equipment: [],
  instructions: ["Brown the pork."],
  ingredients: [],
  tags: [],
};

describe("the plausibility backstop", () => {
  it("refuses a per-recipe total stored as a serving", () => {
    // 6000 kcal in one serving is the shape of a whole dish's total landing
    // in a per-serving column - the error that makes two recipes
    // uncomparable without either of them looking wrong on its own.
    expect(recipeInput.safeParse({ ...base, caloriesKcal: 6000 }).success).toBe(
      false,
    );
  });

  it("allows a genuinely rich serving", () => {
    const result = recipeInput.safeParse({
      ...base,
      caloriesKcal: 1200,
      proteinG: 60,
      carbsG: 90,
      fatG: 70,
    });

    expect(result.success).toBe(true);
  });

  it("refuses a negative macro rather than reading it as zero", () => {
    expect(recipeInput.safeParse({ ...base, fatG: -4 }).success).toBe(false);
  });

  it("accepts a recipe with no nutrition at all", () => {
    expect(recipeInput.safeParse(base).success).toBe(true);
  });

  it("accepts a partial set, which is what most cards print", () => {
    const result = recipeInput.safeParse({ ...base, proteinG: 32 });

    expect(result.success).toBe(true);
    expect(result.data?.carbsG ?? null).toBeNull();
  });
});

describe("reading macros back off the model", () => {
  const stated = {
    caloriesKcal: 620,
    proteinG: 23,
    carbsG: 72,
    fatG: 26,
  };

  it("keeps stated figures exactly as the source printed them", () => {
    // No rounding to a friendlier number: 23 g means 23. Anything else is
    // this code editing the card.
    expect(readNutrition(stated)).toEqual(stated);
  });

  it("keeps a partial set rather than discarding it", () => {
    const result = readNutrition({ ...stated, fatG: null, carbsG: null });

    expect(result.proteinG).toBe(23);
    expect(result.fatG).toBeNull();
  });

  it("drops a decimal the card cannot have printed", () => {
    expect(readNutrition({ ...stated, proteinG: 23.4 }).proteinG).toBe(23);
  });

  it("reads a negative as nothing said, not as zero", () => {
    const result = readNutrition({ ...stated, fatG: -4 });

    expect(result.fatG).toBeNull();
    expect(result.proteinG).toBe(23);
  });

  it("returns nothing at all when the model returns nothing", () => {
    expect(readNutrition(null)).toEqual({
      caloriesKcal: null,
      proteinG: null,
      carbsG: null,
      fatG: null,
    });
  });

  it("collapses an all-null object to nothing", () => {
    expect(
      readNutrition({
        caloriesKcal: null,
        proteinG: null,
        carbsG: null,
        fatG: null,
      }).caloriesKcal,
    ).toBeNull();
  });
});

describe("the edit form's starting values", () => {
  /**
   * The regression this exists for: the edit page built its `initial` object
   * by hand and omitted the macros, so opening a recipe and saving any other
   * change wrote four nulls over them. It typechecked, because every macro on
   * `RecipeInput` is optional and nullable - which is why the assertion below
   * is about keys rather than about nutrition.
   */
  it("carries every field the update writes, not just the ones it remembers", () => {
    const saved = {
      title: "Cacio e Pepe",
      description: null,
      servings: 2,
      prepMinutes: 5,
      cookMinutes: 15,
      restMinutes: null,
      ovenTemp: null,
      ovenTempUnit: null,
      yieldNote: null,
      equipment: [],
      caloriesKcal: 620,
      proteinG: 23,
      carbsG: 72,
      fatG: 26,
      sourceUrl: null,
      sourceName: null,
      notes: null,
      instructions: ["Boil the pasta."],
      ingredients: [{ name: "pasta", quantity: 200, unit: "g", note: null }],
      tags: [{ tag: { name: "Pasta" } }],
    };

    const initial = toRecipeInput(saved as never);

    // Round trip: what the form opens with has to survive validation and
    // come back carrying the same macros it was given.
    const parsed = recipeInput.safeParse(initial);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.caloriesKcal).toBe(620);
    expect(parsed.data?.fatG).toBe(26);
  });
});
