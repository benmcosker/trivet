import { describe, expect, it } from "vitest";

import { readNutrition } from "@/lib/extract-recipe";
import { recipeInput } from "@/lib/recipe-schema";

/**
 * These test the rules that keep an estimate from passing as a measurement.
 *
 * The plumbing - five columns reaching the database - is covered by the
 * mutation tests. What is worth asserting here is the part that is easy to
 * regress without anybody noticing, because nothing visibly breaks when it
 * does: a macro that arrives with no basis, or a basis that quietly survives
 * its numbers.
 */

const base = {
  title: "Pork Shoulder Ragu",
  servings: 6,
  equipment: [],
  instructions: ["Brown the pork."],
  ingredients: [],
  tags: [],
};

describe("a macro and its basis", () => {
  it("refuses figures that do not say where they came from", () => {
    const result = recipeInput.safeParse({
      ...base,
      proteinG: 32,
      carbsG: 45,
    });

    expect(result.success).toBe(false);
    // The path matters: the person is missing a basis, not a protein figure.
    expect(result.error?.issues[0]?.path).toEqual(["nutritionBasis"]);
  });

  it("refuses a basis with nothing to describe", () => {
    const result = recipeInput.safeParse({
      ...base,
      nutritionBasis: "ESTIMATED",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["nutritionBasis"]);
  });

  it("accepts a partial printed set", () => {
    // A card that prints protein and nothing else is a real card, and the
    // gaps stay gaps - the point of PRINTED is that nothing was filled in.
    const result = recipeInput.safeParse({
      ...base,
      proteinG: 32,
      nutritionBasis: "PRINTED",
    });

    expect(result.success).toBe(true);
    expect(result.data?.carbsG ?? null).toBeNull();
  });

  it("accepts a recipe with no nutrition at all", () => {
    expect(recipeInput.safeParse(base).success).toBe(true);
  });
});

describe("the plausibility backstop", () => {
  it("refuses a per-recipe total stored as a serving", () => {
    // 6000 kcal in one serving is the shape of a whole dish's total landing
    // in a per-serving column, which is the error that makes two recipes
    // uncomparable without either of them looking wrong on its own.
    const result = recipeInput.safeParse({
      ...base,
      caloriesKcal: 6000,
      nutritionBasis: "PRINTED",
    });

    expect(result.success).toBe(false);
  });

  it("allows a genuinely rich serving", () => {
    const result = recipeInput.safeParse({
      ...base,
      caloriesKcal: 1200,
      proteinG: 60,
      carbsG: 90,
      fatG: 70,
      nutritionBasis: "PRINTED",
    });

    expect(result.success).toBe(true);
  });

  it("refuses a negative macro rather than reading it as zero", () => {
    // Zero grams of fat is a claim about the dish. A negative number is not
    // a claim about anything, so it must not become one.
    const result = recipeInput.safeParse({
      ...base,
      fatG: -4,
      nutritionBasis: "ESTIMATED",
    });

    expect(result.success).toBe(false);
  });
});

describe("reading macros back off the model", () => {
  const printed = {
    caloriesKcal: 521,
    proteinG: 31,
    carbsG: 44,
    fatG: 19,
    basis: "PRINTED" as const,
  };

  it("leaves printed figures exactly as the source stated them", () => {
    // Rounding these would be this code editing the card. 31 g means 31.
    expect(readNutrition(printed)).toEqual({
      caloriesKcal: 521,
      proteinG: 31,
      carbsG: 44,
      fatG: 19,
      nutritionBasis: "PRINTED",
    });
  });

  it("rounds estimates hard, because the decimal place is the lie", () => {
    expect(readNutrition({ ...printed, basis: "ESTIMATED" })).toEqual({
      caloriesKcal: 520,
      proteinG: 30,
      carbsG: 45,
      fatG: 20,
      nutritionBasis: "ESTIMATED",
    });
  });

  it("drops an estimate that is missing a macro", () => {
    // Three figures and a gap invites the reader to take the gap for a zero.
    // An estimate is all four or it is nothing.
    expect(
      readNutrition({ ...printed, fatG: null, basis: "ESTIMATED" }),
    ).toEqual({
      caloriesKcal: null,
      proteinG: null,
      carbsG: null,
      fatG: null,
      nutritionBasis: null,
    });
  });

  it("keeps a partial printed set, which is a real card", () => {
    const result = readNutrition({ ...printed, fatG: null, carbsG: null });

    expect(result.proteinG).toBe(31);
    expect(result.fatG).toBeNull();
    expect(result.nutritionBasis).toBe("PRINTED");
  });

  it("reads a negative as nothing said, not as zero", () => {
    const result = readNutrition({ ...printed, fatG: -4 });

    expect(result.fatG).toBeNull();
    expect(result.proteinG).toBe(31);
  });

  it("returns nothing at all when the model returns nothing", () => {
    expect(readNutrition(null).nutritionBasis).toBeNull();
  });
});
