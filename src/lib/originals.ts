/**
 * Clearing out stored files Trivet no longer keeps.
 *
 * Two kinds, both at public (if unguessable) addresses in the blob store:
 *
 * - **Original cards.** Every uploaded PDF or photographed card used to be
 *   kept after its recipe was saved, behind an "Original card" chip. That
 *   stopped on 20 November: a stored copy of a cookbook page or a meal kit's
 *   PDF is someone else's work, and re-checking a card later was judged too
 *   small a use to justify it. New saves delete the card
 *   (`saveExtractedRecipeAction`); `npm run originals:delete` clears the ones
 *   saved before.
 * - **Files nothing points at.** Deleting a recipe used to leave its photo and
 *   card behind; it no longer does (`deleteRecipe`), and the same script sweeps
 *   up what was left.
 *
 * Pure, so the rule is tested without a store; the script does the listing
 * and deleting.
 */

/** A file in the store, as the blob listing describes it. */
export type StoredBlob = {
  url: string;
  pathname: string;
  size: number;
  uploadedAt: Date;
};

/**
 * How old a file must be before it counts as unused. A card is stored the
 * moment it is uploaded and only referenced once its recipe is saved, so a
 * newer file may be one somebody is still reviewing.
 */
export const ORPHAN_MIN_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Files no recipe refers to, old enough that no review can still be open on
 * them. `referenced` is every `imageUrl` and `sourceFileUrl` still in use.
 */
export function orphanedFiles(
  blobs: StoredBlob[],
  referenced: ReadonlySet<string>,
  now: Date,
  minAgeMs: number = ORPHAN_MIN_AGE_MS,
): StoredBlob[] {
  return blobs.filter(
    (blob) =>
      !referenced.has(blob.url) &&
      now.getTime() - blob.uploadedAt.getTime() >= minAgeMs,
  );
}

/** "3 files, 4.2 MB", for a script's summary line. */
export function describeFiles(files: { size: number }[]): string {
  const bytes = files.reduce((sum, f) => sum + f.size, 0);
  const mb = (bytes / (1024 * 1024)).toFixed(1);
  return `${files.length} file${files.length === 1 ? "" : "s"}, ${mb} MB`;
}
