"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ReviewInput } from "@/lib/review-schema";
import { deleteReview, saveReview } from "@/lib/reviews";
import { requireHousehold } from "@/lib/session";

import type { ActionResult } from "./actions";

/**
 * Reviewing is open to everybody signed in, on every recipe in the library -
 * the same rule as reading it. Neither who uploaded the dish nor which
 * household they are in is checked, or the pool of opinions the average is
 * drawn from would be three people rather than everyone who has cooked it.
 */

/** The list card and the planner tile both show the average, so both go stale. */
function revalidateRecipe(): void {
  revalidatePath("/recipes");
  // The dynamic route rather than one recipe's address: a recipe's address is
  // its title slugged onto its public id, and the id alone - which is all
  // these actions carry - cannot spell it. Revalidating the route covers the
  // page whatever it is called today, which is also what makes a rename
  // visible everywhere at once.
  revalidatePath("/recipes/[id]", "page");
  revalidatePath("/plan");
}

/** Leave a review, or replace the one you left before. */
export async function saveReviewAction(
  recipeId: string,
  input: ReviewInput,
): Promise<ActionResult> {
  const user = await requireHousehold();

  try {
    await saveReview(recipeId, user.id, user.householdId, input);
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof z.ZodError
          ? (error.issues[0]?.message ?? "That review did not save.")
          : "That review did not save.",
    };
  }

  revalidateRecipe();
  return { ok: true };
}

/**
 * Withdraw your own review.
 *
 * The recipe ID identifies which review to remove and what to revalidate; it is
 * not what authorises the delete. That is the user ID, applied inside the
 * query, so nobody can withdraw someone else's verdict.
 */
export async function deleteReviewAction(
  recipeId: string,
): Promise<ActionResult> {
  const user = await requireHousehold();

  const removed = await deleteReview(recipeId, user.id);
  if (!removed) {
    return { ok: false, error: "You have not reviewed this recipe." };
  }

  revalidateRecipe();
  return { ok: true };
}
