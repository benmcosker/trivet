import Typography from "@mui/material/Typography";
import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/AppShell";
import { EditRecipeForm } from "@/components/EditRecipeForm";
import { getRecipe } from "@/lib/recipes";
import { recipePath } from "@/lib/recipe-url";
import { requireHousehold } from "@/lib/session";

export default async function EditRecipePage({
  params,
}: PageProps<"/recipes/[id]/edit">) {
  const { householdId } = await requireHousehold();

  const { id } = await params;
  const recipe = await getRecipe(id, householdId);
  // Reachable by typing the URL even though the button is hidden. Saving would
  // be refused anyway; this is so nobody fills in a form that cannot be saved.
  if (!recipe || recipe.householdId !== householdId) notFound();

  // Corrected like the other two, so the address in the bar matches the dish
  // being edited - including straight after a rename.
  const canonical = `${recipePath(recipe)}/edit`;
  if (`/recipes/${id}/edit` !== canonical) redirect(canonical);

  return (
    <AppShell>
      <Typography variant="h1" sx={{ mb: 3 }}>
        Edit recipe
      </Typography>
      <EditRecipeForm
        id={recipe.id}
        initial={{
          title: recipe.title,
          description: recipe.description,
          servings: recipe.servings,
          prepMinutes: recipe.prepMinutes,
          cookMinutes: recipe.cookMinutes,
          restMinutes: recipe.restMinutes,
          ovenTemp: recipe.ovenTemp,
          ovenTempUnit: recipe.ovenTempUnit,
          yieldNote: recipe.yieldNote,
          equipment: recipe.equipment,
          sourceUrl: recipe.sourceUrl,
          sourceName: recipe.sourceName,
          notes: recipe.notes,
          instructions: recipe.instructions,
          ingredients: recipe.ingredients.map((i) => ({
            name: i.name,
            quantity: i.quantity,
            unit: i.unit,
            note: i.note,
          })),
          tags: recipe.tags.map(({ tag }) => tag.name),
        }}
      />
    </AppShell>
  );
}
