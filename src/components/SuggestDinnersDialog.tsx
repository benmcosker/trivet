"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import { useState } from "react";

import { addSuggestedDinnersAction } from "@/app/plan/suggest-actions";
import {
  inWords,
  type EveningContext,
  type RankableRecipe,
} from "@/lib/dinner-ranking";
import {
  alternativesFor,
  another,
  suggestDinners,
  type SuggestionRow,
} from "@/lib/suggest-dinners";
import { fonts } from "@/theme/theme";

const ACTION_SX = {
  px: 0,
  py: "5px",
  minWidth: 0,
  fontFamily: fonts.sans,
  fontWeight: 600,
  fontSize: "10.5px",
  lineHeight: 1.4,
  letterSpacing: "0.12em",
} as const;

/**
 * A dinner for each open evening, to tick, swap or leave.
 *
 * Nothing is planned until the button at the bottom is pressed, and then
 * only the ticked rows, only into evenings still empty. The title asks
 * rather than announces, because these are the app's guesses about a
 * household's week and the household has the last word.
 *
 * Mounted fresh each time it is opened (the planner keys it), so every
 * opening is a new draw - which is the point of the little chance in
 * `suggest-dinners.ts`. Everything it needs is already in the browser: the
 * planner loads the library and the week to fill the picker.
 */
export function SuggestDinnersDialog<T extends RankableRecipe>({
  open,
  recipes,
  evenings,
  plannedThisWeek,
  unsortedCount,
  onClose,
  onAdded,
}: {
  open: boolean;
  recipes: T[];
  /** Open evenings from today on, in date order, with "Tue 3" labels. */
  evenings: { dateIso: string; label: string }[];
  plannedThisWeek: EveningContext["plannedThisWeek"];
  /** Recipes nobody has sorted, which the sheet cannot pick from. */
  unsortedCount: number;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [rows, setRows] = useState<SuggestionRow<T>[]>(() =>
    suggestDinners(recipes, {
      evenings: evenings.map((e) => e.dateIso),
      plannedThisWeek,
    }),
  );
  // Unticked rather than ticked: every row with a dish starts ticked.
  const [left, setLeft] = useState<Set<string>>(() => new Set());
  const [adding, setAdding] = useState(false);
  const [missed, setMissed] = useState(0);

  const labelOf = new Map(evenings.map((e) => [e.dateIso, e.label]));
  const chosen = rows.filter((r) => r.pick && !left.has(r.dateIso));
  const nothingAtAll = rows.every((r) => r.pick === null);

  async function add() {
    setAdding(true);
    const { added } = await addSuggestedDinnersAction(
      chosen.map((r) => ({ date: r.dateIso, recipeId: r.pick!.recipe.id })),
    );
    setAdding(false);
    onAdded();
    // Somebody filled an evening while this was open. Say so rather than
    // closing as if all of them went on.
    if (added < chosen.length) {
      setMissed(chosen.length - added);
      return;
    }
    onClose();
  }

  function toggle(dateIso: string) {
    setLeft((was) => {
      const next = new Set(was);
      if (next.has(dateIso)) next.delete(dateIso);
      else next.add(dateIso);
      return next;
    });
  }

  const addLabel =
    chosen.length === 0
      ? "Add dinners"
      : `Add ${inWords(chosen.length)} ${chosen.length === 1 ? "dinner" : "dinners"}`;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 0.5 }}>How about these?</DialogTitle>
      <Typography
        sx={{
          px: 3,
          pb: 1.5,
          fontFamily: fonts.serif,
          fontStyle: "italic",
          fontWeight: 300,
          fontSize: "16px",
          color: "text.secondary",
        }}
      >
        Picked from your own dinners.
      </Typography>

      <DialogContent dividers sx={{ px: { xs: 2, sm: 3 }, py: 0 }}>
        {nothingAtAll ? (
          <Typography
            sx={{
              py: 3,
              fontFamily: fonts.serif,
              fontSize: "17px",
              lineHeight: 1.4,
              color: "text.secondary",
            }}
          >
            Nothing to pick from yet. Trivet picks from recipes sorted as
            dinners.
          </Typography>
        ) : (
          rows.map((row, index) => (
            <Row
              key={row.dateIso}
              label={labelOf.get(row.dateIso) ?? row.dateIso}
              row={row}
              ticked={!left.has(row.dateIso)}
              canStep={
                alternativesFor(recipes, rows, index, plannedThisWeek).length >
                0
              }
              onToggle={() => toggle(row.dateIso)}
              onAnother={() =>
                setRows((was) => another(recipes, was, index, plannedThisWeek))
              }
            />
          ))
        )}

        {unsortedCount > 0 ? (
          <Typography
            sx={{
              py: 2,
              fontFamily: fonts.serif,
              fontStyle: "italic",
              fontWeight: 300,
              fontSize: "14px",
              lineHeight: 1.4,
              color: "text.secondary",
            }}
          >
            {unsortedCount === 1
              ? "One of your recipes isn't sorted yet, so it can't be picked."
              : `${sentenceCase(inWords(unsortedCount))} of your recipes aren't sorted yet, so they can't be picked.`}{" "}
            <Box
              component={Link}
              href="/recipes/sort"
              sx={{
                fontFamily: fonts.sans,
                fontStyle: "normal",
                fontWeight: 700,
                fontSize: "10.5px",
                letterSpacing: "0.13em",
                textTransform: "uppercase",
                color: "primary.main",
                textDecoration: "none",
                borderBottom: 1,
                borderColor: "primary.main",
                pb: "1px",
                whiteSpace: "nowrap",
              }}
            >
              Sort them
            </Box>
          </Typography>
        ) : null}

        {missed > 0 ? (
          <Typography
            role="status"
            sx={{ pb: 2, fontFamily: fonts.serif, fontSize: "15px" }}
          >
            {missed === 1
              ? "One evening was planned while this was open, so it was left as it is."
              : `${sentenceCase(inWords(missed))} evenings were planned while this was open, so they were left as they are.`}
          </Typography>
        ) : null}
      </DialogContent>

      <DialogActions>
        {nothingAtAll || missed > 0 ? (
          <Button onClick={onClose}>Close</Button>
        ) : (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button
              variant="contained"
              disableElevation
              disabled={chosen.length === 0 || adding}
              onClick={add}
            >
              {adding ? "Adding…" : addLabel}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}

function sentenceCase(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * One evening: the day, the dish, and why.
 *
 * Unticked keeps the row in place and says the evening stays open, so
 * ticking it back is where you would look for it.
 */
function Row<T extends RankableRecipe>({
  label,
  row,
  ticked,
  canStep,
  onToggle,
  onAnother,
}: {
  label: string;
  row: SuggestionRow<T>;
  ticked: boolean;
  canStep: boolean;
  onToggle: () => void;
  onAnother: () => void;
}) {
  const pick = row.pick;
  const on = Boolean(pick) && ticked;

  return (
    <Stack
      direction="row"
      sx={{
        gap: 1,
        py: 1.75,
        borderBottom: 1,
        borderColor: "divider",
        "&:last-of-type": { borderBottom: 0 },
      }}
    >
      {/* No checkbox where there is nothing to tick, but the room it takes,
          so the day names stay in one column. */}
      <Box sx={{ width: 32, flexShrink: 0, mt: "-7px", ml: "-9px" }}>
        {pick ? (
          <Checkbox
            checked={ticked}
            onChange={onToggle}
            slotProps={{
              input: { "aria-label": `Plan ${pick.recipe.title} on ${label}` },
            }}
          />
        ) : null}
      </Box>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack
          direction="row"
          sx={{
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 1,
          }}
        >
          <Box
            component="span"
            sx={{
              fontFamily: fonts.sans,
              fontWeight: 700,
              fontSize: "11px",
              lineHeight: 1.4,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "text.primary",
            }}
          >
            {label}
          </Box>
          {on && canStep ? (
            <Button
              size="small"
              onClick={onAnother}
              aria-label={`Another dinner for ${label}`}
              sx={{ ...ACTION_SX, my: "-5px" }}
            >
              Another
            </Button>
          ) : null}
        </Stack>

        <Typography
          sx={{
            mt: 0.5,
            fontFamily: fonts.serif,
            fontSize: "18px",
            lineHeight: 1.3,
            ...(on
              ? {}
              : {
                  fontStyle: "italic",
                  fontWeight: 300,
                  color: "text.secondary",
                }),
          }}
        >
          {!pick
            ? "Nothing else to suggest."
            : ticked
              ? pick.recipe.title
              : "Left open."}
        </Typography>

        {on && pick?.reason ? (
          <Typography
            sx={{
              mt: 0.25,
              fontFamily: fonts.serif,
              fontStyle: "italic",
              fontWeight: 300,
              fontSize: "14px",
              lineHeight: 1.35,
              color: "text.secondary",
            }}
          >
            {pick.reason}
          </Typography>
        ) : null}
      </Box>
    </Stack>
  );
}
