"use server";

import { revalidatePath } from "next/cache";

import { setRecipeShared } from "@/lib/recipe-mutations";
import { requireHousehold } from "@/lib/session";

/**
 * Share a recipe with the other households, or take it back.
 *
 * Silent when the recipe is not this household's: the button only exists for
 * an owner, so a call that reaches here for somebody else's recipe is not a
 * user to explain anything to.
 */
export async function setRecipeSharedAction(
  recipeId: string,
  isShared: boolean,
): Promise<void> {
  const { householdId } = await requireHousehold();
  await setRecipeShared(recipeId, householdId, isShared);

  // The dynamic route rather than one recipe's address: a recipe's address is
  // its title slugged onto its public id, and the id alone - which is all
  // these actions carry - cannot spell it. Revalidating the route covers the
  // page whatever it is called today, which is also what makes a rename
  // visible everywhere at once.
  revalidatePath("/recipes/[id]", "page");
  // The library listing changes for everybody else, not just for the owner.
  revalidatePath("/recipes");
  revalidatePath("/plan");
}
