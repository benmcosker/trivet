"use client";

import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import type { TagCount } from "@/lib/collections";

/**
 * The whole tag vocabulary, one click away.
 *
 * It used to be a wall of sixty chips above the grid, which pushed the first
 * recipe below the fold and cost that space on every visit - including the
 * majority where nobody filters by tag at all. Six named collections cover the
 * common ways in; this is where the rest went.
 *
 * Toggling writes `?tag=` exactly as the chips always did, so a filtered view
 * is still linkable and the back button still works.
 */
export type FiltersAppearance = "button" | "shelf";

export function RecipeFilters({
  tags,
  appearance = "button",
}: {
  tags: TagCount[];
  /**
   * `button` is the control in the page header - its own words, its own
   * hairline, beside `New recipe`.
   *
   * `shelf` is the same door drawn as the collections row's leading label,
   * which is the form a phone gets because its header has no row to spare.
   * `CollectionsRow` carries the reasoning for how it is drawn.
   */
  appearance?: FiltersAppearance;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  const activeTags = searchParams.getAll("tag");

  function toggleTag(slug: string) {
    const params = new URLSearchParams(searchParams.toString());
    // A new filter starts at its beginning; see RecipeSearchBar.
    params.delete("page");
    const next = activeTags.includes(slug)
      ? activeTags.filter((t) => t !== slug)
      : [...activeTags, slug];

    params.delete("tag");
    for (const tag of next) params.append("tag", tag);
    router.replace(`${pathname}?${params.toString()}`);
  }

  function clearTags() {
    const params = new URLSearchParams(searchParams.toString());
    // A new filter starts at its beginning; see RecipeSearchBar.
    params.delete("page");
    params.delete("tag");
    router.replace(`${pathname}?${params.toString()}`);
  }

  // What the control says depends on whether it is doing anything: the tag
  // count is context, the active count is state, and the second matters more.
  // One control, one name. The two appearances differ in how they are drawn
  // and never in what they say - and `tags` is the honest word for what the
  // dialog lists, because a collection is one of the six curated shelves in
  // `COLLECTION_SLUGS` and this is the whole vocabulary behind them.
  const label =
    activeTags.length > 0
      ? `Filters · ${activeTags.length} on`
      : `Filters · ${tags.length} tags`;

  return (
    <>
      {appearance === "shelf" ? (
        <ButtonBase
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          sx={(theme) => ({
            ...theme.typography.overline,
            flexShrink: 0,
            whiteSpace: "nowrap",
            alignItems: "baseline",
            gap: "7px",
            color: activeTags.length > 0 ? "text.primary" : "text.secondary",
            transition: "color 120ms",
            "&:hover, &:focus-visible": { color: "text.primary" },
            /*
             * Real padding, not a `::after` reaching past the element the way
             * the search row's `Clear` does. This row scrolls sideways, and
             * `overflow-x: auto` computes `overflow-y: auto` with it - so
             * anything sticking out above or below the row is clipped, hit
             * area included. Measured: a pseudo-element here bought nothing,
             * `elementFromPoint` 12px above the word returned the page.
             *
             * The row's margin below is paid down by the same amount, so an
             * 11px label with a 33px target costs the header 2px.
             */
            py: "7px",
          })}
        >
          {label}
          {/*
           * A chevron, not the hairline this same control wears in the header
           * at `md`. Drawn all three ways at 393 and compared:
           *
           * - **Bare** - the words alone - is inert. They are the clothes
           *   `Search` wears at the head of the row above, and `Search` is a
           *   label, so a word in that voice in that position reads as the
           *   row's address rather than as something to press.
           * - **With the hairline** it reads as a control, but it borrows the
           *   one mark this row has already spent: a rule here means "a
           *   collection, tap to toggle it", and going dark means it is on.
           *   This is not a collection and it does not toggle - it opens a
           *   dialog - so it would be wearing another thing's clothes.
           * - **With the chevron** it can only be read as a disclosure, and
           *   it borrows nothing from the names beside it.
           *
           * `ExpandMoreIcon` rather than a `▼`: the icon is this app's own
           * mark for a list behind a button - `CookingView` opens its
           * ingredients with one - where `▼` appears nowhere in `src/`. The
           * sort control one row up wears `↓`, which is not this mark and
           * does not mean this: `recipe-sort.ts` says the arrow is carrying
           * the "first" in "Newest first".
           */}
          <ExpandMoreIcon
            sx={{
              // Sized to the 11px overline it sits in rather than left at
              // MUI's 24px default, and nudged up off the baseline, where an
              // icon box this tall otherwise hangs below the line.
              fontSize: "0.9375rem",
              position: "relative",
              top: "3px",
            }}
          />
        </ButtonBase>
      ) : (
        <Button
          onClick={() => setOpen(true)}
          sx={{
            flexShrink: 0,
            whiteSpace: "nowrap",
            borderBottom: "1px solid",
            borderColor: "divider",
            borderRadius: 0,
            pb: "4px",
            // The rule should hug the words, not sit at the bottom of a button.
            px: 0,
            color: activeTags.length > 0 ? "text.primary" : "text.secondary",
          }}
        >
          {label}
        </Button>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        fullWidth
        maxWidth="sm"
        aria-labelledby="recipe-filters-title"
      >
        <DialogTitle id="recipe-filters-title" variant="h4">
          Filter by tag
        </DialogTitle>
        <DialogContent>
          {tags.length === 0 ? (
            <Typography color="text.secondary">
              No tags yet. They arrive with the recipes.
            </Typography>
          ) : (
            <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1, pt: 1 }}>
              {tags.map((tag) => {
                const active = activeTags.includes(tag.slug);
                return (
                  <Chip
                    key={tag.slug}
                    label={`${tag.name} (${tag.count})`}
                    onClick={() => toggleTag(tag.slug)}
                    color={active ? "primary" : "default"}
                    variant={active ? "filled" : "outlined"}
                    size="small"
                    aria-pressed={active}
                  />
                );
              })}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={clearTags} disabled={activeTags.length === 0}>
            Clear
          </Button>
          <Button
            variant="contained"
            color="ink"
            onClick={() => setOpen(false)}
          >
            Done
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
