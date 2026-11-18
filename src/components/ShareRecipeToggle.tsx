"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setRecipeSharedAction } from "@/app/recipes/share-actions";

/**
 * What sharing asks of the household, said where they share.
 *
 * The terms already say it; nobody reads terms at the moment it matters. A
 * shared recipe is published to every household there is, and the wording of a
 * food site or a cookbook is somebody else's to publish. Ingredients are facts
 * and fine; the method in their words, and their photos, are not.
 */
export const SHARE_ASK =
  "Share recipes you wrote, or have put in your own words. A method copied from a website, cookbook or meal kit should stay private.";

/** Said when the photo came with the source, which never travels. */
export const PHOTO_STAYS_HOME =
  "The photo came with the source, so other households see a placeholder until you add one of your own.";

/**
 * Whether this household's recipe is visible to the others.
 *
 * A sentence and a button rather than a switch: the two states have different
 * consequences and neither is a setting you flick past. What it says is what
 * is true now; what the button says is what pressing it would do.
 *
 * Sharing takes a second tap, after the ask above; making a recipe private
 * again takes one, because taking something back needs no warning.
 */
export function ShareRecipeToggle({
  recipeId,
  isShared,
  photoStaysHome = false,
}: {
  recipeId: string;
  isShared: boolean;
  /** The recipe has a photo from its source, which other households never see. */
  photoStaysHome?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [asking, setAsking] = useState(false);

  function setShared(next: boolean) {
    startTransition(async () => {
      await setRecipeSharedAction(recipeId, next);
      setAsking(false);
      router.refresh();
    });
  }

  return (
    <Box
      sx={{
        mt: 3,
        pt: 2,
        borderTop: 1,
        borderColor: "divider",
      }}
    >
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 1,
        }}
      >
        <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
          {isShared
            ? "In the shared library: every household sees it."
            : asking
              ? "Add it to the shared library?"
              : "Not in the shared library."}
        </Typography>
        {isShared ? (
          <Button
            size="small"
            disabled={pending}
            onClick={() => setShared(false)}
          >
            Take it out
          </Button>
        ) : asking ? null : (
          <Button size="small" onClick={() => setAsking(true)}>
            Add to shared library
          </Button>
        )}
      </Box>

      {/* The ask before the button that answers it, not after. */}
      {asking && !isShared ? (
        <Typography variant="body2" sx={{ mt: 1.5, maxWidth: "60ch" }}>
          {SHARE_ASK}
        </Typography>
      ) : null}
      {photoStaysHome && (isShared || asking) ? (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mt: 1, maxWidth: "60ch" }}
        >
          {PHOTO_STAYS_HOME}
        </Typography>
      ) : null}
      {asking && !isShared ? (
        <Box sx={{ display: "flex", gap: 1, mt: 1.5 }}>
          <Button
            size="small"
            disabled={pending}
            onClick={() => setAsking(false)}
          >
            Not now
          </Button>
          <Button
            size="small"
            variant="contained"
            disabled={pending}
            onClick={() => setShared(true)}
          >
            Share with everyone
          </Button>
        </Box>
      ) : null}
    </Box>
  );
}
