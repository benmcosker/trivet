/**
 * Write every shared recipe's words to `.library/export.json`.
 *
 *   npm run library:export
 *
 * Read-only. Run it against the database whose library is being rewritten
 * (production: `vercel env pull` puts its DATABASE_URL in a local env file).
 * The output holds the original, copyrighted wording, so `.library/` is
 * git-ignored and the file never belongs in a commit. See
 * `src/lib/library-refine.ts` for the whole flow.
 */
import { mkdirSync, writeFileSync } from "node:fs";

import "dotenv/config";

import { prisma } from "@/lib/db";
import type { ExportedRecipe } from "@/lib/library-refine";

const OUT_DIR = ".library";
const OUT = `${OUT_DIR}/export.json`;

async function main() {
  const recipes = await prisma.recipe.findMany({
    where: { isShared: true },
    orderBy: [{ household: { name: "asc" } }, { title: "asc" }],
    select: {
      id: true,
      publicId: true,
      title: true,
      description: true,
      notes: true,
      instructions: true,
      sourceName: true,
      sourceUrl: true,
      sourceFileName: true,
      updatedAt: true,
      household: { select: { name: true } },
    },
  });

  const rows: ExportedRecipe[] = recipes.map((r) => ({
    id: r.id,
    publicId: r.publicId,
    householdName: r.household.name,
    title: r.title,
    description: r.description,
    notes: r.notes,
    instructions: r.instructions,
    sourceName: r.sourceName,
    sourceUrl: r.sourceUrl,
    sourceFileName: r.sourceFileName,
    updatedAt: r.updatedAt.toISOString(),
  }));

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT, JSON.stringify(rows, null, 2) + "\n");

  const households = new Set(rows.map((r) => r.householdName));
  console.log(
    `Exported ${rows.length} shared recipes from ${households.size} household(s) to ${OUT}.`,
  );
  console.log("It holds the original wording: keep it out of git.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
