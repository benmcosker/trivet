import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { addExtraItem } from "@/lib/extras";
import { addPantryItem } from "@/lib/pantry";
import { weekShoppingList } from "@/lib/week-list";

import { makeHousehold, resetDatabase as reset } from "./support/db";

const hasDb = Boolean(process.env.DATABASE_URL);

const WEEK = new Date("2026-09-07T00:00:00.000Z");

/** A dinner on the Monday of WEEK, with the ingredients given. */
async function planDinner(
  householdId: string,
  createdById: string,
  ingredients: string[],
  slot: "DINNER" | "DINNER_2" | "DINNER_3" = "DINNER",
) {
  const recipe = await prisma.recipe.create({
    data: {
      title: `Roast Chicken ${slot}`,
      servings: 4,
      instructions: ["Roast it."],
      householdId,
      createdById,
      ingredients: {
        create: ingredients.map((name, position) => ({
          name,
          quantity: 1,
          position,
        })),
      },
    },
  });

  await prisma.plannedMeal.create({
    data: {
      date: WEEK,
      slot,
      servings: 4,
      recipeId: recipe.id,
      householdId,
    },
  });
}

const names = (lines: { name: string }[]) => lines.map((l) => l.name).sort();

describe.skipIf(!hasDb)("the week's shopping list", () => {
  beforeEach(reset);
  afterAll(async () => {
    await reset();
    await prisma.$disconnect();
  });

  /*
   * The hand-off used to build its lines without exclusions, so a staple you
   * never buy and a line you had already ticked off went to the shop anyway,
   * while the same week texted correctly. One assembler now, so the three
   * callers cannot disagree again.
   */
  it("leaves out pantry staples", async () => {
    const { householdId, userId } = await makeHousehold();
    await planDinner(householdId, userId, ["chicken", "olive oil"]);
    await addPantryItem("olive oil", householdId, userId);

    expect(names(await weekShoppingList(WEEK, householdId))).toEqual([
      "chicken",
    ]);
  });

  it("leaves out anything ticked off for the week", async () => {
    const { householdId, userId } = await makeHousehold();
    await planDinner(householdId, userId, ["chicken", "lemons"]);
    await prisma.weeklySkip.create({
      data: {
        name: "lemons",
        normalisedName: "lemons",
        weekStart: WEEK,
        householdId,
        createdById: userId,
      },
    });

    expect(names(await weekShoppingList(WEEK, householdId))).toEqual([
      "chicken",
    ]);
  });

  it("keeps a hand-added item even when the pantry has it", async () => {
    const { householdId, userId } = await makeHousehold();
    await planDinner(householdId, userId, ["chicken", "olive oil"]);
    await addPantryItem("olive oil", householdId, userId);
    await addExtraItem({ name: "olive oil" }, WEEK, householdId, userId);

    // The recipe's line is still excluded; the one typed on purpose is not.
    expect(names(await weekShoppingList(WEEK, householdId))).toEqual([
      "chicken",
      "olive oil",
    ]);
  });

  it("carries hand-added items that no recipe asked for", async () => {
    const { householdId, userId } = await makeHousehold();
    await planDinner(householdId, userId, ["chicken"]);
    await addExtraItem(
      { name: "Kitchen roll", amount: "2" },
      WEEK,
      householdId,
      userId,
    );

    const lines = await weekShoppingList(WEEK, householdId);
    expect(names(lines)).toEqual(["Kitchen roll", "chicken"]);
    expect(lines.find((l) => l.extraId)?.amountLabel).toBe("2");
  });

  /*
   * An evening can hold three mains. The failure this guards is a dish planned
   * into a slot the shopping list never queries - it shows on the planner and
   * is quietly missing from the list you shop from.
   */
  it("shops for every dinner on an evening, not just the first", async () => {
    const { householdId, userId } = await makeHousehold();
    await planDinner(householdId, userId, ["chicken"], "DINNER");
    await planDinner(householdId, userId, ["lamb"], "DINNER_2");
    await planDinner(householdId, userId, ["lentils"], "DINNER_3");

    expect(names(await weekShoppingList(WEEK, householdId))).toEqual([
      "chicken",
      "lamb",
      "lentils",
    ]);
  });

  it("merges an ingredient two of the evening's dinners both need", async () => {
    const { householdId, userId } = await makeHousehold();
    await planDinner(householdId, userId, ["butter"], "DINNER");
    await planDinner(householdId, userId, ["butter"], "DINNER_2");

    const lines = await weekShoppingList(WEEK, householdId);
    expect(lines).toHaveLength(1);
    // One line, both dishes named under it, and the quantities added up.
    expect(lines[0].fromRecipes).toHaveLength(2);
    expect(lines[0].quantity).toBe(2);
  });

  it("is empty for a week with nothing planned and nothing added", async () => {
    const { householdId } = await makeHousehold();
    expect(await weekShoppingList(WEEK, householdId)).toEqual([]);
  });
});
