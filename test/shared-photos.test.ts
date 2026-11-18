import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { weekStartOf } from "@/lib/grocery";
import { plannerLibrary } from "@/lib/plan-mutations";
import { clearRecipeImage, setRecipeImage } from "@/lib/recipe-image";
import { createRecipe, setRecipeShared } from "@/lib/recipe-mutations";
import { recipeInput } from "@/lib/recipe-schema";
import { shownImageUrl } from "@/lib/recipe-visibility";
import { getRecipe, searchRecipes } from "@/lib/recipes";

import { makeHousehold, resetDatabase as reset } from "./support/db";

const hasDb = Boolean(process.env.DATABASE_URL);

describe("shownImageUrl", () => {
  const recipe = (imageFromSource: boolean, imageUrl: string | null = "x") => ({
    householdId: "ours",
    imageUrl,
    imageFromSource,
  });

  it("shows the owner every photo, wherever it came from", () => {
    expect(shownImageUrl(recipe(true), "ours")).toBe("x");
    expect(shownImageUrl(recipe(false), "ours")).toBe("x");
  });

  it("shows another household only a photo the owner added", () => {
    expect(shownImageUrl(recipe(true), "theirs")).toBeNull();
    expect(shownImageUrl(recipe(false), "theirs")).toBe("x");
  });

  it("has nothing to show when there is no photo", () => {
    expect(shownImageUrl(recipe(false, null), "ours")).toBeNull();
  });
});

describe.skipIf(!hasDb)("a shared recipe's photo", () => {
  let ours: { householdId: string; userId: string };
  let theirs: { householdId: string; userId: string };
  let recipeId: string;
  const pagePhoto = "https://example.test/from-the-site.jpg";

  beforeEach(async () => {
    await reset();
    ours = await makeHousehold("Ours");
    theirs = await makeHousehold("Theirs");
    // As the link import saves it: the site's own photo, with the recipe.
    recipeId = await createRecipe(
      recipeInput.parse({
        title: "Chicken Piccata",
        course: "DINNER",
        instructions: ["Cook"],
        ingredients: [],
        tags: [],
      }),
      ours.householdId,
      ours.userId,
      { source: "URL", imageUrl: pagePhoto },
    );
    await setRecipeShared(recipeId, ours.householdId, true);
  });

  afterAll(async () => {
    await reset();
    await prisma.$disconnect();
  });

  const seenBy = async (householdId: string) => {
    const week = weekStartOf(new Date());
    const [page, search, planner] = await Promise.all([
      getRecipe(recipeId, householdId),
      searchRecipes({ householdId, query: "piccata" }),
      plannerLibrary(householdId, week),
    ]);
    return {
      page: page?.imageUrl,
      search: search[0]?.imageUrl,
      planner: planner.find((r) => r.id === recipeId)?.imageUrl,
    };
  };

  it("marks a photo that came with the source", async () => {
    const row = await prisma.recipe.findUnique({ where: { id: recipeId } });
    expect(row?.imageFromSource).toBe(true);
  });

  it("keeps the source's photo at home: the page, search and planner", async () => {
    expect(await seenBy(ours.householdId)).toEqual({
      page: pagePhoto,
      search: pagePhoto,
      planner: pagePhoto,
    });
    // The recipe itself still travels; only the picture stays behind.
    expect(await seenBy(theirs.householdId)).toEqual({
      page: null,
      search: null,
      planner: null,
    });
  });

  it("shares a photo the household adds themselves", async () => {
    const own = await setRecipeImage(
      recipeId,
      ours.householdId,
      new Uint8Array(
        readFileSync(join(process.cwd(), "test/fixtures/photo.jpg")),
      ),
      "photo.jpg",
      "image/jpeg",
    );
    expect(await seenBy(theirs.householdId)).toEqual({
      page: own,
      search: own,
      planner: own,
    });
    await clearRecipeImage(recipeId, ours.householdId);
  });

  it("does not mark a recipe made without a photo", async () => {
    const id = await createRecipe(
      recipeInput.parse({
        title: "Plain",
        instructions: ["Cook"],
        ingredients: [],
        tags: [],
      }),
      ours.householdId,
      ours.userId,
    );
    const row = await prisma.recipe.findUnique({ where: { id } });
    expect(row?.imageFromSource).toBe(false);
  });
});
