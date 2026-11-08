/**
 * Rewriting the shared library's words, safely.
 *
 * Shared recipes are seen by every household, so their wording is the part of
 * Trivet with copyright exposure: a method copied from a meal-kit card or a
 * cookbook is someone else's prose. Ingredients and quantities are facts and
 * stay as they are. What changes is a recipe's title, description, notes and
 * instructions, rewritten in Trivet's own words, each description ending
 * "Adapted from <source>".
 *
 * The flow, and why it is three steps:
 *
 *   1. `npm run library:export` reads every shared recipe and writes the words
 *      as they stand to `.library/export.json`. Git ignores that folder: the
 *      originals are the copyrighted text, and the repository is public.
 *   2. The rewrite goes in `data/library-refined.json`, our own text only.
 *   3. `npm run library:apply` changes the database, dry run first.
 *
 * The rule that matters: a recipe somebody has edited since the export is
 * never overwritten. Each export row carries its `updatedAt`, and a recipe
 * whose `updatedAt` has moved since then is skipped, by name.
 *
 * Pure functions, so the rules test without a database; the scripts in
 * `scripts/` do the reading and writing.
 */

/** The fields a rewrite may change. Nothing else is ever written. */
export const REFINED_FIELDS = [
  "title",
  "description",
  "notes",
  "instructions",
] as const;

export type Words = {
  title: string;
  description: string | null;
  notes: string | null;
  instructions: string[];
};

/** One shared recipe as the export found it. */
export type ExportedRecipe = Words & {
  id: string;
  publicId: string;
  householdName: string;
  sourceName: string | null;
  sourceUrl: string | null;
  sourceFileName: string | null;
  /** ISO time. The guard against overwriting a later edit. */
  updatedAt: string;
};

/** The recipe as it stands in the database at apply time. */
export type CurrentRecipe = Words & {
  id: string;
  isShared: boolean;
  updatedAt: string;
};

export type Rewrite = Words & { id: string };

export type Change = {
  id: string;
  title: string;
  /** The `updatedAt` the write is conditional on. */
  expectedUpdatedAt: string;
  data: Words;
};

export type Skip = { id: string; title: string; reason: string };

export type Plan = { changes: Change[]; skipped: Skip[] };

/**
 * Problems in the rewrite file itself, found before anything is planned. A
 * non-empty list means the file is not ready and nothing should be applied.
 */
export function checkRewrites(
  exported: ExportedRecipe[],
  rewrites: Rewrite[],
): string[] {
  const problems: string[] = [];
  const byId = new Map(exported.map((r) => [r.id, r]));
  const seen = new Set<string>();

  for (const r of rewrites) {
    const original = byId.get(r.id);
    const name = original?.title ?? r.id;
    if (seen.has(r.id)) problems.push(`${name}: rewritten twice`);
    seen.add(r.id);
    if (!original) {
      problems.push(`${r.id}: not in the export`);
      continue;
    }
    if (!r.title.trim()) problems.push(`${name}: empty title`);
    if (!r.description || !/Adapted from \S/.test(r.description)) {
      problems.push(`${name}: description has no "Adapted from"`);
    }
    if (original.instructions.length > 0 && r.instructions.length === 0) {
      problems.push(`${name}: instructions dropped`);
    }
    if (r.instructions.some((step) => !step.trim())) {
      problems.push(`${name}: an empty step`);
    }
    if (original.notes && !r.notes) {
      problems.push(`${name}: notes dropped`);
    }
  }
  return problems;
}

function sameWords(a: Words, b: Words): boolean {
  return (
    a.title === b.title &&
    (a.description ?? null) === (b.description ?? null) &&
    (a.notes ?? null) === (b.notes ?? null) &&
    a.instructions.length === b.instructions.length &&
    a.instructions.every((step, i) => step === b.instructions[i])
  );
}

function words(r: Words): Words {
  return {
    title: r.title,
    description: r.description ?? null,
    notes: r.notes ?? null,
    instructions: [...r.instructions],
  };
}

/** What `library:apply` will write: each rewrite whose recipe is unchanged. */
export function planApply(
  exported: ExportedRecipe[],
  current: CurrentRecipe[],
  rewrites: Rewrite[],
): Plan {
  const exportedById = new Map(exported.map((r) => [r.id, r]));
  const currentById = new Map(current.map((r) => [r.id, r]));
  const plan: Plan = { changes: [], skipped: [] };

  for (const rewrite of rewrites) {
    const was = exportedById.get(rewrite.id);
    const now = currentById.get(rewrite.id);
    const title = was?.title ?? rewrite.title;

    if (!was) {
      plan.skipped.push({ id: rewrite.id, title, reason: "not in the export" });
    } else if (!now) {
      plan.skipped.push({ id: rewrite.id, title, reason: "deleted since" });
    } else if (!now.isShared) {
      plan.skipped.push({ id: rewrite.id, title, reason: "no longer shared" });
    } else if (sameWords(now, rewrite)) {
      plan.skipped.push({ id: rewrite.id, title, reason: "already applied" });
    } else if (now.updatedAt !== was.updatedAt) {
      plan.skipped.push({
        id: rewrite.id,
        title,
        reason: "edited since the export",
      });
    } else {
      plan.changes.push({
        id: rewrite.id,
        title,
        expectedUpdatedAt: now.updatedAt,
        data: words(rewrite),
      });
    }
  }
  return plan;
}

/**
 * Undo: put the exported words back, but only on recipes still holding
 * exactly the rewrite. One edited by hand after the apply is left alone.
 */
export function planRevert(
  exported: ExportedRecipe[],
  current: CurrentRecipe[],
  rewrites: Rewrite[],
): Plan {
  const exportedById = new Map(exported.map((r) => [r.id, r]));
  const currentById = new Map(current.map((r) => [r.id, r]));
  const plan: Plan = { changes: [], skipped: [] };

  for (const rewrite of rewrites) {
    const was = exportedById.get(rewrite.id);
    const now = currentById.get(rewrite.id);
    const title = was?.title ?? rewrite.title;

    if (!was) {
      plan.skipped.push({ id: rewrite.id, title, reason: "not in the export" });
    } else if (!now) {
      plan.skipped.push({ id: rewrite.id, title, reason: "deleted since" });
    } else if (!sameWords(now, rewrite)) {
      plan.skipped.push({
        id: rewrite.id,
        title,
        reason: "not holding the rewrite (never applied, or edited since)",
      });
    } else {
      plan.changes.push({
        id: rewrite.id,
        title,
        expectedUpdatedAt: now.updatedAt,
        data: words(was),
      });
    }
  }
  return plan;
}
