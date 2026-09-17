"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import { Fragment, useTransition, type ReactNode } from "react";

import {
  removeFromPantryAction,
  unskipForWeekAction,
} from "@/app/plan/skip-actions";
import type { WeeklySkipRecord } from "@/lib/grocery";
import type { PantryItemRecord } from "@/lib/pantry";
import { fonts } from "@/theme/theme";

/**
 * What is being kept off the list, and how to put it back.
 *
 * Visible rather than tucked into a settings page: a shopping list that
 * silently omits an ingredient is worse than a long one, so whatever is hidden
 * stays in sight next to the list it was removed from.
 *
 * A footnote now, not a section. It used to be two labelled groups of deletable
 * chips, which is a lot of furniture for a sentence - and it sat directly under
 * the list claiming about as much of the page as an aisle of it.
 */
export function ExcludedIngredients({
  pantry,
  skips,
}: {
  pantry: PantryItemRecord[];
  skips: WeeklySkipRecord[];
}) {
  const [pending, startTransition] = useTransition();

  if (pantry.length === 0 && skips.length === 0) return null;

  return (
    <Box sx={{ mt: { xs: 3.5, md: 4.25 }, display: "grid", gap: 1.25 }}>
      {pantry.length > 0 ? (
        <Footnote
          label="Left off"
          items={pantry}
          pending={pending}
          undoHint="Take out of the pantry"
          onUndo={(id) =>
            startTransition(async () => {
              await removeFromPantryAction(id);
            })
          }
          tail={
            <>
              &mdash; always in the pantry.{" "}
              <Link href="/pantry">Manage the pantry</Link>
            </>
          }
        />
      ) : null}

      {skips.length > 0 ? (
        <Footnote
          label="Got it this week"
          items={skips}
          pending={pending}
          undoHint="Put back on this week's list"
          onUndo={(id) =>
            startTransition(async () => {
              await unskipForWeekAction(id);
            })
          }
          tail={<>&mdash; back on the list next week.</>}
        />
      ) : null}
    </Box>
  );
}

/** "Olive oil, salt, black pepper - always in the pantry." */
function Footnote({
  label,
  items,
  pending,
  undoHint,
  onUndo,
  tail,
}: {
  label: string;
  items: { id: string; name: string }[];
  pending: boolean;
  /** What clicking a name does. Said out loud, since nothing else says it. */
  undoHint: string;
  onUndo: (id: string) => void;
  tail: ReactNode;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "baseline",
        flexWrap: "wrap",
        gap: "12px",
      }}
    >
      <Typography
        variant="overline"
        component="span"
        sx={{ color: "text.secondary", flexShrink: 0 }}
      >
        {label}
      </Typography>

      <Box
        sx={{
          fontFamily: fonts.serif,
          fontSize: "18px",
          lineHeight: 1.45,
          color: "text.muted",
        }}
      >
        {/*
         * Each name undoes itself.
         *
         * The chips this replaces carried their own undo button, and losing
         * them would have made the pantry the only way back - so the words
         * became the control. A dotted underline rather than a solid one:
         * these are not links, and the page's one solid underline already
         * means "the week you are on".
         */}
        {items.map((item, index) => (
          <Fragment key={item.id}>
            {index > 0 ? ", " : null}
            <Box
              component="button"
              type="button"
              disabled={pending}
              onClick={() => onUndo(item.id)}
              aria-label={`${undoHint}: ${item.name}`}
              sx={{
                font: "inherit",
                color: "inherit",
                background: "none",
                border: 0,
                p: 0,
                cursor: "pointer",
                borderBottom: "1px dotted",
                borderColor: "divider",
                "&:hover, &:focus-visible": {
                  color: "secondary.main",
                  borderColor: "secondary.main",
                },
                "&:disabled": { cursor: "default" },
              }}
            >
              {index === 0 ? sentenceCase(item.name) : item.name}
            </Box>
          </Fragment>
        ))}{" "}
        <Box
          component="span"
          sx={{ fontStyle: "italic", fontWeight: 300, color: "text.secondary" }}
        >
          {tail}
        </Box>
      </Box>
    </Box>
  );
}

/**
 * Pantry names are stored as they were typed, which is usually "olive oil".
 * Only the first is lifted, because the rest are mid-sentence.
 */
function sentenceCase(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}
