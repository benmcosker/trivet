"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CardActionArea from "@mui/material/CardActionArea";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Grid from "@mui/material/Grid";
import TextField from "@mui/material/TextField";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import { useMemo, useState } from "react";

import {
  rankForEvening,
  type EveningContext,
  type RankableRecipe,
} from "@/lib/dinner-ranking";
import {
  PICKER_PAGE_SIZE,
  pageCount,
  pageRange,
  pageWindow,
} from "@/lib/recipe-page";

import {
  PAGE_GAP_SX,
  PAGE_RANGE_SX,
  PAGE_STEP_SX,
  pageNumberSx,
} from "./pagination-style";
import { RecipeTile, type TileRecipe } from "./RecipeTile";

/**
 * Pick a recipe for one day.
 *
 * Browsing shows dinners only, best first for this evening - see
 * `dinner-ranking.ts`. It used to show the whole library alphabetically, so
 * the first answer to "What are we eating on Monday?" was Buttermilk
 * Pancakes. Each tile carries the one reason it is where it is.
 *
 * Typing searches everything, dinners or not. Somebody who types "pancakes"
 * wants pancakes, and a filter that hid them would be the app deciding. It is
 * a plain substring match on the title, done in the browser over the recipes
 * already loaded for the planner; the proper search - stemming, ingredients,
 * tags - lives on /recipes and needs the server.
 */
export function RecipePickerDialog({
  open,
  dayLabel,
  recipes,
  evening,
  selectedId,
  onPick,
  onClose,
}: {
  open: boolean;
  dayLabel: string;
  recipes: (TileRecipe & RankableRecipe)[];
  /** The evening being planned and the week around it, for the ranking. */
  evening: EveningContext | null;
  selectedId: string | null;
  onPick: (recipeId: string | null) => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);

  const ranked = useMemo(
    () => (evening ? rankForEvening(recipes, evening) : []),
    [recipes, evening],
  );
  const reasonOf = useMemo(
    () => new Map(ranked.map((r) => [r.recipe.id, r.reason])),
    [ranked],
  );
  const rankOf = useMemo(
    () => new Map(ranked.map((r, i) => [r.recipe.id, i])),
    [ranked],
  );

  const matches = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (needle) {
      // Everything that matches, dinners first in ranked order, then the
      // rest by name.
      return recipes
        .filter((r) => r.title.toLowerCase().includes(needle))
        .sort(
          (a, b) =>
            (rankOf.get(a.id) ?? Infinity) - (rankOf.get(b.id) ?? Infinity) ||
            a.title.localeCompare(b.title),
        );
    }
    const dinners = ranked.map((r) => r.recipe);
    // Not yet sorted comes after the dinners, by name, so a recipe nobody
    // has classified is still in reach while browsing - a hand-made recipe
    // starts unsorted. Breakfasts, desserts and the rest stay out.
    const unsorted = recipes
      .filter((r) => r.course === null)
      .sort((a, b) => a.title.localeCompare(b.title));
    // The evening's current choice stays in view even when it is not sorted
    // as a dinner, so the highlight never points at something hidden.
    const current =
      selectedId && !rankOf.has(selectedId)
        ? recipes.find((r) => r.id === selectedId)
        : undefined;
    const browse = [...dinners, ...unsorted];
    return current && !browse.includes(current) ? [current, ...browse] : browse;
  }, [filter, recipes, ranked, rankOf, selectedId]);

  const totalPages = pageCount(matches.length, PICKER_PAGE_SIZE);
  /*
   * Clamped rather than reset.
   *
   * The filter narrowing under you is the same hazard the library has when a
   * search is run from page four: the page you were on stops existing. There
   * it is a URL and gets a note; here it is local state nobody linked to, so
   * it just moves to the last page that does exist.
   */
  const current = Math.min(page, totalPages);
  const shown = matches.slice(
    (current - 1) * PICKER_PAGE_SIZE,
    current * PICKER_PAGE_SIZE,
  );

  /*
   * Everything resets on the way out rather than on the way in.
   *
   * Re-opening on a different day should not land wherever the last visit
   * left off, and doing that with an effect on `open` is the anti-pattern the
   * lint rule catches - state set in an effect to answer a prop. Every exit
   * runs through here: picking a recipe, clearing the day, Cancel, Escape and
   * the backdrop all call it, so by the time the dialog is open again the
   * filter and the page are already back to the beginning.
   */
  function close() {
    setFilter("");
    setPage(1);
    onClose();
  }

  return (
    <Dialog open={open} onClose={close} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>{dayLabel}</DialogTitle>

      <DialogContent dividers>
        {/*
         * Not autofocused. With the list ranked, browsing it is the main way
         * in, and on a phone autofocus opened the keyboard straight over the
         * dishes the ranking had just put first.
         */}
        <TextField
          fullWidth
          size="small"
          placeholder="Search all recipes by name…"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            // A new filter starts at its beginning, as on the library page.
            setPage(1);
          }}
          sx={{ mb: 2 }}
        />

        {shown.length === 0 ? (
          <Typography color="text.secondary" sx={{ py: 3 }} align="center">
            {recipes.length === 0 ? (
              "No recipes in the library yet."
            ) : filter.trim() ? (
              "Nothing matches that."
            ) : (
              <>
                No recipes are sorted as dinners yet. Search above for any
                recipe, or <Link href="/recipes/sort">sort them</Link>.
              </>
            )}
          </Typography>
        ) : (
          <Grid container spacing={2}>
            {shown.map((recipe) => (
              <Grid key={recipe.id} size={{ xs: 6, sm: 4, md: 3 }}>
                <CardActionArea
                  onClick={() => {
                    onPick(recipe.id);
                    close();
                  }}
                  sx={{
                    p: 1,
                    borderRadius: 1.5,
                    border: 2,
                    borderColor:
                      recipe.id === selectedId ? "primary.main" : "transparent",
                  }}
                >
                  <RecipeTile
                    recipe={recipe}
                    height={110}
                    note={
                      reasonOf.get(recipe.id) ??
                      (recipe.course === null ? "Not sorted yet" : null)
                    }
                  />
                </CardActionArea>
              </Grid>
            ))}
          </Grid>
        )}

        <PickerPages
          current={current}
          totalPages={totalPages}
          totalResults={matches.length}
          onSelect={setPage}
        />
      </DialogContent>

      <DialogActions sx={{ justifyContent: "space-between" }}>
        <Box>
          {selectedId ? (
            <Button
              color="error"
              onClick={() => {
                onPick(null);
                close();
              }}
            >
              Clear this day
            </Button>
          ) : null}
        </Box>
        <Button onClick={close}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Which page of the library the picker is showing.
 *
 * Buttons rather than links, which is the one place this departs from the
 * control on `/recipes`: a dialog has no URL, so there is no page to link to
 * and nothing to put in history. The type specs are shared with that control
 * through `pagination-style.ts` so the two cannot drift apart on the things
 * that would show.
 *
 * Everything here is already in the browser - the planner loads the library to
 * fill this dialog - so a page change is a slice of an array rather than a
 * request. That is also why there is no loading state to speak of.
 */
function PickerPages({
  current,
  totalPages,
  totalResults,
  onSelect,
}: {
  current: number;
  totalPages: number;
  totalResults: number;
  onSelect: (page: number) => void;
}) {
  // One page has nothing to say about itself, the same as on the library page.
  if (totalPages <= 1) return null;

  const { first, last } = pageRange(current, totalResults, PICKER_PAGE_SIZE);

  return (
    <Box component="nav" aria-label="Recipe pages" sx={{ mt: 3 }}>
      <Stack
        direction="row"
        sx={{
          alignItems: "center",
          justifyContent: "space-between",
          gap: 2,
          pt: "14px",
          borderTop: 1,
          borderColor: "divider",
        }}
      >
        <Step
          to={current - 1}
          current={current}
          totalPages={totalPages}
          onSelect={onSelect}
        />

        <Stack
          direction="row"
          sx={{ alignItems: "baseline", gap: { xs: "16px", sm: "26px" } }}
        >
          {pageWindow(current, totalPages).map((entry, index) =>
            entry === "gap" ? (
              <Box
                key={`gap-${index}`}
                component="span"
                aria-hidden
                sx={PAGE_GAP_SX}
              >
                &hellip;
              </Box>
            ) : (
              <Button
                key={entry}
                onClick={() => onSelect(entry)}
                aria-label={`Page ${entry}`}
                aria-current={entry === current ? "page" : undefined}
                sx={{
                  ...pageNumberSx(entry === current),
                  minWidth: 0,
                  px: 0,
                  borderRadius: 0,
                }}
              >
                {entry}
              </Button>
            ),
          )}
        </Stack>

        <Step
          to={current + 1}
          current={current}
          totalPages={totalPages}
          onSelect={onSelect}
        />
      </Stack>

      <Box
        sx={{
          ...PAGE_RANGE_SX,
          mt: "12px",
          textAlign: "center",
          fontSize: "17px",
        }}
      >
        Recipes {first}&ndash;{last} of {totalResults}
      </Box>
    </Box>
  );
}

/**
 * Previous and Next, which stay put at the ends rather than disappearing, so
 * the row does not change width when you reach the first or last page.
 */
function Step({
  to,
  current,
  totalPages,
  onSelect,
}: {
  to: number;
  current: number;
  totalPages: number;
  onSelect: (page: number) => void;
}) {
  const back = to < current;
  const label = back ? "\u2190\u2002Prev" : "Next\u2002\u2192";
  const inert = to < 1 || to > totalPages;

  if (inert) {
    return (
      <Box
        component="span"
        aria-hidden
        sx={{ ...PAGE_STEP_SX, color: "text.disabled", px: 1 }}
      >
        {label}
      </Box>
    );
  }

  return (
    <Button
      onClick={() => onSelect(to)}
      sx={{
        ...PAGE_STEP_SX,
        px: 1,
        minWidth: 0,
        color: "text.soft",
        "&:hover": { color: "secondary.main" },
      }}
    >
      {label}
    </Button>
  );
}
