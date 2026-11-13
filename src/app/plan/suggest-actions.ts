"use server";

import { revalidatePath } from "next/cache";

import { addSuggestedDinners } from "@/lib/plan-mutations";
import { requireHousehold } from "@/lib/session";

/**
 * Put the dinners the suggestion sheet proposed on the week: only into
 * evenings still empty, and only recipes this household can see. The logic
 * is in `plan-mutations.ts`; says how many it added, so a sheet that lost a
 * race can say so.
 */
export async function addSuggestedDinnersAction(
  picks: { date: string; recipeId: string }[],
): Promise<{ added: number }> {
  const { householdId } = await requireHousehold();
  const result = await addSuggestedDinners(householdId, picks);
  revalidatePath("/plan");
  return result;
}
