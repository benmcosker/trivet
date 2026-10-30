"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import type { ReviewSummary } from "@/lib/review-schema";

import { RecipePhoto } from "./RecipePhoto";
import { RecipePlaceholder } from "./RecipePlaceholder";
import { ReviewStars } from "./ReviewStars";
import { fonts } from "@/theme/theme";

export type TileRecipe = {
  id: string;
  /** The stable half of the recipe's address. See `recipe-url.ts`. */
  publicId: string;
  title: string;
  imageUrl: string | null;
  /** Optional so a tile can be shown before review scores have been loaded. */
  reviews?: ReviewSummary;
};

/**
 * A recipe as a picture and a name.
 *
 * Recipes without a photo get the shared placeholder rather than a broken
 * frame or a stock image - plenty arrive without one, and pretending otherwise
 * looks worse than admitting it.
 */
export function RecipeTile({
  recipe,
  height = 96,
  note,
}: {
  recipe: TileRecipe;
  height?: number;
  /**
   * Why this tile is where it is, from the picker's ranking: "Last made
   * seven weeks ago". Shown in place of the stars when present - a picker
   * full of "No reviews yet" says nothing, and the order needs explaining
   * more than the score does.
   */
  note?: string | null;
}) {
  return (
    <Box sx={{ width: "100%" }}>
      {recipe.imageUrl ? (
        // The smallest place a photo appears, and the one that gained most
        // from this: a tile 96px tall was pulling a 1600px file.
        <RecipePhoto
          src={recipe.imageUrl}
          height={height}
          sizes="(max-width: 600px) 45vw, (max-width: 900px) 30vw, (max-width: 1200px) 15vw, 165px"
        />
      ) : (
        <RecipePlaceholder title={recipe.title} height={height} />
      )}

      <Typography
        variant="body2"
        sx={{
          mt: 0.75,
          fontWeight: 600,
          lineHeight: 1.25,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {recipe.title}
      </Typography>

      {/*
       * The count is left off here. A tile is narrow, and when you are picking
       * what to cook the score is the useful half - the sample size is one
       * click away on the recipe itself.
       */}
      {note ? (
        // The library's voice, small and italic: a remark about the dish,
        // not a control, so it cannot be mistaken for one.
        <Typography
          variant="body2"
          sx={{
            mt: 0.25,
            fontFamily: fonts.serif,
            fontStyle: "italic",
            fontSize: "0.875rem",
            lineHeight: 1.3,
            color: "text.secondary",
          }}
        >
          {note}
        </Typography>
      ) : recipe.reviews &&
        // On a ranked tile - `note` passed, even as null - stars only when
        // there are some. "No reviews yet" on every tile of a sparse library
        // is the noise the reason line replaced.
        (note === undefined || recipe.reviews.count > 0) ? (
        <Box sx={{ mt: 0.25 }}>
          <ReviewStars summary={recipe.reviews} showCount={false} />
        </Box>
      ) : null}
    </Box>
  );
}
