"use client";

import SoupKitchenIcon from "@mui/icons-material/SoupKitchen";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { usePathname } from "next/navigation";

import { useOpeningRecipe } from "@/lib/opening-recipe";
import { photoTransitionName } from "@/lib/photo-transition";

import { LinkButton } from "./LinkButton";
import { Bar, WIDTHS, stripes, waiting } from "./PageOutline";
import { RecipeFacts } from "./RecipeFacts";
import { RecipePhoto } from "./RecipePhoto";
import { RecipePlaceholder } from "./RecipePlaceholder";

/**
 * The recipe page's outline, drawn with what the tapped card already knew.
 *
 * Opened from a card, the top of the page is real at once: the recipe's name,
 * the facts under it (`RecipeFacts`, the page's own rows), and its photo,
 * named for the morph, so the card's picture grows straight into the header
 * instead of waiting for the page. Only the ingredients and method breathe. When the page arrives the photo is
 * in the same place, so the top of the page does not move a second time.
 * Arriving any other way, it is the plain outline. See `opening-recipe.ts`.
 *
 * Laid out as `recipes/[id]/page.tsx` lays out its header, so nothing jumps
 * when the real page replaces it.
 */
export function RecipeOutline() {
  const pathname = usePathname();
  const opening = useOpeningRecipe();
  const known = opening && samePath(opening.path, pathname) ? opening : null;

  return (
    <Box role="status" aria-label="Loading" aria-busy="true">
      {known ? (
        <>
          {/* The page's title row, as `recipes/[id]/page.tsx` sets it. */}
          <Stack
            direction={{ xs: "column", sm: "row" }}
            sx={{
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 2,
              mb: 1,
            }}
          >
            <Typography
              variant="h1"
              component="p"
              sx={{ overflowWrap: "break-word" }}
            >
              {known.title}
            </Typography>
            {/*
             * Cook, which every reader gets, so it is already the right
             * height. Edit and Delete arrive with the page, beside it, for
             * the household that owns the recipe.
             */}
            <LinkButton
              href={`${known.path}/cook`}
              startIcon={<SoupKitchenIcon />}
              variant="contained"
            >
              Cook
            </LinkButton>
          </Stack>
          <RecipeFacts
            recipe={known.facts}
            servings={known.facts.servings}
            madeLine={known.madeLine}
          />
        </>
      ) : (
        <>
          <Box sx={{ ...waiting, mb: 1, pt: 1 }}>
            <Bar width="60%" height={36} />
          </Box>
          <Box sx={{ ...waiting, height: 40, mb: 3 }}>
            <Bar width="96px" height={40} />
          </Box>
        </>
      )}

      <Box sx={{ mb: 3 }}>
        {known?.imageUrl ? (
          <RecipePhoto
            src={known.imageUrl}
            height={{ xs: 200, sm: 380 }}
            rounded={2}
            priority
            sizes={known.sizes}
            transitionName={photoTransitionName(known.id)}
          />
        ) : known ? (
          <RecipePlaceholder
            title={known.title}
            height={{ xs: 160, sm: 220 }}
            showTitle
            transitionName={photoTransitionName(known.id)}
          />
        ) : (
          <Box
            sx={{
              ...waiting,
              height: { xs: 200, sm: 380 },
              borderRadius: 2,
              background: stripes,
            }}
          />
        )}
      </Box>

      <Box
        sx={{
          ...waiting,
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "1fr 2fr" },
          gap: 3,
        }}
      >
        {[5, 4].map((rows, column) => (
          <Box
            key={column}
            sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}
          >
            <Bar width="40%" height={20} />
            {WIDTHS.slice(0, rows).map((width, index) => (
              <Bar key={index} width={width} />
            ))}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

/** The card's link and the address bar, which may differ in encoding. */
function samePath(a: string, b: string | null): boolean {
  if (!b) return false;
  const clean = (path: string) => {
    try {
      return decodeURIComponent(path.split(/[?#]/)[0]).replace(/\/$/, "");
    } catch {
      return path;
    }
  };
  return clean(a) === clean(b);
}
