import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";

import type { ReviewSummary } from "@/lib/review-schema";
import { servingChoices } from "@/lib/scale";
import type { TemperatureUnit } from "@/lib/recipe-schema";
import { formatMinutes, formatOvenTemp } from "@/lib/temperature";
import { fonts } from "@/theme/theme";

import { IconChip } from "./IconChip";
import { ReviewStars } from "./ReviewStars";
import { ServingScaler } from "./ServingScaler";

/**
 * What a recipe page says between its title and its photo: the description,
 * the reviews, the serving control, the chips and how often it has been made.
 *
 * One component for the recipe page and for its outline (`RecipeOutline`), so
 * the outline puts the photo exactly where the page will: these rows are most
 * of the height above it, and an outline that guessed at them would move the
 * photo a second time when the page arrived. Everything here is something the
 * library card already has, which is what lets the outline draw it for real.
 *
 * No directive of its own, so it renders on the server inside the recipe page
 * and gets bundled with the client where the outline uses it.
 */

export type RecipeFactsData = {
  /** The recipe's address, which the serving links are built on. */
  path: string;
  description: string | null;
  reviews: ReviewSummary;
  servings: number;
  yieldNote: string | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  restMinutes: number | null;
  ovenTemp: number | null;
  ovenTempUnit: TemperatureUnit | null;
  tags: { id: string; name: string }[];
};

/** Just the facts, small enough to hand from a card to the outline. */
export function recipeFacts(
  recipe: Omit<RecipeFactsData, "path" | "tags"> & {
    tags: { tag: { id: string; name: string } }[];
  },
  path: string,
): RecipeFactsData {
  return {
    path,
    description: recipe.description,
    reviews: recipe.reviews,
    servings: recipe.servings,
    yieldNote: recipe.yieldNote,
    prepMinutes: recipe.prepMinutes,
    cookMinutes: recipe.cookMinutes,
    restMinutes: recipe.restMinutes,
    ovenTemp: recipe.ovenTemp,
    ovenTempUnit: recipe.ovenTempUnit,
    tags: recipe.tags.map(({ tag }) => ({ id: tag.id, name: tag.name })),
  };
}

export function RecipeFacts({
  recipe,
  servings,
  madeLine = null,
  extraChip,
}: {
  recipe: RecipeFactsData;
  /** How many the page is being read for. */
  servings: number;
  /** How often this household has made it, from `historyLine`. */
  madeLine?: string | null;
  /** The original card, for the household that uploaded it. */
  extraChip?: ReactNode;
}) {
  const choices = servingChoices(recipe.servings);
  const totalMinutes = (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0);
  const ovenTemp = formatOvenTemp(recipe.ovenTemp, recipe.ovenTempUnit);
  const restTime = formatMinutes(recipe.restMinutes);

  return (
    <>
      {recipe.description ? (
        /*
         * Held to about seventy characters a line.
         *
         * Uncapped this ran the full width of the page: 182 characters a line
         * at 1440px, measured, which is somewhere past twice what anybody
         * reads comfortably. Long measure is tiring in a specific way - the
         * eye loses the start of the next line on the way back from the end
         * of this one, and you reread the line you have just read.
         *
         * The number is 55 and not 65 because `ch` is not a character. It is
         * the width of the "0" glyph, and in Newsreader at this size that is
         * 9.8px against an average of 7.2px for the characters in an actual
         * sentence - so a `ch` buys about 1.36 characters of room. Measured
         * on the rendered line boxes: 65ch gives 83 to 86 characters a line,
         * past the 80 that WCAG 1.4.8 asks for. 55ch gives 69 to 73, which
         * is the top of the range typography has settled on (45-75, with 66
         * the usual ideal) and inside the accessibility limit.
         *
         * `ch` rather than pixels even so, because the limit is about
         * characters and the unit follows the font: a pixel width tuned for
         * this face would be the wrong measure the day the type changes. It
         * is the same rule `RecipeHero` has held its description to since it
         * was drawn, recalibrated for body size.
         */
        <Typography
          color="text.secondary"
          sx={{ mb: 2, maxWidth: "55ch", textWrap: "pretty" }}
        >
          {recipe.description}
        </Typography>
      ) : null}

      <Box sx={{ mb: 2 }} data-print="hide">
        <ReviewStars summary={recipe.reviews} />
      </Box>

      {/*
       * Above the chips rather than among them: the chips state facts about
       * the dish and this asks a question of the reader, and a row that mixes
       * the two reads as though the servings were another fact you could not
       * change.
       */}
      {choices.length > 1 ? (
        <>
          <Box sx={{ mb: 2 }} data-print="hide">
            <ServingScaler
              path={recipe.path}
              choices={choices}
              current={servings}
              recipeServings={recipe.servings}
            />
          </Box>
          {/*
           * On paper the control is just its answer: the count it is set to,
           * which is what the printed quantities are for.
           */}
          <Typography data-print="only" sx={{ mb: 1 }}>
            Serves {servings}
          </Typography>
        </>
      ) : null}

      <Stack
        direction="row"
        sx={{ flexWrap: "wrap", gap: 1, mb: madeLine ? 1.5 : 3 }}
      >
        {/*
         * The count moves into the control when there is one, so it is not
         * printed twice. A yield note is not a count - "Makes 12 muffins" is
         * a sentence about the recipe as written - so it stays either way,
         * and the line under the ingredients says what scaling did to it.
         */}
        {choices.length > 1 ? (
          recipe.yieldNote ? (
            <Chip label={recipe.yieldNote} size="small" />
          ) : null
        ) : (
          <Chip
            label={recipe.yieldNote ?? `Serves ${recipe.servings}`}
            size="small"
          />
        )}
        {totalMinutes > 0 ? (
          <Chip label={`${formatMinutes(totalMinutes)} total`} size="small" />
        ) : null}
        {restTime ? <Chip label={`${restTime} resting`} size="small" /> : null}
        {/*
         * Coloured, unlike the rest: the oven has to be on before anything
         * else happens, so it is the one number worth finding without reading.
         */}
        {ovenTemp ? (
          <IconChip icon="oven" label={ovenTemp} size="small" color="warning" />
        ) : null}
        {recipe.tags.map((tag) => (
          <Chip key={tag.id} label={tag.name} size="small" variant="outlined" />
        ))}
        {extraChip}
      </Stack>

      {/*
       * A line, not a chip: how often this household has made it is not a
       * property of the recipe. Planned days and dishes cooked through in
       * cook mode both count - see `meal-history.ts`.
       */}
      {madeLine ? (
        <Typography
          sx={{
            mb: 3,
            fontFamily: fonts.serif,
            fontStyle: "italic",
            fontWeight: 300,
            fontSize: "16px",
            lineHeight: 1.4,
            color: "text.secondary",
          }}
        >
          {madeLine}
        </Typography>
      ) : null}
    </>
  );
}
