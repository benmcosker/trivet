import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import {
  ownWordsProblems,
  withCredit,
  type OwnWordsSource,
} from "@/lib/own-words";
import { createRecipe, shareInOwnWords } from "@/lib/recipe-mutations";
import { recipeInput } from "@/lib/recipe-schema";

import { makeHousehold, resetDatabase as reset } from "./support/db";

const hasDb = Boolean(process.env.DATABASE_URL);

const original = (over: Partial<OwnWordsSource> = {}): OwnWordsSource => ({
  title: "Chicken Piccata",
  description: "Their words about it.",
  notes: "Their tip.",
  instructions: ["Their step one.", "Their step two."],
  sourceName: "Bon Appetit",
  servings: 4,
  ingredients: [],
  ...over,
});

describe("withCredit", () => {
  it("ends the description with the source", () => {
    expect(withCredit("Bright and quick.", "Bon Appetit")).toBe(
      "Bright and quick. Adapted from Bon Appetit.",
    );
  });

  it("replaces a credit the model wrote itself", () => {
    expect(
      withCredit("Bright and quick. Adapted from somewhere.", "Bon Appetit"),
    ).toBe("Bright and quick. Adapted from Bon Appetit.");
  });

  it("is the credit alone when there is nothing else to say", () => {
    expect(withCredit(null, "Bon Appetit")).toBe("Adapted from Bon Appetit.");
  });

  it("credits nobody for a recipe with no source, or one the library does not name", () => {
    expect(withCredit("Bright and quick.", null)).toBe("Bright and quick.");
    expect(withCredit("Bright and quick.", "Marley Spoon")).toBe(
      "Bright and quick.",
    );
    expect(withCredit(null, null)).toBeNull();
  });
});

describe("ownWordsProblems", () => {
  const good = {
    title: "Chicken Piccata",
    description: "Lemony and fast. Adapted from Bon Appetit.",
    notes: "A tip.",
    instructions: ["Step one.", "Step two."],
  };

  it("accepts a rewrite that keeps everything and credits the source", () => {
    expect(ownWordsProblems(original(), good)).toEqual([]);
  });

  it("asks for a credit only when there is a source", () => {
    const uncredited = { ...good, description: "Lemony and fast." };
    expect(ownWordsProblems(original(), uncredited)).toEqual([
      'description has no "Adapted from"',
    ]);
    expect(
      ownWordsProblems(original({ sourceName: null }), uncredited),
    ).toEqual([]);
  });

  it("refuses dropped notes, a dropped method and empty steps", () => {
    expect(ownWordsProblems(original(), { ...good, notes: null })).toContain(
      "notes dropped",
    );
    expect(
      ownWordsProblems(original(), { ...good, instructions: [] }),
    ).toContain("instructions dropped");
    expect(
      ownWordsProblems(original(), { ...good, instructions: ["One.", " "] }),
    ).toContain("an empty step");
  });

  it("refuses a rewrite that names a source the library does not", () => {
    expect(
      ownWordsProblems(original({ sourceName: "Marley Spoon" }), {
        ...good,
        description: "A Marley Spoon classic.",
      }),
    ).toContain("still names Marley Spoon");
  });
});

describe.skipIf(!hasDb)("sharing in your own words", () => {
  let ours: { householdId: string; userId: string };
  let recipeId: string;

  const words = {
    title: "Lemony Chicken",
    description: "Quick and bright. Adapted from Bon Appetit.",
    notes: "Rest it first.",
    instructions: ["Brown the chicken.", "Make the sauce."],
  };

  beforeEach(async () => {
    await reset();
    ours = await makeHousehold("Ours");
    recipeId = await createRecipe(
      recipeInput.parse({
        title: "Chicken Piccata",
        description: "Their words.",
        sourceName: "Bon Appetit",
        notes: "Their tip.",
        instructions: ["Theirs one.", "Theirs two."],
        ingredients: [{ name: "chicken", quantity: 2, unit: "lb" }],
        tags: [],
      }),
      ours.householdId,
      ours.userId,
    );
  });

  afterAll(async () => {
    await reset();
    await prisma.$disconnect();
  });

  const row = () =>
    prisma.recipe.findUniqueOrThrow({
      where: { id: recipeId },
      include: { ingredients: true },
    });

  it("saves the words and shares, leaving the ingredients alone", async () => {
    const before = await row();
    expect(
      await shareInOwnWords(
        recipeId,
        ours.householdId,
        words,
        before.updatedAt,
      ),
    ).toEqual({ ok: true });

    const after = await row();
    expect(after.isShared).toBe(true);
    expect(after.title).toBe("Lemony Chicken");
    expect(after.instructions).toEqual(words.instructions);
    expect(after.ingredients.map((i) => i.name)).toEqual(["chicken"]);
  });

  it("does not overwrite an edit made after the draft", async () => {
    const before = await row();
    await prisma.recipe.update({
      where: { id: recipeId },
      data: { notes: "Edited in another tab." },
    });

    const result = await shareInOwnWords(
      recipeId,
      ours.householdId,
      words,
      before.updatedAt,
    );
    expect(result.ok).toBe(false);
    const after = await row();
    expect(after.isShared).toBe(false);
    expect(after.title).toBe("Chicken Piccata");
  });

  it("refuses words that fail the checks, and another household's recipe", async () => {
    const before = await row();
    const uncredited = await shareInOwnWords(
      recipeId,
      ours.householdId,
      { ...words, description: "Quick and bright." },
      before.updatedAt,
    );
    expect(uncredited.ok).toBe(false);

    const theirs = await makeHousehold("Theirs");
    const stranger = await shareInOwnWords(
      recipeId,
      theirs.householdId,
      words,
      before.updatedAt,
    );
    expect(stranger.ok).toBe(false);
    expect((await row()).isShared).toBe(false);
  });
});
