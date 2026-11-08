import { prisma } from "@/lib/db";

import type { Change } from "./library-refine";

/**
 * Write a planned set of changes in one transaction.
 *
 * Each write is conditional on the `updatedAt` the plan saw, so a recipe
 * edited between planning and writing rolls the whole run back and nothing is
 * written. Kept apart from `library-refine.ts`, which stays free of Prisma so
 * its rules test without a database.
 */
export async function writePlan(changes: Change[]): Promise<number> {
  if (changes.length === 0) return 0;
  await prisma.$transaction(
    async (tx) => {
      for (const c of changes) {
        const { count } = await tx.recipe.updateMany({
          where: { id: c.id, updatedAt: new Date(c.expectedUpdatedAt) },
          data: c.data,
        });
        if (count !== 1) {
          throw new Error(
            `"${c.title}" changed while this ran. Nothing was written; run it again.`,
          );
        }
      }
    },
    // About one round trip per recipe to a remote database.
    { timeout: 120_000, maxWait: 10_000 },
  );
  return changes.length;
}
