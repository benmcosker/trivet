import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import {
  createRecipe,
  deleteRecipe,
  listTagsWithCounts,
  updateRecipe,
} from "@/lib/recipe-mutations";
import { recipeInput } from "@/lib/recipe-schema";
import { searchRecipes } from "@/lib/recipes";

import { makeHousehold, resetDatabase as reset } from "./support/db";

const hasDb = Boolean(process.env.DATABASE_URL);

const base = {
  title: "Miso Butter Salmon",
  description: "Fast weeknight fish",
  servings: 2,
  prepMinutes: 10,
  cookMinutes: 12,
  instructions: ["Whisk miso and butter", "Roast 12 minutes"],
  ingredients: [
    { name: "salmon fillet", quantity: 2, unit: null },
    { name: "white miso", quantity: 1, unit: "tbsp" },
  ],
  tags: ["Weeknight", "Seafood"],
};

describe.skipIf(!hasDb)("recipe mutations", () => {
  let userId: string;
  let householdId: string;

  beforeEach(async () => {
    await reset();
    ({ householdId, userId } = await makeHousehold());
  });

  afterAll(async () => {
    await reset();
    await prisma.$disconnect();
  });

  it("creates a recipe that is immediately searchable", async () => {
    await createRecipe(recipeInput.parse(base), householdId, userId);
    const found = await searchRecipes({ householdId, query: "miso" });
    expect(found.map((r) => r.title)).toEqual(["Miso Butter Salmon"]);
  });

  it("stores ingredients in the order given", async () => {
    const id = await createRecipe(recipeInput.parse(base), householdId, userId);
    const recipe = await prisma.recipe.findUniqueOrThrow({
      where: { id },
      include: { ingredients: { orderBy: { position: "asc" } } },
    });
    expect(recipe.ingredients.map((i) => i.name)).toEqual([
      "salmon fillet",
      "white miso",
    ]);
  });

  it("reuses an existing tag rather than duplicating it", async () => {
    await createRecipe(recipeInput.parse(base), householdId, userId);
    await createRecipe(
      recipeInput.parse({
        ...base,
        title: "Another Weeknight Dish",
        tags: ["Weeknight"],
      }),
      householdId,
      userId,
    );

    const tags = await listTagsWithCounts(householdId);
    expect(tags.find((t) => t.name === "Weeknight")?.count).toBe(2);
    expect(await prisma.tag.count({ where: { slug: "weeknight" } })).toBe(1);
  });

  it("replaces ingredients and tags on edit rather than accumulating them", async () => {
    const id = await createRecipe(recipeInput.parse(base), householdId, userId);

    await updateRecipe(
      id,
      householdId,
      recipeInput.parse({
        ...base,
        title: "Miso Butter Cod",
        ingredients: [{ name: "cod fillet", quantity: 2, unit: null }],
        tags: ["Weeknight"],
      }),
    );

    const recipe = await prisma.recipe.findUniqueOrThrow({
      where: { id },
      include: { ingredients: true, tags: { include: { tag: true } } },
    });
    expect(recipe.ingredients.map((i) => i.name)).toEqual(["cod fillet"]);
    expect(recipe.tags.map((t) => t.tag.name)).toEqual(["Weeknight"]);
  });

  it("keeps an importer's estimate labelled, but only with figures to label", async () => {
    const labelled = await createRecipe(
      recipeInput.parse({
        ...base,
        caloriesKcal: 600,
        nutritionEstimated: true,
      }),
      householdId,
      userId,
    );
    const bare = await createRecipe(
      recipeInput.parse({ ...base, title: "Bare", nutritionEstimated: true }),
      householdId,
      userId,
    );
    const flag = async (id: string) =>
      (await prisma.recipe.findUniqueOrThrow({ where: { id } }))
        .nutritionEstimated;
    expect(await flag(labelled)).toBe(true);
    expect(await flag(bare)).toBe(false);
  });

  it("drops the Estimated label once somebody edits the figures", async () => {
    const macros = { caloriesKcal: 600, proteinG: 30, carbsG: 50, fatG: 25 };
    const id = await createRecipe(
      recipeInput.parse({ ...base, ...macros }),
      householdId,
      userId,
    );
    await prisma.recipe.update({
      where: { id },
      data: { nutritionEstimated: true },
    });
    const estimated = async () =>
      (await prisma.recipe.findUniqueOrThrow({ where: { id } }))
        .nutritionEstimated;

    // Editing something else keeps the label.
    await updateRecipe(
      id,
      householdId,
      recipeInput.parse({ ...base, ...macros, title: "Miso Salmon" }),
    );
    expect(await estimated()).toBe(true);

    await updateRecipe(
      id,
      householdId,
      recipeInput.parse({ ...base, ...macros, caloriesKcal: 550 }),
    );
    expect(await estimated()).toBe(false);
  });

  it("reindexes for search after an edit", async () => {
    const id = await createRecipe(recipeInput.parse(base), householdId, userId);
    await updateRecipe(
      id,
      householdId,
      recipeInput.parse({ ...base, title: "Miso Butter Cod" }),
    );

    expect(
      (await searchRecipes({ householdId, query: "cod" })).map((r) => r.title),
    ).toEqual(["Miso Butter Cod"]);
    // The edit changed only the title, so the untouched "salmon fillet"
    // ingredient still matches - the index tracks the current row, not the
    // words the recipe was created with.
    expect(
      (await searchRecipes({ householdId, query: "salmon" })).map(
        (r) => r.title,
      ),
    ).toEqual(["Miso Butter Cod"]);

    // Renaming away from a word does drop it, when nothing else supplies it.
    await updateRecipe(
      id,
      householdId,
      recipeInput.parse({
        ...base,
        title: "Miso Butter Cod",
        ingredients: [{ name: "cod fillet", quantity: 2, unit: null }],
      }),
    );
    expect(await searchRecipes({ householdId, query: "salmon" })).toEqual([]);
  });

  it("removes ingredients and tag links when the recipe is deleted", async () => {
    const id = await createRecipe(recipeInput.parse(base), householdId, userId);
    await deleteRecipe(id, householdId);

    expect(await prisma.ingredient.count({ where: { recipeId: id } })).toBe(0);
    expect(await prisma.recipeTag.count({ where: { recipeId: id } })).toBe(0);
    // The tags themselves survive - other recipes may still use them.
    expect(await prisma.tag.count()).toBeGreaterThan(0);
  });
});

describe("recipeInput validation", () => {
  it("rejects a blank title", () => {
    expect(recipeInput.safeParse({ ...base, title: "   " }).success).toBe(
      false,
    );
  });

  it("rejects a non-positive quantity", () => {
    expect(
      recipeInput.safeParse({
        ...base,
        ingredients: [{ name: "salt", quantity: -1 }],
      }).success,
    ).toBe(false);
  });

  it("allows an ingredient with no quantity", () => {
    expect(
      recipeInput.safeParse({
        ...base,
        ingredients: [{ name: "salt to taste" }],
      }).success,
    ).toBe(true);
  });

  it("rejects a malformed source URL", () => {
    expect(
      recipeInput.safeParse({ ...base, sourceUrl: "not a url" }).success,
    ).toBe(false);
  });
});
