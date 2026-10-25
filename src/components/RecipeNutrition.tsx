import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import {
  MACRO_KEYS,
  type MacroKey,
  type NutritionBasis,
} from "@/lib/recipe-schema";

export type RecipeNutritionSource = {
  caloriesKcal?: number | null;
  proteinG?: number | null;
  carbsG?: number | null;
  fatG?: number | null;
  nutritionBasis?: NutritionBasis | null;
};

const UNIT: Record<MacroKey, string> = {
  caloriesKcal: "kcal",
  proteinG: "g protein",
  carbsG: "g carbs",
  fatG: "g fat",
};

/**
 * Macros for one serving, and - inseparably - where they came from.
 *
 * The two bases are not a detail of the same thing. A printed figure is the
 * card's claim, which somebody can check against the card. An estimated one
 * is arithmetic Claude did over the ingredient list, and nothing in the
 * library can verify it. They are stored in the same four columns and they
 * would render identically if this component let them, which is why it does
 * not:
 *
 * - every estimated number wears a `~`, so the hedge is on the figure rather
 *   than in a line underneath it that a reader skips;
 * - the heading says `estimated`, so a glance at the section is enough;
 * - the sentence below names Claude, because "estimated" alone reads like the
 *   publisher estimated it.
 *
 * Three marks for one fact is not redundancy here. Somebody counting carbs is
 * reading the number and nothing else, and a caption is the part of a page
 * that gets skipped.
 */
export function RecipeNutrition({ recipe }: { recipe: RecipeNutritionSource }) {
  const basis = recipe.nutritionBasis;
  if (!basis) return null;

  const estimated = basis === "ESTIMATED";
  const parts = MACRO_KEYS.filter((key) => recipe[key] != null).map(
    (key) => `${estimated ? "~" : ""}${recipe[key]} ${UNIT[key]}`,
  );

  // The CHECK constraint makes this unreachable from the database, but this
  // component also renders unsaved extractions on the review screen.
  if (parts.length === 0) return null;

  return (
    <Box sx={{ mt: 2.5 }}>
      <Typography variant="overline" component="p" color="text.secondary">
        Per serving{estimated ? ", estimated" : ""}
      </Typography>

      <Typography variant="body2" sx={{ mt: 0.5 }}>
        {parts.join(" · ")}
      </Typography>

      <Typography
        variant="caption"
        component="p"
        color="text.secondary"
        sx={{ mt: 0.5 }}
      >
        {estimated
          ? "Worked out by Claude from the ingredients. The recipe does not say, so treat these as a rough guide rather than a measurement."
          : "As stated by the recipe."}
      </Typography>
    </Box>
  );
}
