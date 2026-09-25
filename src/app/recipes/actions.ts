"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  createRecipe,
  deleteRecipe,
  updateRecipe,
} from "@/lib/recipe-mutations";
import { recipeInput, type RecipeInput } from "@/lib/recipe-schema";
import { requireHousehold } from "@/lib/session";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Every mutation re-checks the session server-side. The UI hides these controls
 * from signed-out visitors, but that is presentation, not enforcement.
 */
export async function saveRecipeAction(
  raw: unknown,
  existingId?: string,
): Promise<ActionResult> {
  const user = await requireHousehold();

  const parsed = recipeInput.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid recipe",
    };
  }

  const input: RecipeInput = parsed.data;

  let id: string;
  if (existingId) {
    const updated = await updateRecipe(existingId, user.householdId, input);
    if (!updated) {
      return { ok: false, error: "That recipe is not in your library." };
    }
    id = existingId;
  } else {
    id = await createRecipe(input, user.householdId, user.id);
  }

  revalidatePath("/recipes");
  // The dynamic route rather than one recipe's address: a recipe's address is
  // its title slugged onto its public id, and the id alone - which is all
  // these actions carry - cannot spell it. Revalidating the route covers the
  // page whatever it is called today, which is also what makes a rename
  // visible everywhere at once.
  revalidatePath("/recipes/[id]", "page");
  /*
   * By id, which the recipe page then corrects to the readable address.
   *
   * It could be spelled out here instead, at the cost of a second query for
   * the title this function has just written. One place decides what a
   * recipe's address is, and everywhere else is allowed to be a step behind.
   */
  redirect(`/recipes/${id}`);
}

export async function deleteRecipeAction(id: string): Promise<void> {
  const { householdId } = await requireHousehold();
  await deleteRecipe(id, householdId);
  revalidatePath("/recipes");
  redirect("/recipes");
}
