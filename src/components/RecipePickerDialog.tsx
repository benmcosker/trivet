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
import { useMemo, useState } from "react";

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
 * Filtering is a plain substring match on the title, done in the browser over
 * the recipes already loaded for the planner. The proper search - stemming,
 * ingredients, tags - lives on /recipes and needs the server; reaching for it
 * here would mean a round trip per keystroke to choose between the handful of
 * recipes a household actually cooks.
 */
export function RecipePickerDialog({
  open,
  dayLabel,
  recipes,
  selectedId,
  onPick,
  onClose,
}: {
  open: boolean;
  dayLabel: string;
  recipes: TileRecipe[];
  selectedId: string | null;
  onPick: (recipeId: string | null) => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);

  const matches = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return recipes;
    return recipes.filter((r) => r.title.toLowerCase().includes(needle));
  }, [filter, recipes]);

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
        <TextField
          autoFocus
          fullWidth
          size="small"
          placeholder="Filter by name…"
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
            {recipes.length === 0
              ? "No recipes in the library yet."
              : "Nothing matches that."}
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
                  <RecipeTile recipe={recipe} height={110} />
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
