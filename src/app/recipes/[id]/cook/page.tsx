import Typography from "@mui/material/Typography";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/AppShell";
import { CookingView } from "@/components/CookingView";
import { LinkButton } from "@/components/LinkButton";
import { formatAmount } from "@/lib/quantity";
import { getRecipe } from "@/lib/recipes";
import { requireHousehold } from "@/lib/session";
import { formatOvenTemp } from "@/lib/temperature";

/**
 * The cooking view: a recipe as something you are in the middle of.
 *
 * A route of its own rather than a mode on the recipe page, so that it has a
 * URL you can leave open on a propped-up phone, and so the page you were
 * reading is still there when you come back out of it.
 *
 * Everything the view needs is formatted here, on the server, and handed over
 * as strings. That is not tidiness: MUI's components are client code, and a
 * function crossing that boundary typechecks, builds, serves 200 and dies when
 * React hydrates. Strings and numbers cross it safely; formatters do not.
 */
export default async function CookRecipePage({
  params,
}: PageProps<"/recipes/[id]/cook">) {
  const user = await requireHousehold();

  const { id } = await params;
  const recipe = await getRecipe(id, user.householdId);
  // Same 404 as the recipe page, for the same reason: "no such recipe" and
  // "not shared with you" must not be told apart by a guessed id.
  if (!recipe) notFound();

  return (
    <AppShell>
      <LinkButton
        href={`/recipes/${recipe.id}`}
        size="small"
        sx={{ ml: -1, mb: 0.5 }}
      >
        ← Back to the recipe
      </LinkButton>

      {/*
       * Still the page's h1, but set at the h2 size. The full scale is 3rem on
       * a phone, and a two-line title pushed the first instruction most of the
       * way down an 852px screen - which is backwards here, where the step is
       * the thing being read and the title is only there to confirm you opened
       * the right dish.
       */}
      <Typography
        variant="h2"
        component="h1"
        sx={{ mb: 2, overflowWrap: "break-word" }}
      >
        {recipe.title}
      </Typography>

      <CookingView
        recipeId={recipe.id}
        steps={recipe.instructions}
        ingredients={recipe.ingredients.map((ingredient) => ({
          id: ingredient.id,
          amount: formatAmount(ingredient.quantity, ingredient.unit),
          name: ingredient.name,
          note: ingredient.note,
        }))}
        ovenTemp={formatOvenTemp(recipe.ovenTemp, recipe.ovenTempUnit)}
      />
    </AppShell>
  );
}
