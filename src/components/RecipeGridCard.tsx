import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Link from "next/link";

import type { RecipeWithRelations } from "@/lib/recipes";
import { photoTransitionName } from "@/lib/photo-transition";
import { recipeMetaParts } from "@/lib/recipe-meta";

import { RecipeMetaLine } from "./RecipeMetaLine";
import { RecipePhoto } from "./RecipePhoto";
import { RecipePlaceholder } from "./RecipePlaceholder";
import { ReviewStars } from "./ReviewStars";

/** Enough to characterise a dish; more than this and the card is all labels. */
const MAX_TAGS_ON_CARD = 3;

/**
 * The five bands every card occupies: photo, title, meta, stars, tags.
 *
 * Named because the number has to agree in two places - the `span` below and
 * the count of children rendered - and a card that spans four rows while
 * rendering five silently drags its neighbours out of line.
 */
const CARD_ROWS = 5;

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
 *
 * ## Why this is a subgrid rather than a column
 *
 * Titles wrap. A one-line title and a two-line title used to push everything
 * below them down by different amounts, so in any row of the grid the cooking
 * times sat at two or three different heights and the tag lines at two or
 * three more. Each card was internally tidy and the row as a whole was not.
 *
 * At `sm` and up the card borrows its parent's rows with `subgrid`, so every
 * card in a band shares one set of tracks: all the titles in the title row,
 * all the meta lines in the meta row, each sized to the tallest of them.
 * Nothing is measured and no height is hard-coded - the browser does it.
 *
 * The consequence is that **every card renders all five children**, including
 * the empty ones. A card that skips its stars does not leave a gap; it pulls
 * its tags up into the stars row and takes itself out of alignment. So the
 * absent ones render as empty cells rather than as nothing.
 *
 * An empty cell collapses its track to nothing but still pays the 14px gutter
 * beside it, so a row in which nobody has been rated carries 14px of air above
 * its tag rule. That is the price of the alignment, it is the same on every
 * card in the row, and it is cheaper than the alternative of measuring.
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

  /*
   * Where the words sit. On a phone the photo is beside them, so they are in
   * the second column; stacked above `sm`, they are in the only one.
   */
  const textColumn = { xs: 2, sm: 1 };

  return (
    /*
     * A plain <Link> with a Box inside, rather than `component={Link}` on the
     * Box. That prop hands MUI a component function, and a function cannot
     * cross from a server component into a client one - the same boundary
     * LinkButton exists for. It typechecks and it builds; it fails at render.
     *
     * `display: contents` so the anchor does not sit between the card and the
     * page's grid: `subgrid` borrows rows from the *parent* grid, and an
     * anchor in the middle would make the card a grid of its own with nothing
     * to borrow.
     */
    <Link
      href={`/recipes/${recipe.id}`}
      style={{ textDecoration: "none", color: "inherit", display: "contents" }}
    >
      <Box
        sx={{
          display: "grid",
          // A row on a phone, a tile everywhere else.
          //
          // The design draws one column at `sm` and below, which stacked would
          // put the photo above the text and run each card to nearly 400px -
          // one and a half recipes per phone screen. Beside the text instead,
          // the picture still identifies the dish while five or six fit where
          // one used to. Still one column, as drawn; just not a tall one.
          gridTemplateColumns: { xs: "116px 1fr", sm: "1fr" },
          // Borrow the parent's rows rather than making our own, so the bands
          // line up across the row. Below `sm` there is one card per row and
          // nothing to line up with, so the card keeps its own rows there.
          gridTemplateRows: { sm: "subgrid" },
          gridRow: { sm: `span ${CARD_ROWS}` },
          // A subgrid inherits its parent's gutters, and the parent's 44px is
          // the space *between* cards. Overridden so the bands inside a card
          // keep their 14px; the 44px still separates one row of cards from
          // the next, because that gap is not one of ours to override.
          columnGap: "14px",
          rowGap: "14px",
          // The only thing that moves on hover, per the design.
          "&:hover .RecipeGridCard-title": { color: "secondary.main" },
        }}
      >
        <Box
          sx={{
            gridColumn: 1,
            // Beside the words on a phone. One cell tall would leave the
            // photo stranded against the first line of the title.
            gridRow: { xs: `1 / span ${CARD_ROWS - 1}`, sm: "auto" },
            alignSelf: "start",
          }}
        >
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
              transitionName={photoTransitionName(recipe.id)}
            />
          ) : (
            // Not omitted: a card with no image is shorter than its neighbours,
            // and a grid of mismatched heights reads as broken rather than as
            // "this one has no photo".
            <RecipePlaceholder
              title={recipe.title}
              height={{ xs: 116, sm: 230 }}
              showTitle
              transitionName={photoTransitionName(recipe.id)}
            />
          )}
        </Box>

        <Typography
          variant="h3"
          component="h3"
          className="RecipeGridCard-title"
          sx={{
            gridColumn: textColumn,
            // Two lines, so cards keep to a rhythm rather than each finding
            // its own height. The clamp is also what bounds the title row:
            // without it one very long name would set the height of the title
            // band for every card beside it.
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            textWrap: "pretty",
            // The row is as tall as the tallest title in it, so a one-line
            // name sits up under its photo instead of floating in the middle
            // of the space a two-line neighbour asked for.
            alignSelf: "start",
            // Without this a long title refuses to wrap and pushes the card
            // wider than its column.
            minWidth: 0,
          }}
        >
          {recipe.title}
        </Typography>

        <Box sx={{ gridColumn: textColumn, alignSelf: "start", minWidth: 0 }}>
          <RecipeMetaLine parts={meta} dense />
        </Box>

        {/*
         * Only when somebody has actually said something. An unrated recipe
         * used to carry "No reviews yet" on every tile, which is six lines a
         * screen spent saying nothing. The cell is rendered either way, empty
         * or not, because the row it sits in belongs to the whole band.
         */}
        <Box sx={{ gridColumn: textColumn, alignSelf: "start" }}>
          {recipe.reviews.count > 0 ? (
            <ReviewStars summary={recipe.reviews} />
          ) : null}
        </Box>

        <Box sx={{ gridColumn: textColumn, alignSelf: "start" }}>
          {tags.length > 0 ? (
            <Box sx={{ display: "flex", flexDirection: "column", gap: "14px" }}>
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
            </Box>
          ) : null}
        </Box>
      </Box>
    </Link>
  );
}
