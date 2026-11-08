/**
 * Write the rewritten shared-library words, or put the originals back.
 *
 *   npm run library:apply                  # dry run: lists what would change
 *   npm run library:apply -- --write       # applies data/library-refined.json
 *   npm run library:apply -- --revert      # dry run of the undo
 *   npm run library:apply -- --revert --write
 *   npm run library:apply -- --revert --export .library/export-<time>.json
 *
 * Reads `.library/export.json` (from `library:export`) and
 * `data/library-refined.json`. Only titles, descriptions, notes and
 * instructions change, plus nutrition where the box was empty. A recipe edited
 * since the export is skipped, by name.
 * Everything runs in one transaction: if any recipe changed between planning
 * and writing, nothing is written and the run says which. See
 * `src/lib/library-refine.ts` for the rules.
 */
import { readFileSync } from "node:fs";

import "dotenv/config";

import { prisma } from "@/lib/db";
import {
  checkRewrites,
  planApply,
  planRevert,
  type CurrentRecipe,
  type ExportedRecipe,
  type Rewrite,
} from "@/lib/library-refine";
import { writePlan } from "@/lib/library-refine-write";

const EXPORT = ".library/export.json";
const REFINED = "data/library-refined.json";

const args = new Set(process.argv.slice(2));
// `--export <file>` reverts against an older export kept by library:export.
const exportArg = process.argv.indexOf("--export");
const exportPath = exportArg > 0 ? process.argv[exportArg + 1] : EXPORT;
const write = args.has("--write");
const revert = args.has("--revert");

function readJson<T>(path: string, hint: string): T {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    console.error(`Could not read ${path}. ${hint}`);
    process.exit(2);
  }
}

async function main() {
  const exported = readJson<ExportedRecipe[]>(
    exportPath,
    "Run `npm run library:export` first.",
  );
  const rewrites = readJson<Rewrite[]>(REFINED, "The rewrite file is missing.");

  const problems = checkRewrites(exported, rewrites);
  if (problems.length > 0 && !revert) {
    console.error("The rewrite file is not ready:");
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(2);
  }

  const rows = await prisma.recipe.findMany({
    where: { id: { in: rewrites.map((r) => r.id) } },
    select: {
      id: true,
      title: true,
      description: true,
      notes: true,
      instructions: true,
      isShared: true,
      updatedAt: true,
      caloriesKcal: true,
      proteinG: true,
      carbsG: true,
      fatG: true,
      nutritionEstimated: true,
    },
  });
  const current: CurrentRecipe[] = rows.map(
    ({ caloriesKcal, proteinG, carbsG, fatG, ...r }) => ({
      ...r,
      updatedAt: r.updatedAt.toISOString(),
      nutrition: { caloriesKcal, proteinG, carbsG, fatG },
    }),
  );

  const plan = revert
    ? planRevert(exported, current, rewrites)
    : planApply(exported, current, rewrites);

  const verb = revert ? "Restore" : "Rewrite";
  console.log(`${verb} ${plan.changes.length} recipe(s):`);
  for (const c of plan.changes) {
    const renamed = c.data.title !== c.title ? ` → "${c.data.title}"` : "";
    const kcal =
      c.data.caloriesKcal != null
        ? ` (${c.data.caloriesKcal} kcal${c.data.nutritionEstimated ? ", estimated" : ""})`
        : "";
    console.log(`  ${c.title}${renamed}${kcal}`);
  }
  if (plan.skipped.length > 0) {
    console.log(`Skip ${plan.skipped.length}:`);
    for (const s of plan.skipped) console.log(`  ${s.title}: ${s.reason}`);
  }

  if (!write) {
    console.log("\nDry run. Nothing was written. Add --write to apply.");
    return;
  }
  if (plan.changes.length === 0) {
    console.log("\nNothing to write.");
    return;
  }

  const written = await writePlan(plan.changes);
  console.log(`\nDone: ${written} recipe(s) written.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
