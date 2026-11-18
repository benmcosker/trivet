"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import type { Words } from "@/lib/library-refine";
import { draftOwnWords } from "@/lib/own-words";
import { setRecipeShared, shareInOwnWords } from "@/lib/recipe-mutations";
import { requireHousehold } from "@/lib/session";
import { claimUploadSlot } from "@/lib/upload-quota";

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

export type OwnWordsDraftResult =
  { ok: true; words: Words; updatedAt: string } | { ok: false; error: string };

/**
 * A rewrite of this household's recipe in its own words, for the owner to read.
 *
 * Nothing changes yet. The draft carries the `updatedAt` it was made from, so
 * saving it cannot overwrite an edit made in between. One model call, so it
 * comes out of the same daily allowance as reading a card.
 */
export async function draftOwnWordsAction(
  recipeId: string,
): Promise<OwnWordsDraftResult> {
  const user = await requireHousehold();
  const recipe = await prisma.recipe.findFirst({
    where: { id: recipeId, householdId: user.householdId },
    include: { ingredients: { orderBy: { position: "asc" } } },
  });
  if (!recipe) return { ok: false, error: "No such recipe." };

  const slot = await claimUploadSlot(user.id);
  if (!slot.ok) {
    return {
      ok: false,
      error: `That is today's ${slot.limit} reads and rewrites. Try again tomorrow.`,
    };
  }

  const draft = await draftOwnWords(recipe);
  if (!draft.ok) return draft;
  return {
    ok: true,
    words: draft.words,
    updatedAt: recipe.updatedAt.toISOString(),
  };
}

const wordsInput = z.object({
  title: z.string().max(200),
  description: z.string().max(2000).nullable(),
  notes: z.string().max(5000).nullable(),
  instructions: z.array(z.string().max(2000)).max(60),
});

/** Save the rewrite the owner read, and share the recipe. */
export async function shareInOwnWordsAction(
  recipeId: string,
  words: unknown,
  updatedAt: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { householdId } = await requireHousehold();
  const parsed = wordsInput.safeParse(words);
  const expected = new Date(updatedAt);
  if (!parsed.success || Number.isNaN(expected.getTime())) {
    return { ok: false, error: "That version could not be read. Try again." };
  }
  const result = await shareInOwnWords(
    recipeId,
    householdId,
    parsed.data,
    expected,
  );
  if (result.ok) revalidateShared();
  return result;
}
