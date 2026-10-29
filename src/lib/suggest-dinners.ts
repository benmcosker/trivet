/**
 * A dinner for each open evening, proposed rather than planned.
 *
 * Built on `dinner-ranking.ts`: each evening takes one of its best few, in
 * date order, with every earlier pick counted as already on the week. That is
 * what keeps Tuesday from repeating Monday and the pasta from landing two
 * nights running - the ranking already knows how to avoid both, it only
 * needs to be told what the sheet has chosen so far.
 *
 * Only dishes the picker would put in its first tier are ever proposed:
 * sorted as a dinner, not rated low at home, not already on the week. The
 * picker shows the rest with a reason, because there a person is choosing;
 * here nobody is, so they simply are not candidates.
 *
 * A little chance, among the top three. Pressing the button twice should not
 * give the same week, or the sheet would teach the household six dishes and
 * stop. Weighted towards the first, so the ranking still mostly decides.
 *
 * Import-free apart from the ranking, so it runs in the browser and tests
 * without a database.
 */

import {
  rankForEvening,
  type EveningContext,
  type RankableRecipe,
  type Ranked,
} from "./dinner-ranking";

/** The slot a suggestion fills. Only an evening with no dinner is offered. */
export const SUGGESTED_SLOT = "DINNER";

type Planned = EveningContext["plannedThisWeek"][number];

export type SuggestionRow<T> = {
  dateIso: string;
  /** Null when there is nothing left this evening could take. */
  pick: Ranked<T> | null;
  /** Ids this row has already shown, so Another does not go back to one. */
  seen: string[];
};

/** How strongly each of the top three is favoured: mostly the first. */
const CHANCE = [3, 2, 1];

/**
 * The dishes this evening could be given, best first, with why.
 *
 * The ranking's first tier, recomputed here rather than read from it: a dish
 * is out if it is rated low or appears anywhere in `planned`, which for the
 * sheet includes what it has picked for the other evenings.
 */
export function candidatesFor<T extends RankableRecipe>(
  recipes: T[],
  dateIso: string,
  planned: Planned[],
): Ranked<T>[] {
  const taken = new Set(planned.map((p) => p.recipeId));
  return rankForEvening(recipes, {
    dateIso,
    slot: SUGGESTED_SLOT,
    plannedThisWeek: planned,
  }).filter((r) => !r.recipe.vetoed && !taken.has(r.recipe.id));
}

function choose<T>(options: T[], random: () => number): T | undefined {
  const top = options.slice(0, CHANCE.length);
  const weights = CHANCE.slice(0, top.length);
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = random() * total;
  for (let i = 0; i < top.length; i++) {
    roll -= weights[i];
    if (roll < 0) return top[i];
  }
  return top[top.length - 1];
}

function asPlanned<T extends RankableRecipe>(
  rows: SuggestionRow<T>[],
): Planned[] {
  return rows.flatMap((row) =>
    row.pick
      ? [
          {
            dateIso: row.dateIso,
            slot: SUGGESTED_SLOT,
            recipeId: row.pick.recipe.id,
          },
        ]
      : [],
  );
}

/**
 * One suggestion per evening, in the order given (which should be date
 * order: each evening is chosen knowing the ones before it).
 */
export function suggestDinners<T extends RankableRecipe>(
  recipes: T[],
  {
    evenings,
    plannedThisWeek,
    random = Math.random,
  }: {
    /** Open evenings, `YYYY-MM-DD`, in date order. */
    evenings: string[];
    /** Dinners already on the week. Never moved, only avoided. */
    plannedThisWeek: Planned[];
    random?: () => number;
  },
): SuggestionRow<T>[] {
  const rows: SuggestionRow<T>[] = [];
  for (const dateIso of evenings) {
    const options = candidatesFor(recipes, dateIso, [
      ...plannedThisWeek,
      ...asPlanned(rows),
    ]);
    const pick = choose(options, random) ?? null;
    rows.push({ dateIso, pick, seen: pick ? [pick.recipe.id] : [] });
  }
  return rows;
}

/**
 * What the evening's other dishes could be, with every other row's pick
 * counted as taken. Empty when Another has nothing to offer.
 */
export function alternativesFor<T extends RankableRecipe>(
  recipes: T[],
  rows: SuggestionRow<T>[],
  index: number,
  plannedThisWeek: Planned[],
): Ranked<T>[] {
  const row = rows[index];
  const others = rows.filter((_, i) => i !== index);
  return candidatesFor(recipes, row.dateIso, [
    ...plannedThisWeek,
    ...asPlanned(others),
  ]).filter((r) => r.recipe.id !== row.pick?.recipe.id);
}

/**
 * The next dish down for one evening.
 *
 * Steps through the ranking in order rather than rolling again, so pressing
 * it repeatedly walks the list instead of bouncing between two favourites.
 * Once everything has been shown it starts again from the top.
 */
export function another<T extends RankableRecipe>(
  recipes: T[],
  rows: SuggestionRow<T>[],
  index: number,
  plannedThisWeek: Planned[],
): SuggestionRow<T>[] {
  const row = rows[index];
  const options = alternativesFor(recipes, rows, index, plannedThisWeek);
  if (options.length === 0) return rows;

  const unseen = options.find((r) => !row.seen.includes(r.recipe.id));
  const pick = unseen ?? options[0];
  const seen = unseen
    ? [...row.seen, pick.recipe.id]
    : [row.pick?.recipe.id, pick.recipe.id].filter((id): id is string =>
        Boolean(id),
      );

  return rows.map((r, i) => (i === index ? { ...r, pick, seen } : r));
}
