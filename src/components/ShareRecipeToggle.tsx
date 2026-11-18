"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  draftOwnWordsAction,
  setRecipeSharedAction,
  shareInOwnWordsAction,
} from "@/app/recipes/share-actions";
import type { Words } from "@/lib/library-refine";

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
 *
 * The ask comes with a way to meet it: "Put it in my own words" has the
 * model rewrite the title, description, method and notes (`own-words.ts`),
 * and the household reads the result here before anything changes. Sharing
 * that version saves it over theirs and shares in one step; "Keep mine"
 * throws it away.
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
  const [draft, setDraft] = useState<{
    words: Words;
    updatedAt: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setAsking(false);
    setDraft(null);
    setError(null);
  }

  function setShared(next: boolean) {
    startTransition(async () => {
      await setRecipeSharedAction(recipeId, next);
      reset();
      router.refresh();
    });
  }

  function rewrite() {
    setError(null);
    startTransition(async () => {
      const result = await draftOwnWordsAction(recipeId);
      if (result.ok) {
        setDraft({ words: result.words, updatedAt: result.updatedAt });
      } else {
        setError(result.error);
      }
    });
  }

  function shareDraft() {
    if (!draft) return;
    setError(null);
    startTransition(async () => {
      const result = await shareInOwnWordsAction(
        recipeId,
        draft.words,
        draft.updatedAt,
      );
      if (result.ok) {
        reset();
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  const offering = asking && !isShared;

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
            ? "Shared - every household can cook from this."
            : draft
              ? "Share it in these words?"
              : asking
                ? "Share with every household?"
                : "Private to your household."}
        </Typography>
        {isShared ? (
          <Button
            size="small"
            disabled={pending}
            onClick={() => setShared(false)}
          >
            Make it private
          </Button>
        ) : draft ? (
          <>
            <Button size="small" disabled={pending} onClick={reset}>
              Keep mine
            </Button>
            <Button size="small" disabled={pending} onClick={rewrite}>
              Try again
            </Button>
            <Button
              size="small"
              variant="contained"
              disabled={pending}
              onClick={shareDraft}
            >
              Share this version
            </Button>
          </>
        ) : asking ? (
          <>
            <Button size="small" disabled={pending} onClick={reset}>
              Not now
            </Button>
            <Button size="small" disabled={pending} onClick={rewrite}>
              {pending ? "Rewriting…" : "Put it in my own words"}
            </Button>
            <Button
              size="small"
              variant="contained"
              disabled={pending}
              onClick={() => setShared(true)}
            >
              Share it
            </Button>
          </>
        ) : (
          <Button size="small" onClick={() => setAsking(true)}>
            Share it
          </Button>
        )}
      </Box>

      {offering && !draft ? (
        <Typography variant="body2" sx={{ mt: 1.5, maxWidth: "60ch" }}>
          {SHARE_ASK}
        </Typography>
      ) : null}
      {offering && draft ? <OwnWordsPreview words={draft.words} /> : null}
      {error ? (
        <Typography
          variant="body2"
          color="error"
          role="alert"
          sx={{ mt: 1, maxWidth: "60ch" }}
        >
          {error}
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
    </Box>
  );
}

/**
 * The rewrite, laid out as the recipe page would show it, so it is read as a
 * recipe rather than as a diff. Ingredients are not shown: they do not change.
 */
function OwnWordsPreview({ words }: { words: Words }) {
  return (
    <Box
      sx={{
        mt: 2,
        p: 2,
        border: 1,
        borderColor: "divider",
        borderRadius: 1,
        maxWidth: "70ch",
      }}
    >
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Sharing this version replaces the title, description, method and notes
        on your recipe. The ingredients stay as they are.
      </Typography>
      <Typography variant="h3" gutterBottom>
        {words.title}
      </Typography>
      {words.description ? (
        <Typography sx={{ mb: 2 }}>{words.description}</Typography>
      ) : null}
      <Box component="ol" sx={{ pl: 3, m: 0 }}>
        {words.instructions.map((step, i) => (
          <Typography component="li" key={i} sx={{ mb: 1 }}>
            {step}
          </Typography>
        ))}
      </Box>
      {words.notes ? (
        <Typography variant="body2" sx={{ mt: 1.5 }}>
          {words.notes}
        </Typography>
      ) : null}
    </Box>
  );
}
