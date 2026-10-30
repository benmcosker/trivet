import { prisma } from "@/lib/db";

import { inWords } from "./dinner-ranking";

/**
 * How often a household has had each dish, and when last.
 *
 * Two sources, because there are two ways a dish gets made: planned on the
 * week, or cooked straight from the recipe with the planner never involved.
 * The second is recorded when Done is pressed at the end of cook mode (see
 * `CookedMeal`). A dish planned for a day and then cooked from the planner
 * that day appears in both, and counts once.
 */

export type HistoryEntry = { count: number; lastIso: string };

type Dated = { recipeId: string | null; date: Date };

/** Both sources as one count per dish, a day at most once. Pure, for tests. */
export function combineHistory(
  planned: Dated[],
  cooked: Dated[],
): Map<string, HistoryEntry> {
  const days = new Map<string, Set<string>>();
  for (const { recipeId, date } of [...planned, ...cooked]) {
    if (!recipeId) continue;
    const iso = date.toISOString().slice(0, 10);
    const seen = days.get(recipeId) ?? new Set<string>();
    seen.add(iso);
    days.set(recipeId, seen);
  }

  const history = new Map<string, HistoryEntry>();
  for (const [recipeId, seen] of days) {
    const sorted = [...seen].sort();
    history.set(recipeId, {
      count: sorted.length,
      lastIso: sorted[sorted.length - 1],
    });
  }
  return history;
}

/**
 * The household's history, read from both sources.
 *
 * Planned meals before `plannedBefore`: the planner passes the week on
 * screen, whose own dinners it already knows about; the recipe page passes
 * tomorrow, so next week's plan is not counted as already eaten. Cooked
 * meals need no cut-off - one is only ever recorded for the day it was
 * cooked, so every one of them is already history.
 *
 * Every slot counts, sides included: a side planned is a side made.
 */
export async function mealHistory(
  householdId: string,
  { plannedBefore, recipeId }: { plannedBefore: Date; recipeId?: string },
): Promise<Map<string, HistoryEntry>> {
  const [planned, cooked] = await Promise.all([
    prisma.plannedMeal.findMany({
      where: {
        householdId,
        date: { lt: plannedBefore },
        recipeId: recipeId ?? { not: null },
      },
      select: { recipeId: true, date: true },
    }),
    prisma.cookedMeal.findMany({
      where: { householdId, ...(recipeId ? { recipeId } : {}) },
      select: { recipeId: true, date: true },
    }),
  ]);
  return combineHistory(planned, cooked);
}

/**
 * The recipe page's line about a dish's history: "Made nine times, last on
 * 12 August." Null when it has never been had, because a line saying so
 * would sit on most of a new library saying nothing.
 *
 * The year only when it is not this one. Rendered on the server alone, so the
 * date can come from `Intl` without the two-pass mismatch the planner avoids.
 */
export function historyLine(
  entry: HistoryEntry | undefined,
  todayIso: string,
): string | null {
  if (!entry) return null;
  const when = new Date(`${entry.lastIso}T00:00:00.000Z`).toLocaleString(
    "en-GB",
    {
      day: "numeric",
      month: "long",
      ...(entry.lastIso.slice(0, 4) !== todayIso.slice(0, 4)
        ? { year: "numeric" }
        : {}),
      timeZone: "UTC",
    },
  );
  if (entry.count === 1) return `Made once, on ${when}.`;
  const times = entry.count === 2 ? "twice" : `${inWords(entry.count)} times`;
  return `Made ${times}, last on ${when}.`;
}
