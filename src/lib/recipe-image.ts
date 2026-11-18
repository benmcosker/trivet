import { prisma } from "./db";
import { clearNeedsPhoto } from "./photo-todo";
import { deleteFile, storeFile } from "./storage";

/**
 * Give a recipe its photo, replacing whatever it had.
 *
 * One image per recipe, so this is a swap rather than an append. The old file
 * is removed after the new URL is saved, never before: a failed delete then
 * leaves an orphaned blob, which is untidy, while the other order would leave
 * the recipe pointing at a file that no longer exists.
 */
export async function setRecipeImage(
  recipeId: string,
  householdId: string,
  bytes: Uint8Array,
  filename: string,
  contentType: string,
): Promise<string> {
  // The photo follows the same rule as the rest of the recipe: anyone may look
  // at it, only the household who added the recipe may change it. Checked
  // before the upload rather than after, so no bytes are stored for a write
  // that was never going to be allowed.
  const existing = await prisma.recipe.findFirst({
    where: { id: recipeId, householdId },
    select: { imageUrl: true },
  });
  if (!existing) throw new Error("No such recipe");

  const stored = await storeFile(bytes, filename, contentType);

  await prisma.recipe.update({
    where: { id: recipeId },
    // Added by hand, so it is the household's own and travels with the recipe
    // when it is shared.
    data: { imageUrl: stored.url, imageFromSource: false },
  });
  // A new photo is what the "Needs photo" list was waiting for.
  await clearNeedsPhoto(recipeId);

  await discard(existing.imageUrl, stored.url);

  return stored.url;
}

/** Take the photo away, leaving the placeholder in its place. */
export async function clearRecipeImage(
  recipeId: string,
  householdId: string,
): Promise<void> {
  const existing = await prisma.recipe.findFirst({
    where: { id: recipeId, householdId },
    select: { imageUrl: true },
  });
  if (!existing?.imageUrl) return;

  await prisma.recipe.update({
    where: { id: recipeId },
    data: { imageUrl: null, imageFromSource: false },
  });

  await discard(existing.imageUrl, null);
}

/**
 * Remove a file the recipe no longer points at.
 *
 * Guarded against deleting the one just written: a PDF-extracted photo and a
 * re-upload of the same bytes could in principle produce the same URL, and
 * deleting it would blank the recipe we just set.
 */
async function discard(
  previousUrl: string | null,
  currentUrl: string | null,
): Promise<void> {
  if (!previousUrl || previousUrl === currentUrl) return;
  await deleteFile(previousUrl);
}
