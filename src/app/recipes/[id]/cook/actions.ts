"use server";

import { prisma } from "@/lib/db";
import { visibleRecipes } from "@/lib/recipe-visibility";
import { requireHousehold } from "@/lib/session";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

/**
 * The day to record a dish against: the cook's own, within reason.
 *
 * The browser says what day it is where the cooking happened, because the
 * evening is what matters and UTC turns over in the middle of an American
 * dinner. Trusted only to a day either side of the server's clock - every
 * time zone fits in that, and nothing else does - and otherwise replaced by
 * the server's own date rather than refused, since the meal was still made.
 */
export async function cookedOnDate(
  localDate: string,
  now: Date = new Date(),
): Promise<string> {
  const today = now.toISOString().slice(0, 10);
  if (!ISO_DATE.test(localDate)) return today;
  const asked = new Date(`${localDate}T00:00:00.000Z`).getTime();
  const server = new Date(`${today}T00:00:00.000Z`).getTime();
  return Number.isFinite(asked) && Math.abs(asked - server) <= DAY_MS
    ? localDate
    : today;
}

/**
 * Record that a dish was cooked through, from Done on cook mode's last step.
 *
 * Anything this household can see, as with planning - the id comes from the
 * browser. Once a day per dish: a second Done, or a second phone, is the
 * same meal and is quietly kept as one.
 */
export async function markCookedAction(
  recipeId: string,
  localDate: string,
): Promise<{ recorded: boolean }> {
  const { householdId } = await requireHousehold();

  const recipe = await prisma.recipe.findFirst({
    where: { AND: [{ id: recipeId }, visibleRecipes(householdId)] },
    select: { id: true },
  });
  if (!recipe) return { recorded: false };

  const date = new Date(`${await cookedOnDate(localDate)}T00:00:00.000Z`);
  const { count } = await prisma.cookedMeal.createMany({
    data: [{ householdId, recipeId, date }],
    skipDuplicates: true,
  });
  return { recorded: count > 0 };
}
