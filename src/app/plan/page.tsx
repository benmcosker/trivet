import Typography from "@mui/material/Typography";

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
import { visibleRecipes } from "@/lib/recipe-visibility";
import { buildShoppingList } from "@/lib/week-list";
import { NO_REVIEWS } from "@/lib/review-schema";
import { getReviewSummaries } from "@/lib/reviews";
import { listUsableProviders } from "@/lib/shopping";
import { requireHousehold } from "@/lib/session";
import { smsAvailable } from "@/lib/sms";
import { shoppingListAudience } from "@/lib/sms/shopping-list";

export default async function PlanPage({ searchParams }: PageProps<"/plan">) {
  const { householdId } = await requireHousehold();

  const params = await searchParams;
  const weekParam = typeof params.week === "string" ? params.week : null;
  const weekStart = weekStartOf(
    weekParam ? new Date(`${weekParam}T00:00:00.000Z`) : new Date(),
  );

  const [meals, recipes, skips, pantry, extras] = await Promise.all([
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
        title: true,
        servings: true,
        imageUrl: true,
        prepMinutes: true,
        cookMinutes: true,
      },
      orderBy: { title: "asc" },
    }),
    getWeeklySkips(weekStart, householdId),
    listPantryItems(householdId),
    listExtraItems(weekStart, householdId),
  ]);

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
      <Typography variant="h1" sx={{ mb: 3 }}>
        This week
      </Typography>
      <WeekPlanner
        weekStartIso={weekStart.toISOString().slice(0, 10)}
        prevWeekIso={addDays(weekStart, -7).toISOString().slice(0, 10)}
        nextWeekIso={addDays(weekStart, 7).toISOString().slice(0, 10)}
        // Today by the same UTC clock the week itself was chosen with, so the
        // marked cell and the seven days on screen cannot disagree - and so
        // that the server and the browser render the same thing.
        todayIso={new Date().toISOString().slice(0, 10)}
        recipes={recipes.map((recipe) => ({
          ...recipe,
          reviews: summaries.get(recipe.id) ?? NO_REVIEWS,
        }))}
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
