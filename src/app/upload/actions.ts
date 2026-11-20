"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createRecipe } from "@/lib/recipe-mutations";
import { recipeInput } from "@/lib/recipe-schema";
import { requireHousehold, requireUser } from "@/lib/session";
import { deleteFile } from "@/lib/storage";

export type SaveExtractedResult = { ok: false; error: string };

/**
 * Save a recipe the uploader has reviewed.
 *
 * The extracted fields arrive from the client, so they are re-validated here -
 * the review screen is a convenience, not a trust boundary.
 */
export async function saveExtractedRecipeAction(
  raw: unknown,
  assets: {
    source?: "PDF" | "PHOTO" | "URL" | "TEXT";
    sourceFileUrl?: string | null;
    sourceFileName?: string | null;
    sourceFileType?: string | null;
    sourceFileSha256?: string | null;
    imageUrl?: string | null;
  },
): Promise<SaveExtractedResult> {
  const user = await requireHousehold();

  const parsed = recipeInput.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid recipe",
    };
  }

  // The card itself is not kept. It was stored so the review screen could
  // show it; once the recipe is saved, nothing needs it, and a stored copy of
  // a cookbook page or a meal kit's PDF is someone else's work sitting at a
  // public address. Its fingerprint stays, so the same card uploaded again is
  // still recognised. (Decided with Ben, 18 November.)
  const id = await createRecipe(parsed.data, user.householdId, user.id, {
    source: assets.source ?? "PDF",
    sourceFileSha256: assets.sourceFileSha256 ?? null,
    imageUrl: assets.imageUrl ?? null,
  });
  if (assets.sourceFileUrl) await deleteFile(assets.sourceFileUrl);

  revalidatePath("/recipes");
  redirect(`/recipes/${id}`);
}

/**
 * Throw away files stored for an extraction the uploader decided against.
 *
 * The card and any dish photo are stored before the review screen so it has
 * something to show. If the draft is discarded, nothing will ever reference them again, so
 * they are removed here rather than left to accumulate silently in the blob
 * store.
 */
export async function discardUploadAction(assets: {
  sourceFileUrl?: string | null;
  imageUrl?: string | null;
}): Promise<void> {
  await requireUser();

  await Promise.all([
    assets.sourceFileUrl ? deleteFile(assets.sourceFileUrl) : Promise.resolve(),
    assets.imageUrl ? deleteFile(assets.imageUrl) : Promise.resolve(),
  ]);
}
