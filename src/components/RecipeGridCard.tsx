import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Link from "next/link";

import type { RecipeWithRelations } from "@/lib/recipes";
import { recipeMetaParts } from "@/lib/recipe-meta";

import { RecipeMetaLine } from "./RecipeMetaLine";
import { RecipePhoto } from "./RecipePhoto";
import { RecipePlaceholder } from "./RecipePlaceholder";
import { ReviewStars } from "./ReviewStars";

/** Enough to characterise a dish; more than this and the card is all labels. */
const MAX_TAGS_ON_CARD = 3;

/**
 * One recipe in the library grid.
 *
 * No border, no background, no padding - the card is a stack of type on the
 * page, and what separates it from its neighbours is the 40px of paper around
 * it. The only rule is the hairline above the tag line.
 *
 * The delete button that used to float in the photo's corner has gone to the
 * recipe page, which already had one: six red circles per screen, for something
 * nobody does in bulk.
 */
export function RecipeGridCard({
  recipe,
  priority = false,
}: {
  recipe: RecipeWithRelations;
  /**
   * Load this card's photo eagerly.
   *
   * `RecipePhoto` says everything below the fold stays lazy, and on page one
   * that is every card - the hero above them is the only eager photo. On page
   * two there is no hero, so the first row *is* the fold, and the page sets
   * this on those cards and no others.
   */
  priority?: boolean;
}) {
  const meta = recipeMetaParts(recipe);
  const tags = recipe.tags.slice(0, MAX_TAGS_ON_CARD);

  return (
    /*
     * A plain <Link> with a Box inside, rather than `component={Link}` on the
     * Box. That prop hands MUI a component function, and a function cannot
     * cross from a server component into a client one - the same boundary
     * LinkButton exists for. It typechecks and it builds; it fails at render.
     */
    <Link
      href={`/recipes/${recipe.id}`}
      style={{ textDecoration: "none", color: "inherit", display: "block" }}
    >
      <Box
        sx={{
          display: "flex",
          // A row on a phone, a tile everywhere else.
          //
          // The design draws one column at `sm` and below, which stacked would
          // put the photo above the text and run each card to nearly 400px -
          // one and a half recipes per phone screen. Beside the text instead,
          // the picture still identifies the dish while five or six fit where
          // one used to. Still one column, as drawn; just not a tall one.
          flexDirection: { xs: "row", sm: "column" },
          gap: "14px",
          // The only thing that moves on hover, per the design.
          "&:hover .RecipeGridCard-title": { color: "secondary.main" },
        }}
      >
        <Box sx={{ width: { xs: 116, sm: "100%" }, flexShrink: 0 }}>
          {recipe.imageUrl ? (
            // Three cards per row on a desktop, two on a tablet, one on a phone.
            // The last value is a fixed width rather than a fraction: past the
            // page's max width the card stops growing, and a vw figure would keep
            // asking for larger files that are never drawn.
            <RecipePhoto
              src={recipe.imageUrl}
              height={{ xs: 116, sm: 230 }}
              rounded={0}
              sizes="(max-width: 600px) 116px, (max-width: 900px) 50vw, (max-width: 1440px) 32vw, 430px"
              priority={priority}
            />
          ) : (
            // Not omitted: a card with no image is shorter than its neighbours,
            // and a grid of mismatched heights reads as broken rather than as
            // "this one has no photo".
            <RecipePlaceholder
              title={recipe.title}
              height={{ xs: 116, sm: 230 }}
              showTitle
            />
          )}
        </Box>

        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: "14px",
            flexGrow: 1,
            // Without this a long title refuses to wrap and pushes the row wider
            // than the card.
            minWidth: 0,
          }}
        >
          <Typography
            variant="h3"
            component="h3"
            className="RecipeGridCard-title"
            sx={{
              // Two lines, so cards keep to a rhythm rather than each finding
              // its own height.
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              textWrap: "pretty",
            }}
          >
            {recipe.title}
          </Typography>

          <RecipeMetaLine parts={meta} dense />

          {/*
           * Only when somebody has actually said something. An unrated recipe
           * used to carry "No reviews yet" on every tile, which is six lines a
           * screen spent saying nothing.
           */}
          {recipe.reviews.count > 0 ? (
            <ReviewStars summary={recipe.reviews} />
          ) : null}

          {tags.length > 0 ? (
            <>
              <Box sx={{ height: "1px", bgcolor: "divider" }} />
              {/*
               * Plain text rather than chips. Three outlined pills per card is
               * nine boxes across a row of the grid, and at this size the tags
               * are a footnote, not a control - the collections row and the
               * filters are where you go to search by one.
               */}
              <Typography
                variant="caption"
                component="div"
                sx={{
                  fontSize: "0.6875rem",
                  letterSpacing: "0.13em",
                  textTransform: "uppercase",
                  color: "text.secondary",
                  lineHeight: 1.5,
                }}
              >
                {tags.map(({ tag }) => tag.name).join(" · ")}
              </Typography>
            </>
          ) : null}
        </Box>
      </Box>
    </Link>
  );
}
