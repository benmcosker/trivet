import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import { MACRO_KEYS, type MacroKey } from "@/lib/recipe-schema";

export type RecipeNutritionSource = {
  caloriesKcal?: number | null;
  proteinG?: number | null;
  carbsG?: number | null;
  fatG?: number | null;
};

const UNIT: Record<MacroKey, string> = {
  caloriesKcal: "kcal",
  proteinG: "g protein",
  carbsG: "g carbs",
  fatG: "g fat",
};

/**
 * Macros for one serving, as the source stated them.
 *
 * No caption saying so. Every other field on this page is what the recipe
 * said and none of them announces it, so a line here would imply the oven
 * temperature is the less certain of the two - and it would be a caption,
 * which is the part of a page a reader skips, so it would buy nothing where
 * it mattered.
 *
 * The heading stays. This page carries a servings scaler, and these figures
 * deliberately do not move when it is used: per serving is per serving. A
 * per-recipe total read as a per-serving figure is the error that makes two
 * dishes uncomparable while neither looks wrong alone, and two words at the
 * top are what rule it out.
 *
 * Absent rather than empty when there is nothing to show. A heading that
 * failed to fill is what would read as a gap, and most of the library is
 * photographed cards, which rarely print any of this.
 */
export function RecipeNutrition({ recipe }: { recipe: RecipeNutritionSource }) {
  const parts = MACRO_KEYS.filter((key) => recipe[key] != null).map(
    (key) => `${recipe[key]} ${UNIT[key]}`,
  );

  if (parts.length === 0) return null;

  return (
    /*
     * 32px, not the 20 the blocks above use. This sits under the ingredient
     * amounts and, on a scaled recipe, under the note explaining what
     * scaling did not touch - at 20px it reads as a rider on that sentence,
     * or unscaled, as a fourth ingredient row. The wider gap ends the
     * ingredients before these begin. A rule would do the same job and
     * weighs the same as the ingredient dividers; the air is enough.
     */
    <Box sx={{ mt: 4 }}>
      <Typography variant="overline" component="p" color="text.secondary">
        Per serving
      </Typography>

      <Typography variant="body2" sx={{ mt: 0.5 }}>
        {parts.join(" · ")}
      </Typography>
    </Box>
  );
}
