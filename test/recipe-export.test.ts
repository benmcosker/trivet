import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import {
  exportFileName,
  householdRecipes,
  ingredientLine,
  isoDuration,
  toRecipeData,
  toRecipePage,
  toSchemaRecipe,
  type ExportRecipe,
} from "@/lib/recipe-export";

import { makeHousehold, resetDatabase, treatAsLibrary } from "./support/db";

/**
 * "Download our recipes" (`recipe-export.ts`): what the terms promise people
 * can take with them. What matters is that it is complete, safe to open, and
 * holds only the household's own recipes.
 */
const hasDb = Boolean(process.env.DATABASE_URL);

const recipe = (over: Partial<ExportRecipe> = {}): ExportRecipe => ({
  title: "Chicken Piccata",
  description: "Lemony and quick.",
  servings: 4,
  yieldNote: null,
  prepMinutes: 15,
  cookMinutes: 75,
  restMinutes: null,
  ovenTemp: 400,
  ovenTempUnit: "FAHRENHEIT",
  course: "DINNER",
  equipment: ["Large skillet"],
  instructions: ["Pound the chicken.", "Fry it."],
  notes: "Use thighs next time.",
  sourceUrl: "https://example.com/piccata",
  sourceName: "Example Kitchen",
  caloriesKcal: 420,
  proteinG: 35,
  carbsG: null,
  fatG: 20,
  nutritionEstimated: true,
  createdAt: new Date("2026-11-01T12:00:00Z"),
  ingredients: [
    { name: "flour", quantity: 0.5, unit: "cup", note: "for dredging" },
    { name: "lemons", quantity: 2, unit: null, note: null },
    { name: "salt", quantity: null, unit: "to taste", note: null },
  ],
  tags: [{ tag: { name: "Weeknight" } }],
  ...over,
});

describe("the pieces", () => {
  it("writes an ingredient the way the recipe page does", () => {
    const [flour, lemons, salt] = recipe().ingredients;
    expect(ingredientLine(flour)).toBe("1/2 cup flour, for dredging");
    expect(ingredientLine(lemons)).toBe("2 lemons");
    expect(ingredientLine(salt)).toBe("salt, to taste");
  });

  it("writes durations as schema.org wants them", () => {
    expect(isoDuration(75)).toBe("PT1H15M");
    expect(isoDuration(60)).toBe("PT1H");
    expect(isoDuration(15)).toBe("PT15M");
    expect(isoDuration(null)).toBeUndefined();
    expect(isoDuration(0)).toBeUndefined();
  });

  it("names the file for the day", () => {
    expect(exportFileName(new Date("2026-11-20T09:00:00Z"), "json")).toBe(
      "trivet-recipes-2026-11-20.json",
    );
  });
});

describe("recipe data", () => {
  it("is a schema.org Recipe another app can import", () => {
    expect(toSchemaRecipe(recipe())).toEqual({
      "@type": "Recipe",
      name: "Chicken Piccata",
      description: "Lemony and quick.",
      recipeYield: "4 servings",
      prepTime: "PT15M",
      cookTime: "PT1H15M",
      totalTime: "PT1H30M",
      recipeCategory: "Dinner",
      keywords: "Weeknight",
      tool: ["Large skillet"],
      recipeIngredient: [
        "1/2 cup flour, for dredging",
        "2 lemons",
        "salt, to taste",
      ],
      recipeInstructions: [
        { "@type": "HowToStep", text: "Pound the chicken." },
        { "@type": "HowToStep", text: "Fry it." },
      ],
      nutrition: {
        "@type": "NutritionInformation",
        calories: "420 calories",
        proteinContent: "35 g",
        fatContent: "20 g",
      },
      isBasedOn: "https://example.com/piccata",
      comment: { "@type": "Comment", text: "Use thighs next time." },
      dateCreated: "2026-11-01T12:00:00.000Z",
    });
  });

  it("leaves out what a recipe doesn't have", () => {
    const bare = toSchemaRecipe(
      recipe({
        description: null,
        prepMinutes: null,
        cookMinutes: null,
        course: null,
        equipment: [],
        notes: null,
        sourceUrl: null,
        sourceName: null,
        caloriesKcal: null,
        proteinG: null,
        fatG: null,
        tags: [],
      }),
    );
    expect(Object.keys(bare).sort()).toEqual(
      [
        "@type",
        "name",
        "recipeYield",
        "recipeIngredient",
        "recipeInstructions",
        "dateCreated",
      ].sort(),
    );
  });

  it("is one JSON-LD document that parses", () => {
    const parsed = JSON.parse(toRecipeData([recipe(), recipe()]));
    expect(parsed["@context"]).toBe("https://schema.org");
    expect(parsed["@graph"]).toHaveLength(2);
  });
});

describe("the page", () => {
  const on = new Date("2026-11-20T09:00:00Z");

  it("has everything on the recipe, and no photos", () => {
    const page = toRecipePage([recipe()], "The McMullens", on);
    for (const text of [
      "The McMullens: recipes from Trivet",
      "1 recipe, downloaded November 20, 2026",
      "Serves 4 · Prep 15 min · Cook 1 hr 15 min · Oven 400°F · Dinner",
      "1/2 cup flour, for dredging",
      "<li>Pound the chicken.</li>",
      "Use thighs next time.",
      "Per serving (estimated): 420 kcal, 35 g protein, 20 g fat",
      '<a href="https://example.com/piccata">Example Kitchen</a>',
      "Weeknight",
    ]) {
      expect(page).toContain(text);
    }
    expect(page).not.toContain("<img");
  });

  it("cannot be made to run anything by what somebody typed", () => {
    const page = toRecipePage(
      [
        recipe({
          title: "<script>alert(1)</script>",
          sourceUrl: "javascript:alert(1)",
          sourceName: null,
          instructions: ['<img src=x onerror="alert(1)">'],
        }),
      ],
      "<b>Household</b>",
      on,
    );
    expect(page).not.toContain("<script>alert");
    expect(page).not.toContain("<img");
    expect(page).not.toContain('href="javascript');
    expect(page).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(page).toContain("&lt;b&gt;Household&lt;/b&gt;");
  });
});

describe.skipIf(!hasDb)("which recipes", () => {
  beforeEach(resetDatabase);
  afterAll(() => prisma.$disconnect());

  it("holds the household's own recipes, not the library's or a neighbour's", async () => {
    const home = await makeHousehold("Home");
    const library = await makeHousehold("Library");
    const neighbour = await makeHousehold("Neighbour");
    await treatAsLibrary(library.householdId);

    const make = (title: string, owner: typeof home, isShared = false) =>
      prisma.recipe.create({
        data: {
          publicId: title.toLowerCase().replace(/\W/g, ""),
          title,
          householdId: owner.householdId,
          createdById: owner.userId,
          isShared,
          ingredients: {
            create: [
              { name: "second", position: 1 },
              { name: "first", position: 0 },
            ],
          },
        },
      });
    await make("Our Soup", home);
    await make("Another Of Ours", home);
    await make("Library Stew", library, true);
    const theirs = await make("Their Pie", neighbour);
    await prisma.recipeShare.create({
      data: { recipeId: theirs.id, householdId: home.householdId },
    });

    const recipes = await householdRecipes(home.householdId);
    expect(recipes.map((r) => r.title)).toEqual([
      "Another Of Ours",
      "Our Soup",
    ]);
    expect(recipes[0].ingredients.map((i) => i.name)).toEqual([
      "first",
      "second",
    ]);
  });
});
