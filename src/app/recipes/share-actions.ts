"use server";

import { revalidatePath } from "next/cache";

import { setRecipeShared } from "@/lib/recipe-mutations";
import {
  removeSharedWithUs,
  shareWithHousehold,
  stopSharingWith,
  type ShareResult,
} from "@/lib/recipe-shares";
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
  revalidateShared();
}

function revalidateShared() {
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

/** Share this household's recipe with the household of whoever has `email`. */
export async function shareWithHouseholdAction(
  recipeId: string,
  email: string,
): Promise<ShareResult> {
  const { householdId } = await requireHousehold();
  const result = await shareWithHousehold(recipeId, householdId, email);
  if (result.ok) revalidateShared();
  return result;
}

/** Stop sharing this household's recipe with one household. */
export async function stopSharingWithAction(
  recipeId: string,
  withHouseholdId: string,
): Promise<void> {
  const { householdId } = await requireHousehold();
  await stopSharingWith(recipeId, householdId, withHouseholdId);
  revalidateShared();
}

/** Take a recipe another household shared out of this household's library. */
export async function removeSharedWithUsAction(
  recipeId: string,
): Promise<void> {
  const { householdId } = await requireHousehold();
  await removeSharedWithUs(recipeId, householdId);
  revalidateShared();
}
