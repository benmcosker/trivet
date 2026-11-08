/**
 * Rewriting the shared library's words, safely.
 *
 * Shared recipes are seen by every household, so their wording is the part of
 * Trivet with copyright exposure: a method copied from a meal-kit card or a
 * cookbook is someone else's prose. Ingredients and quantities are facts and
 * stay as they are. What changes is a recipe's title, description, notes and
 * instructions, rewritten in Trivet's own words, each description ending
 * "Adapted from <source>" (except sources in `UNCREDITED_SOURCES`).
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
 * A rewrite may also fill in a recipe's nutrition, but only where the box was
 * empty at export time: figures a recipe printed are never replaced. Each
 * filled box says whether the figures were read off the card or estimated
 * from the ingredients, and the recipe page labels the estimates.
 *
 * Pure functions, so the rules test without a database; the scripts in
 * `scripts/` do the reading and writing.
 */

import { MACRO_RANGE } from "./recipe-schema";

/**
 * Sources the library does not name. Their recipes are rewritten in full and
 * carry no "Adapted from" credit, and a rewrite that still mentions them is
 * refused.
 */
export const UNCREDITED_SOURCES: ReadonlySet<string> = new Set([
  "Marley Spoon",
]);

/**
 * The word fields a rewrite may change. The only other fields ever written
 * are the four in `NUTRITION_FIELDS` and `nutritionEstimated`, and only into
 * an empty nutrition box.
 */
export const REFINED_FIELDS = [
  "title",
  "description",
  "notes",
  "instructions",
] as const;

/** The four macro figures for one serving, as stored on a recipe. */
export type Nutrition = {
  caloriesKcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
};

export const NUTRITION_FIELDS = [
  "caloriesKcal",
  "proteinG",
  "carbsG",
  "fatG",
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
  /** Missing from exports made before the tools handled nutrition. */
  nutrition?: Nutrition;
  nutritionEstimated?: boolean;
  /** What a nutrition estimate is worked out from. Read only, never written. */
  servings?: number;
  ingredients?: {
    name: string;
    quantity: number | null;
    unit: string | null;
    note: string | null;
  }[];
};

/** The recipe as it stands in the database at apply time. */
export type CurrentRecipe = Words & {
  id: string;
  isShared: boolean;
  updatedAt: string;
  nutrition: Nutrition;
  nutritionEstimated: boolean;
};

/** Nutrition for an empty box, and whether it is an estimate. */
export type RewriteNutrition = Nutrition & { estimated: boolean };

export type Rewrite = Words & { id: string; nutrition?: RewriteNutrition };

export type Change = {
  id: string;
  title: string;
  /** The `updatedAt` the write is conditional on. */
  expectedUpdatedAt: string;
  data: Words & Partial<Nutrition & { nutritionEstimated: boolean }>;
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
    const text = [r.title, r.description, r.notes, ...r.instructions].join(" ");
    for (const unnamed of UNCREDITED_SOURCES) {
      if (text.includes(unnamed))
        problems.push(`${name}: still names ${unnamed}`);
    }
    // Words left exactly as they were (a household's own recipe getting only
    // nutrition) owe no credit: there is nothing of anyone else's in them.
    const uncredited =
      sameWords(original, r) ||
      (original.sourceName !== null &&
        UNCREDITED_SOURCES.has(original.sourceName));
    if (
      !uncredited &&
      (!r.description || !/Adapted from \S/.test(r.description))
    ) {
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
    if (r.nutrition)
      problems.push(...checkNutrition(name, original, r.nutrition));
  }
  return problems;
}

function checkNutrition(
  name: string,
  original: ExportedRecipe,
  n: RewriteNutrition,
): string[] {
  const problems: string[] = [];
  if (!original.nutrition) {
    problems.push(`${name}: the export has no nutrition; export again`);
  } else if (NUTRITION_FIELDS.some((k) => original.nutrition![k] !== null)) {
    problems.push(`${name}: nutrition is already filled in`);
  }
  if (NUTRITION_FIELDS.every((k) => n[k] === null)) {
    problems.push(`${name}: nutrition is empty`);
  }
  for (const k of NUTRITION_FIELDS) {
    const v = n[k];
    const { min, max, label } = MACRO_RANGE[k];
    if (v !== null && (!Number.isInteger(v) || v < min || v > max)) {
      problems.push(`${name}: ${label} out of range`);
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

function nutritionOf(n: Nutrition): Nutrition {
  return {
    caloriesKcal: n.caloriesKcal,
    proteinG: n.proteinG,
    carbsG: n.carbsG,
    fatG: n.fatG,
  };
}

/** Whether a recipe holds exactly what a rewrite would write. */
function holdsRewrite(now: CurrentRecipe, rewrite: Rewrite): boolean {
  if (!sameWords(now, rewrite)) return false;
  const n = rewrite.nutrition;
  return (
    !n ||
    (NUTRITION_FIELDS.every((k) => now.nutrition[k] === n[k]) &&
      now.nutritionEstimated === n.estimated)
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
    } else if (holdsRewrite(now, rewrite)) {
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
        data: rewrite.nutrition
          ? {
              ...words(rewrite),
              ...nutritionOf(rewrite.nutrition),
              nutritionEstimated: rewrite.nutrition.estimated,
            }
          : words(rewrite),
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
    } else if (!holdsRewrite(now, rewrite)) {
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
        data:
          rewrite.nutrition && was.nutrition
            ? {
                ...words(was),
                ...nutritionOf(was.nutrition),
                nutritionEstimated: was.nutritionEstimated ?? false,
              }
            : words(was),
      });
    }
  }
  return plan;
}
