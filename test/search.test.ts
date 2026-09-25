import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import {
  searchRecipes,
  slugifyTag,
  upsertTags,
  type RecipeSearchOptions,
} from "@/lib/recipes";

import { makeHousehold, resetDatabase as reset } from "./support/db";

// Integration tests: they exercise Postgres-specific behaviour (the tsvector
// trigger, trigram matching, tag filtering) that cannot be faked usefully.
// Skipped when no database is configured so `npm test` still works on a fresh
// clone; CI always provides one.
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("recipe search", () => {
  let householdId: string;
  let userId: string;

  beforeAll(async () => {
    await reset();
    ({ householdId, userId } = await makeHousehold());

    const [weeknight, sheetPan, seafood] = await upsertTags([
      "Weeknight",
      "Sheet Pan",
      "Seafood",
    ]);

    await prisma.recipe.create({
      data: {
        id: "test-piccata",
        publicId: "piccata",
        title: "Chicken Piccata",
        description: "Lemony pan sauce with capers",
        instructions: [
          "Dredge the chicken",
          "Sear until golden",
          "Deglaze with wine",
        ],
        createdById: userId,
        householdId,
        ingredients: {
          create: [
            { name: "chicken breast", quantity: 2, unit: "lb", position: 0 },
            { name: "capers", quantity: 2, unit: "tbsp", position: 1 },
          ],
        },
        tags: { create: [{ tagId: weeknight }] },
      },
    });

    await prisma.recipe.create({
      data: {
        id: "test-salmon",
        publicId: "salmon",
        title: "Sheet Pan Salmon",
        description: "Weeknight fish",
        instructions: ["Roast at 425 until flaky"],
        createdById: userId,
        householdId,
        ingredients: {
          create: [{ name: "salmon fillet", quantity: 2, position: 0 }],
        },
        tags: { create: [{ tagId: sheetPan }, { tagId: seafood }] },
      },
    });
  });

  afterAll(async () => {
    await reset();
    await prisma.$disconnect();
  });

  const titles = async (options: Partial<RecipeSearchOptions> = {}) =>
    (await searchRecipes({ householdId, ...options })).map((r) => r.title);

  it("matches a word in the title", async () => {
    expect(await titles({ query: "piccata" })).toEqual(["Chicken Piccata"]);
  });

  it("matches across the stemmer gap between 'lemon' and 'lemony'", async () => {
    // The English stemmer maps these to different lexemes (lemon / lemoni), so
    // full-text alone misses this. The substring pass is what catches it.
    expect(await titles({ query: "lemon" })).toEqual(["Chicken Piccata"]);
  });

  it("matches a partial word", async () => {
    expect(await titles({ query: "chick" })).toEqual(["Chicken Piccata"]);
  });

  it("matches on ingredient name alone", async () => {
    expect(await titles({ query: "capers" })).toEqual(["Chicken Piccata"]);
  });

  it("matches text from the instructions", async () => {
    expect(await titles({ query: "deglaze" })).toEqual(["Chicken Piccata"]);
  });

  it("handles a multi-word query", async () => {
    expect(await titles({ query: "sheet pan" })).toEqual(["Sheet Pan Salmon"]);
  });

  it("matches on tag name", async () => {
    expect(await titles({ query: "seafood" })).toEqual(["Sheet Pan Salmon"]);
  });

  it("filters by tag slug", async () => {
    expect(await titles({ tagSlugs: ["sheet-pan"] })).toEqual([
      "Sheet Pan Salmon",
    ]);
  });

  it("requires every tag when several are given", async () => {
    expect(await titles({ tagSlugs: ["sheet-pan", "seafood"] })).toEqual([
      "Sheet Pan Salmon",
    ]);
    // No recipe carries both of these, so the AND must return nothing.
    expect(await titles({ tagSlugs: ["sheet-pan", "weeknight"] })).toEqual([]);
  });

  it("returns nothing for a query that matches nothing", async () => {
    expect(await titles({ query: "tofu" })).toEqual([]);
  });

  it("treats LIKE wildcards in the query as literal characters", async () => {
    // Unescaped, "%" would match every recipe.
    expect(await titles({ query: "100%" })).toEqual([]);
    expect(await titles({ query: "_" })).toEqual([]);
  });

  it("returns the newest recipes when the query is empty", async () => {
    expect(await titles({})).toEqual(["Sheet Pan Salmon", "Chicken Piccata"]);
    expect(await titles({ query: "   " })).toEqual([
      "Sheet Pan Salmon",
      "Chicken Piccata",
    ]);
  });

  it("keeps the search vector current when a recipe is edited", async () => {
    await prisma.recipe.update({
      where: { id: "test-piccata" },
      data: { title: "Chicken Marsala" },
    });
    expect(await titles({ query: "marsala" })).toEqual(["Chicken Marsala"]);
    expect(await titles({ query: "piccata" })).toEqual([]);

    await prisma.recipe.update({
      where: { id: "test-piccata" },
      data: { title: "Chicken Piccata" },
    });
  });
});

describe("slugifyTag", () => {
  it("lowercases and hyphenates", () => {
    expect(slugifyTag("Sheet Pan")).toBe("sheet-pan");
  });

  it("strips punctuation and edge hyphens", () => {
    expect(slugifyTag("  30-Minute Meals!  ")).toBe("30-minute-meals");
    expect(slugifyTag("Kid's Favourite")).toBe("kid-s-favourite");
  });
});
