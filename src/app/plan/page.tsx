import { redirect } from "next/navigation";

import { AppShell } from "@/components/AppShell";
import { WeekPlanner } from "@/components/WeekPlanner";
import { prisma } from "@/lib/db";
import { listExtraItems } from "@/lib/extras";
import {
  addDays,
  getWeekPlan,
  getWeeklySkips,
  weekStartOf,
} from "@/lib/grocery";
import { listPantryItems } from "@/lib/pantry";
import { mealHistory } from "@/lib/meal-history";
import { visibleRecipes } from "@/lib/recipe-visibility";
import { buildShoppingList } from "@/lib/week-list";
import { NO_REVIEWS } from "@/lib/review-schema";
import { getReviewSummaries } from "@/lib/reviews";
import { listUsableProviders } from "@/lib/shopping";
import { requireHousehold } from "@/lib/session";
import { smsAvailable } from "@/lib/sms";
import { shoppingListAudience } from "@/lib/sms/shopping-list";

export default async function PlanPage({ searchParams }: PageProps<"/plan">) {
  const { householdId, householdName } = await requireHousehold();

  /*
   * This week or next, and nothing else. Those are the only two the page
   * links to and the only two anybody plans, so any other `?week=` - an old
   * bookmark, a typo - comes back to this week rather than opening a week
   * with no name and no way out.
   */
  const params = await searchParams;
  const thisWeek = weekStartOf(new Date());
  const nextWeek = addDays(thisWeek, 7);
  if (params.week !== undefined) {
    const asked =
      typeof params.week === "string"
        ? weekStartOf(new Date(`${params.week}T00:00:00.000Z`))
        : null;
    if (asked?.getTime() !== nextWeek.getTime()) redirect("/plan");
  }
  const weekStart = params.week === undefined ? thisWeek : nextWeek;

  const [meals, recipes, skips, pantry, extras, history, vetoes, unsorted] =
    await Promise.all([
      getWeekPlan(weekStart, householdId),
      // The picker offers this household's recipes and whatever others have
      // shared - the same library the recipes page shows, so a dish cannot be
      // planned from a list it is not in.
      prisma.recipe.findMany({
        where: visibleRecipes(householdId),
        // The times are here for the planner's meta line, "Serves 4 / 1 hr 30";
        // the picker tiles ignore them.
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
          // What the picker ranks on - see `dinner-ranking.ts`. Course so only
          // dinners are offered, rest so a dish that needs an hour's rest is
          // not mistaken for a quick one, tags for the variety nudge.
          restMinutes: true,
          course: true,
          tags: { select: { tag: { select: { slug: true } } } },
        },
        orderBy: { title: "asc" },
      }),
      getWeeklySkips(weekStart, householdId),
      listPantryItems(householdId),
      listExtraItems(weekStart, householdId),
      // What this household has had, and when: dinners planned before the
      // week on screen, and anything cooked through in cook mode up to
      // today. Nothing prunes either, so this is the whole history.
      mealHistory(householdId, { plannedBefore: weekStart }),
      // One or two stars from anybody in this household sends a dish to the
      // bottom of the picker. This household's own ratings, not the shared
      // average, which for a shared recipe includes other families.
      prisma.recipeReview.findMany({
        where: { stars: { lte: 2 }, user: { householdId } },
        select: { recipeId: true },
      }),
      // This household's own recipes nobody has sorted yet, which the
      // suggestion sheet cannot pick from and says so. Only its own: another
      // household's shared recipe is theirs to sort.
      prisma.recipe.count({ where: { householdId, course: null } }),
    ]);

  const historyById = history;
  const vetoed = new Set(vetoes.map((v) => v.recipeId));

  // Who a text would actually reach. Fetched even when texting is switched off
  // so the shape of the page does not depend on a code path, but only used
  // when it is.
  const audience = await shoppingListAudience(householdId);

  // Review scores on the picker tiles: choosing dinner is exactly when it helps
  // to see which of these the household actually liked.
  const summaries = await getReviewSummaries(recipes.map((r) => r.id));

  const groceries = buildShoppingList({ meals, pantry, skips, extras });

  return (
    <AppShell>
      {/*
       * No h1 here: the title is the second line of a block that opens with
       * the household and the date range, so the planner owns both.
       */}
      <WeekPlanner
        weekStartIso={weekStart.toISOString().slice(0, 10)}
        // Today by the same UTC clock the week itself was chosen with, so the
        // marked cell and the seven days on screen cannot disagree - and so
        // that the server and the browser render the same thing.
        todayIso={new Date().toISOString().slice(0, 10)}
        // Which Monday counts as "this week", so the nav can mark itself.
        // Read here rather than in the browser for the same reason todayIso is.
        thisWeekIso={thisWeek.toISOString().slice(0, 10)}
        householdName={householdName}
        unsortedCount={unsorted}
        recipes={recipes.map(({ tags, restMinutes, ...recipe }) => {
          const past = historyById.get(recipe.id);
          const minutes =
            (recipe.prepMinutes ?? 0) +
            (recipe.cookMinutes ?? 0) +
            (restMinutes ?? 0);
          return {
            ...recipe,
            reviews: summaries.get(recipe.id) ?? NO_REVIEWS,
            // Null rather than 0 when no time is recorded at all, so the
            // ranking reads it as unknown rather than as instant.
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
        })}
        meals={meals.map((meal) => ({
          date: meal.date.toISOString().slice(0, 10),
          slot: meal.slot,
          recipeId: meal.recipeId,
          servings: meal.servings,
          title: meal.recipe?.title ?? meal.customTitle ?? null,
        }))}
        groceries={groceries}
        skips={skips}
        pantry={pantry}
        providers={listUsableProviders()}
        smsAudience={
          smsAvailable()
            ? {
                names: audience.recipients.map((r) => r.name),
                withoutNumbers: audience.withoutNumber,
                withoutConsent: audience.withoutConsent,
              }
            : null
        }
      />
    </AppShell>
  );
}
