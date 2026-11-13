import type { MealSlot } from "@/generated/prisma/enums";

import { prisma } from "./db";
import type { RankableRecipe } from "./dinner-ranking";
import { defaultServingsFor } from "./household";
import { mealHistory } from "./meal-history";
import { DINNER_SLOTS, FIRST_DINNER } from "./meal-slots";
import { visibleRecipes } from "./recipe-visibility";
import { NO_REVIEWS, type ReviewSummary } from "./review-schema";
import { getReviewSummaries } from "./reviews";
import { clampServings } from "./scale";

/**
 * The planner's changes, as plain functions of a household.
 *
 * They used to live inside the planner's server actions, which read the
 * browser's session. Moved here so the actions and the MCP tools
 * (MCP-PLAN.md) share one implementation, with the same checks: a recipe
 * must be one this household can see, and servings are decided here rather
 * than taken from whoever is asking.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** `YYYY-MM-DD` as the UTC midnight the plan stores, or null if malformed. */
export function planDate(iso: string): Date | null {
  if (!ISO_DATE.test(iso)) return null;
  const date = new Date(`${iso}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso
    ? null
    : date;
}

export type PlanMealResult =
  | { ok: true; cleared: true }
  | {
      ok: true;
      cleared: false;
      recipe: { id: string; publicId: string; title: string };
      servings: number;
    }
  | { ok: false; error: string };

/**
 * Put a recipe in one slot of one day, or clear the slot (`recipeId` null).
 */
export async function planMeal(
  householdId: string,
  input: { date: string; slot: MealSlot; recipeId: string | null },
): Promise<PlanMealResult> {
  const date = planDate(input.date);
  if (!date) return { ok: false, error: "That isn't a date (YYYY-MM-DD)." };

  if (!input.recipeId) {
    // Clearing a slot: delete rather than storing an empty row.
    await prisma.plannedMeal.deleteMany({
      where: { householdId, date, slot: input.slot },
    });
    return { ok: true, cleared: true };
  }

  /*
   * Anything this household can see can be planned - its own, and whatever
   * other households have shared. Checked rather than trusted: the id comes
   * from a form post or an assistant, so without this a guessed id would put
   * another family's private dish on the week and its ingredients on the
   * shopping list, which is a way of reading a recipe without opening it.
   *
   * A reference, not a copy. The plan stores the id, so the owner's later
   * edits reach a meal somebody else has already planned - which is the
   * point of sharing rather than handing out duplicates.
   */
  const recipe = await prisma.recipe.findFirst({
    where: { AND: [{ id: input.recipeId }, visibleRecipes(householdId)] },
    select: { id: true, publicId: true, title: true, servings: true },
  });
  if (!recipe) return { ok: false, error: "No recipe with that id here." };

  /*
   * How many this evening is for.
   *
   * Decided here rather than sent by the caller. The household's own number
   * is the answer when it has one, and what the recipe makes when it does
   * not - and either way it is clamped against this recipe, so a dish that
   * serves twelve is not quietly planned for a household of four.
   *
   * It used to arrive in the action's input, which meant a form post could
   * say five thousand and get a shopping list for five thousand.
   */
  const household = await defaultServingsFor(householdId);
  const servings = clampServings(household ?? recipe.servings, recipe.servings);

  await prisma.plannedMeal.upsert({
    where: { householdId_date_slot: { householdId, date, slot: input.slot } },
    create: {
      householdId,
      date,
      slot: input.slot,
      recipeId: recipe.id,
      servings,
    },
    update: { recipeId: recipe.id, servings },
  });

  return {
    ok: true,
    cleared: false,
    recipe: { id: recipe.id, publicId: recipe.publicId, title: recipe.title },
    servings,
  };
}

/**
 * How many people one evening is cooking for.
 *
 * Set on the day rather than on each dish, because that is the question being
 * answered: six are coming on Saturday, not "the main is for six and the side
 * is for four". An evening whose side feeds four while its main feeds six
 * produces a shopping list that is right about neither.
 *
 * Each meal is clamped against its own recipe, so one big dish on the table
 * keeps its own count instead of being scaled down to meet the day's.
 */
export async function setDayServings(
  householdId: string,
  input: { date: string; servings: number },
): Promise<void> {
  const date = planDate(input.date);
  if (!date) return;

  const meals = await prisma.plannedMeal.findMany({
    where: { householdId, date },
    select: { id: true, recipe: { select: { servings: true } } },
  });

  /*
   * One transaction rather than a loop of updates: a day left half scaled is
   * the inconsistency this exists to prevent, and it would be silent - the
   * page would show six and the list would buy for both.
   *
   * A meal with no recipe is a typed-in title like "leftovers". It has no
   * ingredients, so its servings reach no shopping list, but it is kept in
   * step anyway so the evening reads as one number.
   */
  await prisma.$transaction(
    meals.map((meal) =>
      prisma.plannedMeal.update({
        where: { id: meal.id },
        data: {
          servings: clampServings(input.servings, meal.recipe?.servings ?? 1),
        },
      }),
    ),
  );
}

/**
 * Put suggested dinners on the week.
 *
 * Only ever into an empty evening. The suggestions were drawn from the week
 * as it was a moment ago, and somebody else in the household may have planned
 * Thursday since - so an evening that has any dinner by now is skipped, not
 * overwritten. A suggestion is never worth more than a choice somebody made.
 *
 * Each recipe is checked the same way a single pick is, and servings are
 * decided the same way too. Says how many it added, so a caller that lost a
 * race can say so.
 */
export async function addSuggestedDinners(
  householdId: string,
  picks: { date: string; recipeId: string }[],
): Promise<{ added: number }> {
  // One per evening, at most a week of them, and only well-formed dates.
  const byDate = new Map<string, string>();
  for (const pick of picks.slice(0, 7)) {
    if (planDate(pick.date) && !byDate.has(pick.date)) {
      byDate.set(pick.date, pick.recipeId);
    }
  }
  if (byDate.size === 0) return { added: 0 };

  const dates = [...byDate.keys()].map((d) => new Date(`${d}T00:00:00.000Z`));

  const [recipes, occupied, household] = await Promise.all([
    prisma.recipe.findMany({
      where: {
        AND: [
          { id: { in: [...byDate.values()] } },
          visibleRecipes(householdId),
        ],
      },
      select: { id: true, servings: true },
    }),
    prisma.plannedMeal.findMany({
      where: {
        householdId,
        date: { in: dates },
        slot: { in: [...DINNER_SLOTS] },
      },
      select: { date: true },
    }),
    defaultServingsFor(householdId),
  ]);

  const servingsOf = new Map(recipes.map((r) => [r.id, r.servings]));
  const taken = new Set(occupied.map((m) => m.date.toISOString().slice(0, 10)));

  const rows = [...byDate].flatMap(([date, recipeId]) => {
    const makes = servingsOf.get(recipeId);
    if (makes == null || taken.has(date)) return [];
    return [
      {
        householdId,
        date: new Date(`${date}T00:00:00.000Z`),
        slot: FIRST_DINNER,
        recipeId,
        servings: clampServings(household ?? makes, makes),
      },
    ];
  });

  // skipDuplicates as well as the check above: if the first dinner was
  // filled between the two, the unique key keeps it rather than this.
  const { count } = await prisma.plannedMeal.createMany({
    data: rows,
    skipDuplicates: true,
  });
  return { added: count };
}

export type PlannerRecipe = RankableRecipe & {
  publicId: string;
  servings: number;
  imageUrl: string | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  reviews: ReviewSummary;
};

/**
 * Everything this household can plan, with what the dinner ranking needs to
 * know about each (`dinner-ranking.ts`): its course and time, how often and
 * how lately it has been had, whether anybody here rated it low.
 *
 * The planner's picker and suggestion sheet, and the MCP `suggest_dinners`
 * tool, all rank from this, so they agree.
 */
export async function plannerLibrary(
  householdId: string,
  weekStart: Date,
): Promise<PlannerRecipe[]> {
  const [recipes, history, vetoes] = await Promise.all([
    // This household's recipes and whatever others have shared - the same
    // library the recipes page shows, so a dish cannot be planned from a
    // list it is not in.
    prisma.recipe.findMany({
      where: visibleRecipes(householdId),
      select: {
        id: true,
        // The planner links to a recipe, so it needs what an address is made
        // of - see `recipe-url.ts`.
        publicId: true,
        title: true,
        servings: true,
        imageUrl: true,
        prepMinutes: true,
        cookMinutes: true,
        // What the picker ranks on. Course so only dinners are offered, rest
        // so a dish that needs an hour's rest is not mistaken for a quick
        // one, tags for the variety nudge.
        restMinutes: true,
        course: true,
        tags: { select: { tag: { select: { slug: true } } } },
      },
      orderBy: { title: "asc" },
    }),
    // What this household has had, and when: dinners planned before this
    // week, and anything cooked through in cook mode up to today.
    mealHistory(householdId, { plannedBefore: weekStart }),
    // One or two stars from anybody in this household sends a dish to the
    // bottom. This household's own ratings, not the shared average, which for
    // a shared recipe includes other families.
    prisma.recipeReview.findMany({
      where: { stars: { lte: 2 }, user: { householdId } },
      select: { recipeId: true },
    }),
  ]);

  const vetoed = new Set(vetoes.map((v) => v.recipeId));
  const summaries = await getReviewSummaries(
    recipes.map((r) => r.id),
    householdId,
  );

  return recipes.map(({ tags, restMinutes, ...recipe }) => {
    const past = history.get(recipe.id);
    const minutes =
      (recipe.prepMinutes ?? 0) +
      (recipe.cookMinutes ?? 0) +
      (restMinutes ?? 0);
    return {
      ...recipe,
      reviews: summaries.get(recipe.id) ?? NO_REVIEWS,
      // Null rather than 0 when no time is recorded at all, so the ranking
      // reads it as unknown rather than as instant.
      totalMinutes:
        recipe.prepMinutes == null &&
        recipe.cookMinutes == null &&
        restMinutes == null
          ? null
          : minutes,
      restMinutes,
      timesPlanned: past?.count ?? 0,
      lastPlannedIso: past?.lastIso ?? null,
      vetoed: vetoed.has(recipe.id),
      averageStars: summaries.get(recipe.id)?.average ?? null,
      tagSlugs: tags.map(({ tag }) => tag.slug),
    };
  });
}
