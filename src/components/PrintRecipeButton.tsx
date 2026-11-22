"use client";

import PrintIcon from "@mui/icons-material/Print";
import Button from "@mui/material/Button";

import { printPage } from "@/lib/print-page";

/**
 * Print the recipe as it is on screen: at the servings it is being read for.
 *
 * The browser's own print, with the page's print rules doing the work (see
 * `[data-print]` in the theme): the buttons, the photo, the reviews and the
 * sharing box stay on screen, and the paper gets the title, the facts, the
 * ingredients and the method. The photo is left off for the ink, the same
 * call the planner's sheets make.
 */
export function PrintRecipeButton() {
  return (
    // Quiet, like Delete beside it: Cook and Edit are the page's actions.
    <Button startIcon={<PrintIcon />} onClick={() => printPage()}>
      Print
    </Button>
  );
}
