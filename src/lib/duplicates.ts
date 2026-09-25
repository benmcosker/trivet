import { createHash } from "node:crypto";

import { prisma } from "./db";

export type ExistingRecipe = {
  id: string;
  /** The stable half of its address, so a link can be offered. */
  publicId: string;
  title: string;
};

/** SHA-256 of a file's bytes, hex encoded. */
export function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Has this exact file been uploaded before?
 *
 * Checked before extraction rather than after, which is the whole point: a
 * second upload of the same file costs nothing instead of a slow, billable
 * model call whose result is thrown away. A photograph only matches a
 * byte-identical photograph - two shots of the same card differ in every
 * pixel - so this catches re-uploading a file, not re-photographing a card.
 *
 * Scoped to the household. A widely printed card that two families both own is
 * not a duplicate, and answering the second one with "you already have this"
 * would be both wrong and a way of learning what the first one keeps.
 */
export async function findRecipeBySourceHash(
  sourceFileSha256: string,
  householdId: string,
): Promise<ExistingRecipe | null> {
  return prisma.recipe.findUnique({
    where: {
      householdId_sourceFileSha256: { householdId, sourceFileSha256 },
    },
    select: { id: true, publicId: true, title: true },
  });
}

/**
 * How alike two titles must be before it is worth interrupting someone.
 *
 * Tuned against the cases that matter: "Chicken Piccata" vs "Chicken Piccata!"
 * should warn, "Chicken Piccata" vs "Chicken Soup" should not. Lower values
 * start flagging every chicken dish in the library, which trains people to
 * dismiss the warning without reading it.
 */
export const TITLE_SIMILARITY_THRESHOLD = 0.55;

/**
 * Recipes whose titles look like this one.
 *
 * A different PDF of the same dish, or one typed in by hand, has no bytes in
 * common with anything - only the name gives it away. This is a warning rather
 * than a block: two genuinely different recipes can share a name, and the
 * household is better placed than a similarity score to judge which.
 *
 * Only warns about recipes the household can actually open. A warning naming
 * a dish somebody cannot look at is no help, and the name is itself the thing
 * a private recipe is keeping.
 *
 * Uses the pg_trgm index already on recipe.title, so it costs an index lookup
 * rather than a scan.
 */
export async function findSimilarlyTitled(
  title: string,
  householdId: string,
  options: { excludeId?: string; limit?: number } = {},
): Promise<ExistingRecipe[]> {
  const trimmed = title.trim();
  if (!trimmed) return [];

  const rows = await prisma.$queryRaw<
    { id: string; publicId: string; title: string; score: number }[]
  >`
    SELECT "id", "publicId", "title", similarity("title", ${trimmed})::float8 AS score
    FROM "recipe"
    WHERE similarity("title", ${trimmed}) >= ${TITLE_SIMILARITY_THRESHOLD}
      AND ("id" <> ${options.excludeId ?? ""})
      AND ("householdId" = ${householdId} OR "isShared")
    ORDER BY score DESC
    LIMIT ${options.limit ?? 3}
  `;

  return rows.map(({ id, publicId, title: t }) => ({ id, publicId, title: t }));
}
