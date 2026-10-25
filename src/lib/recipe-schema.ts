import { z } from "zod";

/**
 * One canonical shape for a recipe, used by the create/edit forms, the server
 * actions behind them, and the PDF extractor. Keeping extraction on the same
 * schema means a model that returns something unusable fails validation here
 * rather than reaching the database.
 */
export const ingredientInput = z.object({
  name: z.string().trim().min(1, "Ingredient needs a name").max(200),
  quantity: z
    .number()
    .positive("Quantity must be greater than zero")
    .max(100_000)
    .nullable()
    .optional(),
  unit: z.string().trim().max(50).nullable().optional(),
  note: z.string().trim().max(200).nullable().optional(),
});

export const TEMPERATURE_UNITS = ["FAHRENHEIT", "CELSIUS"] as const;
export type TemperatureUnit = (typeof TEMPERATURE_UNITS)[number];

/**
 * Plausible oven temperatures, per unit.
 *
 * A wide backstop rather than a style guide: it exists to catch a Celsius
 * number labelled Fahrenheit, which is the mistake that ruins dinner.
 * Dehydrator and low-and-slow recipes live at the bottom of these ranges and
 * are allowed. Mirrors the CHECK constraint on the column.
 */
export const OVEN_TEMP_RANGE: Record<
  TemperatureUnit,
  { min: number; max: number }
> = {
  FAHRENHEIT: { min: 100, max: 600 },
  CELSIUS: { min: 40, max: 315 },
};

export const NUTRITION_BASES = ["PRINTED", "ESTIMATED"] as const;
export type NutritionBasis = (typeof NUTRITION_BASES)[number];

/**
 * Per-serving bounds for each macro, mirroring the CHECK constraint.
 *
 * A backstop rather than a nutritional opinion: these catch a per-recipe
 * total stored as a per-serving figure, and grams landing in the calories
 * column. Deliberately generous - a rich single serving really can reach
 * four figures of calories, and refusing it would be this file having a
 * view about dinner.
 */
export const MACRO_RANGE = {
  caloriesKcal: { min: 0, max: 5000, label: "Calories" },
  proteinG: { min: 0, max: 500, label: "Protein" },
  carbsG: { min: 0, max: 1000, label: "Carbohydrate" },
  fatG: { min: 0, max: 500, label: "Fat" },
} as const;

export type MacroKey = keyof typeof MACRO_RANGE;
export const MACRO_KEYS = Object.keys(MACRO_RANGE) as MacroKey[];

const recipeShape = z.object({
  title: z.string().trim().min(1, "Give the recipe a title").max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  servings: z.number().int().min(1).max(100).default(4),
  prepMinutes: z.number().int().min(0).max(10_000).nullable().optional(),
  cookMinutes: z.number().int().min(0).max(10_000).nullable().optional(),
  sourceUrl: z
    .url("Must be a valid URL")
    .nullable()
    .optional()
    .or(z.literal("")),
  sourceName: z.string().trim().max(200).nullable().optional(),
  ovenTemp: z.number().int().min(1).max(1000).nullable().optional(),
  ovenTempUnit: z.enum(TEMPERATURE_UNITS).nullable().optional(),
  restMinutes: z.number().int().min(0).max(10_000).nullable().optional(),
  yieldNote: z.string().trim().max(200).nullable().optional(),
  equipment: z.array(z.string().trim().min(1).max(120)).max(30).default([]),
  caloriesKcal: z.number().int().min(0).max(5000).nullable().optional(),
  proteinG: z.number().int().min(0).max(500).nullable().optional(),
  carbsG: z.number().int().min(0).max(1000).nullable().optional(),
  fatG: z.number().int().min(0).max(500).nullable().optional(),
  nutritionBasis: z.enum(NUTRITION_BASES).nullable().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
  instructions: z.array(z.string().trim().min(1)).max(100).default([]),
  ingredients: z.array(ingredientInput).max(200).default([]),
  tags: z.array(z.string().trim().min(1).max(50)).max(30).default([]),
});

/**
 * The oven temperature and its unit stand or fall together, and the number has
 * to be plausible for the unit it claims. Applied to both the recipe schema and
 * the extraction schema, so a model that returns "180 Fahrenheit" for a fan
 * oven is caught in the same place a person typing it would be.
 */
function checkOvenTemp(
  recipe: { ovenTemp?: number | null; ovenTempUnit?: TemperatureUnit | null },
  ctx: z.RefinementCtx,
): void {
  if (recipe.ovenTemp != null && !recipe.ovenTempUnit) {
    ctx.addIssue({
      code: "custom",
      path: ["ovenTempUnit"],
      message: "Say whether that oven temperature is Fahrenheit or Celsius.",
    });
    return;
  }

  if (recipe.ovenTemp == null || !recipe.ovenTempUnit) return;

  const { min, max } = OVEN_TEMP_RANGE[recipe.ovenTempUnit];
  if (recipe.ovenTemp < min || recipe.ovenTemp > max) {
    ctx.addIssue({
      code: "custom",
      path: ["ovenTemp"],
      message: `An oven temperature in ${
        recipe.ovenTempUnit === "CELSIUS" ? "Celsius" : "Fahrenheit"
      } should be between ${min} and ${max}.`,
    });
  }
}

/**
 * A macro and its basis stand or fall together, the same bargain the oven
 * temperature strikes with its unit.
 *
 * The asymmetry in the two messages is deliberate. Macros without a basis is
 * a programming mistake - every path that sets them knows where they came
 * from - so it reads as one. A basis without macros is something a person can
 * do by clearing the fields on the edit form, so it reads as instruction.
 */
function checkNutrition(
  recipe: {
    caloriesKcal?: number | null;
    proteinG?: number | null;
    carbsG?: number | null;
    fatG?: number | null;
    nutritionBasis?: NutritionBasis | null;
  },
  ctx: z.RefinementCtx,
): void {
  const hasMacro = MACRO_KEYS.some((key) => recipe[key] != null);

  if (hasMacro && !recipe.nutritionBasis) {
    ctx.addIssue({
      code: "custom",
      path: ["nutritionBasis"],
      message:
        "Nutrition has to say where it came from: PRINTED if the source " +
        "stated it, ESTIMATED if Claude worked it out.",
    });
    return;
  }

  if (!hasMacro && recipe.nutritionBasis) {
    ctx.addIssue({
      code: "custom",
      path: ["nutritionBasis"],
      message: "Remove the nutrition basis, or give at least one figure.",
    });
  }
}

export const recipeInput = recipeShape
  .superRefine(checkOvenTemp)
  .superRefine(checkNutrition);

export type RecipeInput = z.infer<typeof recipeInput>;
export type IngredientInput = z.infer<typeof ingredientInput>;

/** Shape returned by the PDF extractor before a human confirms it. */
export const extractedRecipe = recipeShape
  .extend({
    /** The model's own confidence that this PDF was a recipe at all. */
    confidence: z.enum(["high", "medium", "low"]).default("medium"),
  })
  .superRefine(checkOvenTemp)
  .superRefine(checkNutrition);

export type ExtractedRecipe = z.infer<typeof extractedRecipe>;
