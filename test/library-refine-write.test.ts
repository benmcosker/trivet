import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import type { Change } from "@/lib/library-refine";
import { writePlan } from "@/lib/library-refine-write";

import { makeHousehold, resetDatabase } from "./support/db";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("writePlan", () => {
  let who: { householdId: string; userId: string };
  let n = 0;

  const recipe = async (title: string) =>
    prisma.recipe.create({
      data: {
        publicId: `ref${String(++n).padStart(5, "0")}`,
        title,
        description: "The card's blurb.",
        notes: "The card's tip.",
        instructions: ["Card step one.", "Card step two."],
        servings: 4,
        isShared: true,
        householdId: who.householdId,
        createdById: who.userId,
        ingredients: { create: [{ name: "lemon", quantity: 2, position: 0 }] },
      },
      select: { id: true, title: true, updatedAt: true },
    });

  const change = (
    r: { id: string; title: string; updatedAt: Date },
    title: string,
  ): Change => ({
    id: r.id,
    title: r.title,
    expectedUpdatedAt: r.updatedAt.toISOString(),
    data: {
      title,
      description: `Our words. Adapted from Meal Kit Co.`,
      notes: "Our tip.",
      instructions: ["Our step one.", "Our step two."],
    },
  });

  beforeEach(async () => {
    await resetDatabase();
    who = await makeHousehold("Ours");
  });

  afterAll(async () => {
    await resetDatabase();
    await prisma.$disconnect();
  });

  it("writes the words and nothing else", async () => {
    const r = await recipe("Zesty Lemon Chicken Bonanza");

    expect(await writePlan([change(r, "Lemon Chicken")])).toBe(1);

    const after = await prisma.recipe.findUniqueOrThrow({
      where: { id: r.id },
      include: { ingredients: true },
    });
    expect(after).toMatchObject({
      title: "Lemon Chicken",
      description: "Our words. Adapted from Meal Kit Co.",
      notes: "Our tip.",
      instructions: ["Our step one.", "Our step two."],
      servings: 4,
      isShared: true,
    });
    expect(after.ingredients.map((i) => [i.name, i.quantity])).toEqual([
      ["lemon", 2],
    ]);
  });

  it("writes nothing when any recipe changed after the plan was made", async () => {
    const first = await recipe("First");
    const second = await recipe("Second");
    const stale = change(second, "Second, ours");
    // Somebody edits the second recipe after the plan was made.
    await prisma.recipe.update({
      where: { id: second.id },
      data: { title: "Second, edited" },
    });

    await expect(
      writePlan([change(first, "First, ours"), stale]),
    ).rejects.toThrow(/"Second" changed while this ran/);

    const titles = await prisma.recipe.findMany({
      orderBy: { publicId: "asc" },
      select: { title: true },
    });
    expect(titles.map((t) => t.title)).toEqual(["First", "Second, edited"]);
  });
});
