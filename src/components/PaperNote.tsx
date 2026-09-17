"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";

import { fonts } from "@/theme/theme";

/**
 * Something the page has to tell you, set as a note rather than a banner.
 *
 * This replaces `Alert`, which arrives with a coloured fill, an icon and a
 * radius - three things this design does not have anywhere else, so a single
 * warning about Amazon's API was the loudest object on a page built from
 * hairlines. A note says the same thing with an overline naming it, the
 * message in serif, and a rule above and below.
 *
 * Severity is carried by the overline's colour alone, and only two exist:
 * clay for anything that went wrong or that you should know, green for
 * something that worked. That is thin on purpose - an error here is "the text
 * did not send", not a fault condition, and the words do the work.
 *
 * Stacked notes want their touching hairlines pulled together, or two rules
 * meet and read as one 2px line. That is the caller's job rather than a
 * `& + &` rule here: `sx` generates a different class per set of styles, so a
 * note beside one of a different tone would not match itself.
 *
 * Losing the `severity` prop loses the implicit `role="alert"` with it, so
 * `live` puts it back for the notes that appear in response to something you
 * did. Without it a screen reader is told nothing at all when a send fails.
 */
export function PaperNote({
  label,
  tone = "note",
  live = false,
  onDismiss,
  children,
}: {
  /** Names the note: "A note on Amazon Fresh", "Text sent". */
  label: string;
  tone?: "note" | "good";
  /** Announce it when it appears. For anything that answers a button press. */
  live?: boolean;
  onDismiss?: () => void;
  children: ReactNode;
}) {
  return (
    <Box
      role={live ? "alert" : undefined}
      sx={{
        py: "18px",
        borderTop: 1,
        borderBottom: 1,
        borderColor: "divider",
      }}
    >
      <Stack direction="row" sx={{ alignItems: "baseline", gap: 2, mb: "8px" }}>
        <Typography
          variant="overline"
          component="p"
          sx={{ color: tone === "good" ? "primary.main" : "secondary.main" }}
        >
          {label}
        </Typography>

        {onDismiss ? (
          <Button
            size="small"
            onClick={onDismiss}
            sx={{
              ml: "auto",
              px: 0,
              py: "5px",
              minWidth: 0,
              fontFamily: fonts.sans,
              fontWeight: 600,
              fontSize: "10.5px",
              lineHeight: 1.4,
              letterSpacing: "0.12em",
            }}
          >
            Dismiss
          </Button>
        ) : null}
      </Stack>

      <Box
        sx={{
          fontFamily: fonts.serif,
          fontSize: "18px",
          lineHeight: 1.5,
          color: "text.soft",
          // Long enough to read, short enough to keep the line length of a
          // paragraph rather than of a page.
          maxWidth: "76ch",
          textWrap: "pretty",
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
