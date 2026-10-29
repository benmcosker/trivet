import Typography from "@mui/material/Typography";

import { AppShell } from "@/components/AppShell";
import { CourseSorter } from "@/components/CourseSorter";
import { prisma } from "@/lib/db";
import { requireHousehold } from "@/lib/session";

/**
 * Sort a household's recipes by what they are, in one pass.
 *
 * A one-off tool more than a page: it exists so the existing library can be
 * classified without opening the edit form a hundred times, and so the
 * planner's suggestions have something to stand on. New recipes arrive
 * sorted by the importer; this is for the ones that came before it.
 *
 * Only this household's own recipes - a shared one is sorted by whoever
 * added it. Unsorted first, so the work is at the top, and the order is fixed
 * on load rather than re-sorted on every tap: a row that jumped away the
 * moment it was tapped could not have its mis-tap fixed.
 */
export default async function SortRecipesPage() {
  const user = await requireHousehold();

  const recipes = await prisma.recipe.findMany({
    where: { householdId: user.householdId },
    select: { id: true, title: true, course: true },
    orderBy: { title: "asc" },
  });
  const ordered = [
    ...recipes.filter((r) => r.course === null),
    ...recipes.filter((r) => r.course !== null),
  ];
  const unsorted = recipes.filter((r) => r.course === null).length;

  return (
    <AppShell>
      <Typography variant="h1" sx={{ mb: 1 }}>
        Sort your recipes
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {unsorted === 0
          ? "Everything is sorted."
          : `${unsorted} not sorted yet. Tap what each one is - the planner only ever suggests dinners.`}
      </Typography>
      <CourseSorter recipes={ordered} />
    </AppShell>
  );
}
