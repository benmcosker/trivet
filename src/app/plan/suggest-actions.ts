"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { defaultServingsFor } from "@/lib/household";
import { DINNER_SLOTS, FIRST_DINNER } from "@/lib/meal-slots";
import { visibleRecipes } from "@/lib/recipe-visibility";
import { clampServings } from "@/lib/scale";
import { requireHousehold } from "@/lib/session";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Put the dinners the suggestion sheet proposed on the week.
 *
 * Only ever into an empty evening. The sheet was drawn from the page as it
 * was when it opened, and somebody else in the household may have planned
 * Thursday since - so an evening that has any dinner by now is skipped, not
 * overwritten. A suggestion is never worth more than a choice somebody made.
 *
 * Each recipe is checked the same way a single pick is: anything this
 * household can see, and nothing else, because the ids come from the
 * browser. Servings are decided the same way too.
 *
 * Says how many it added, so a sheet that lost a race can say so.
 */
export async function addSuggestedDinnersAction(
  picks: { date: string; recipeId: string }[],
): Promise<{ added: number }> {
  const { householdId } = await requireHousehold();

  // One per evening, at most a week of them, and only well-formed dates.
  const byDate = new Map<string, string>();
  for (const pick of picks.slice(0, 7)) {
    if (ISO_DATE.test(pick.date) && !byDate.has(pick.date)) {
      byDate.set(pick.date, pick.recipeId);
    }
  }
  if (byDate.size === 0) return { added: 0 };

  const dates = [...byDate.keys()].map((d) => new Date(`${d}T00:00:00.000Z`));

  const [recipes, occupied, household] = await Promise.all([
    prisma.recipe.findMany({
      where: {
        AND: [
          { id: { in: [...byDate.values()] } },
          visibleRecipes(householdId),
        ],
      },
      select: { id: true, servings: true },
    }),
    prisma.plannedMeal.findMany({
      where: {
        householdId,
        date: { in: dates },
        slot: { in: [...DINNER_SLOTS] },
      },
      select: { date: true },
    }),
    defaultServingsFor(householdId),
  ]);

  const servingsOf = new Map(recipes.map((r) => [r.id, r.servings]));
  const taken = new Set(occupied.map((m) => m.date.toISOString().slice(0, 10)));

  const rows = [...byDate].flatMap(([date, recipeId]) => {
    const makes = servingsOf.get(recipeId);
    if (makes == null || taken.has(date)) return [];
    return [
      {
        householdId,
        date: new Date(`${date}T00:00:00.000Z`),
        slot: FIRST_DINNER,
        recipeId,
        servings: clampServings(household ?? makes, makes),
      },
    ];
  });

  // skipDuplicates as well as the check above: if the first dinner was
  // filled between the two, the unique key keeps it rather than this.
  const { count } = await prisma.plannedMeal.createMany({
    data: rows,
    skipDuplicates: true,
  });

  revalidatePath("/plan");
  return { added: count };
}
