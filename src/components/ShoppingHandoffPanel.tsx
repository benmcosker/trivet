"use client";

import Box from "@mui/material/Box";
import Link from "@mui/material/Link";

import type { HandoffResult } from "@/lib/shopping";

import { PaperNote } from "./PaperNote";

/**
 * Renders the outcome of a hand-off: a cart ready to check out, or why there
 * is not one.
 */
export function ShoppingHandoffPanel({ result }: { result: HandoffResult }) {
  if (!result.ok) {
    return (
      <Box sx={{ mt: 2.5 }}>
        <PaperNote label="That did not work" live>
          {result.error}
        </PaperNote>
      </Box>
    );
  }

  return (
    <Box sx={{ mt: 2.5 }}>
      <PaperNote label="Your cart is ready" tone="good" live>
        {result.itemCount} {result.itemCount === 1 ? "item" : "items"} are in
        it.{" "}
        <Link href={result.url} target="_blank" rel="noopener noreferrer">
          Open it to check out
        </Link>
        . Payment and delivery are handled there.
      </PaperNote>
    </Box>
  );
}
