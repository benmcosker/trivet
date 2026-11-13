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
import { plannerLibrary } from "@/lib/plan-mutations";
import { buildShoppingList } from "@/lib/week-list";
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

  const [meals, recipes, skips, pantry, extras, unsorted] = await Promise.all([
    getWeekPlan(weekStart, householdId),
    // What the picker offers and ranks, with each dish's history and this
    // household's low ratings - see `plannerLibrary`.
    plannerLibrary(householdId, weekStart),
    getWeeklySkips(weekStart, householdId),
    listPantryItems(householdId),
    listExtraItems(weekStart, householdId),
    // This household's own recipes nobody has sorted yet, which the
    // suggestion sheet cannot pick from and says so. Only its own: another
    // household's shared recipe is theirs to sort.
    prisma.recipe.count({ where: { householdId, course: null } }),
  ]);

  // Who a text would actually reach. Fetched even when texting is switched off
  // so the shape of the page does not depend on a code path, but only used
  // when it is.
  const audience = await shoppingListAudience(householdId);

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
        recipes={recipes}
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
