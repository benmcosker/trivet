"use client";

import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import NavigateBeforeIcon from "@mui/icons-material/NavigateBefore";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Collapse from "@mui/material/Collapse";
import LinearProgress from "@mui/material/LinearProgress";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { useRouter } from "next/navigation";

import { clampStep } from "@/lib/cooking";

/**
 * Subscribe to something that never changes underneath us.
 *
 * `useSyncExternalStore` wants a subscribe function, and both values read
 * through it here - a stored step, and whether the browser has the Wake Lock
 * API - only ever change because this component changed them. Defined at
 * module scope so its identity is stable across renders; an inline arrow would
 * re-subscribe on every one.
 */
const subscribeNever = () => () => {};

/**
 * An ingredient, already formatted.
 *
 * Amounts arrive as strings rather than a number and a unit: the formatting
 * rule lives in `formatAmount`, and sending the parts would mean the cooking
 * view deciding again how a half is written.
 */
export type CookingIngredient = {
  id: string;
  amount: string;
  name: string;
  note: string | null;
};

/**
 * Keep the screen awake while somebody is cooking.
 *
 * The one thing this whole view is for. A phone propped against the kettle
 * sleeps in thirty seconds, and waking it means a greasy thumbprint on the
 * lock button, or worse, washing your hands first.
 *
 * Two things make this harder than one API call:
 *
 * - The lock is dropped by the browser whenever the page is hidden - a tab
 *   switch, an incoming call, or the screen locking anyway. It does not come
 *   back on its own, so it is re-requested on `visibilitychange`. Skip that
 *   and the lock appears to work exactly once, which is the shape of bug that
 *   gets reported as "it stopped working" and reproduces for nobody.
 * - Not every browser has it, and even where it exists the request can be
 *   refused - a laptop on low battery will say no. That is not an error worth
 *   showing twice, so refusal is reported once and the view stays usable: a
 *   cooking view that sleeps is still a cooking view.
 */
function useWakeLock(): { held: boolean; unavailable: boolean } {
  const [held, setHeld] = useState(false);
  const [refused, setRefused] = useState(false);
  // Kept in a ref rather than state: releasing it on unmount must not depend
  // on a render having happened since it was acquired.
  const lock = useRef<WakeLockSentinel | null>(null);

  /*
   * Whether the API exists at all is a fact about the browser, read during
   * render rather than discovered in an effect. The server has no navigator,
   * so it answers false and the client corrects it as React hydrates - which
   * is the job `useSyncExternalStore` exists to do, and avoids setting state
   * synchronously inside an effect to say what the browser already knew.
   */
  const hasApi = useSyncExternalStore(
    subscribeNever,
    () => "wakeLock" in navigator,
    () => false,
  );

  const acquire = useCallback(async () => {
    try {
      lock.current = await navigator.wakeLock.request("screen");
      setHeld(true);
      // Fires when the browser takes it back, which it does silently.
      lock.current.addEventListener("release", () => setHeld(false));
    } catch {
      // Refused - low battery, or a policy. Not fatal, and not worth a retry
      // loop that would ask again every time the page is touched.
      setHeld(false);
      setRefused(true);
    }
  }, []);

  useEffect(() => {
    if (!hasApi) return;
    /*
     * The lint rule cannot see past the call: every `setState` inside
     * `acquire` runs after `await`, or later still from the sentinel's
     * release listener, so none of them is the synchronous cascade the rule
     * is there to catch. This is the shape it explicitly allows - subscribing
     * to an external system and reporting back what it did.
     */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void acquire();

    function onVisibility() {
      if (document.visibilityState === "visible") void acquire();
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      void lock.current?.release();
      lock.current = null;
    };
  }, [acquire, hasApi]);

  return { held, unavailable: !hasApi || refused };
}

/**
 * One step at a time, in type you can read from arm's length.
 *
 * The recipe page is for choosing what to cook; this is for cooking it, and
 * the two want opposite things. Browsing wants everything visible at once.
 * Cooking wants one instruction, large, and no scrolling with the back of a
 * wrist.
 *
 * Ingredients stay one tap away rather than on another screen. You look back
 * at "how much butter" constantly, and making that a navigation - losing your
 * place in the method to answer it - is how this kind of view fails.
 */
export function CookingView({
  recipeId,
  steps,
  ingredients,
  ovenTemp,
}: {
  recipeId: string;
  steps: string[];
  ingredients: CookingIngredient[];
  ovenTemp: string | null;
}) {
  const [showIngredients, setShowIngredients] = useState(false);
  const { held, unavailable } = useWakeLock();
  const router = useRouter();

  // Per recipe, so cooking something else does not drop you into the middle
  // of it. Session rather than local: a place in a recipe is worth keeping
  // across a reload, not across a week.
  const storageKey = `cooking:${recipeId}`;

  /*
   * Where this browser left off, read during render.
   *
   * The server has no `sessionStorage`, so it answers null and the client
   * corrects it as React hydrates - no flash of step one on the way to step
   * six, and no state set from inside an effect to say what storage already
   * knew.
   */
  const saved = useSyncExternalStore(
    subscribeNever,
    () => {
      try {
        return window.sessionStorage.getItem(storageKey);
      } catch {
        // Private browsing, or storage disabled. Start at the beginning.
        return null;
      }
    },
    () => null,
  );

  /*
   * The step someone has moved to in this visit, which wins over the stored
   * one. Null means they have not moved yet, so the stored position stands.
   *
   * Held separately rather than seeded from storage because the first attempt
   * did the obvious thing - state plus an effect mirroring it into storage -
   * and that effect fired on mount with the initial 0, overwriting the stored
   * position before the restoring effect could use it. Reloading always put
   * you back at step one. Nothing writes a position here except somebody
   * choosing one.
   */
  const [moved, setMoved] = useState<number | null>(null);

  function goTo(next: number) {
    const clamped = clampStep(next, steps.length);
    setMoved(clamped);
    try {
      window.sessionStorage.setItem(storageKey, String(clamped));
    } catch {
      // Nothing to do: the position is a convenience, not the recipe.
    }
  }

  if (steps.length === 0) {
    return (
      <Alert severity="info">
        This recipe has no method recorded, so there is nothing to step through.
      </Alert>
    );
  }

  const current = clampStep(moved ?? Number(saved ?? 0), steps.length);
  const first = current === 0;
  const last = current === steps.length - 1;

  return (
    <Stack spacing={2}>
      <Stack
        direction="row"
        sx={{ alignItems: "center", flexWrap: "wrap", gap: 1 }}
      >
        <Typography variant="body2" color="text.secondary">
          Step {current + 1} of {steps.length}
        </Typography>
        {/*
         * The oven has to be on before anything else happens, so it rides
         * along on every step rather than living only in step one.
         */}
        {ovenTemp ? (
          <Chip label={ovenTemp} size="small" color="warning" />
        ) : null}
        {held ? (
          <Chip
            label="Screen staying on"
            size="small"
            variant="outlined"
            sx={{ ml: "auto" }}
          />
        ) : null}
      </Stack>

      <LinearProgress
        variant="determinate"
        value={((current + 1) / steps.length) * 100}
        aria-hidden
      />

      {unavailable && !held ? (
        <Typography variant="caption" color="text.secondary">
          This browser will not keep the screen awake, so it may sleep while you
          cook.
        </Typography>
      ) : null}

      {/*
       * The step itself. `minHeight` so that a two-word instruction does not
       * put the buttons somewhere different from where a long one does -
       * reaching for Next should not mean looking for it first.
       */}
      <Paper variant="outlined" sx={{ p: { xs: 2.5, sm: 4 }, minHeight: 200 }}>
        <Typography
          component="p"
          sx={{
            fontSize: { xs: "1.35rem", sm: "1.6rem" },
            lineHeight: 1.5,
            overflowWrap: "break-word",
          }}
        >
          {steps[current]}
        </Typography>
      </Paper>

      <Stack direction="row" spacing={1.5}>
        <Button
          fullWidth
          size="large"
          variant="outlined"
          startIcon={<NavigateBeforeIcon />}
          disabled={first}
          onClick={() => goTo(current - 1)}
          sx={{ py: 1.5 }}
        >
          Back
        </Button>
        {/*
         * On the last step this finishes rather than greys out. A disabled
         * button that says "Done" is the one thing on the screen inviting a
         * tap at the moment the cooking is over, and answering that tap with
         * nothing is a small insult. Going back to the recipe is also where
         * the rating lives, which is the next thing anybody wants.
         */}
        <Button
          fullWidth
          size="large"
          variant="contained"
          endIcon={last ? undefined : <NavigateNextIcon />}
          onClick={() =>
            last ? router.push(`/recipes/${recipeId}`) : goTo(current + 1)
          }
          sx={{ py: 1.5 }}
        >
          {last ? "Done" : "Next"}
        </Button>
      </Stack>

      <Box>
        <Button
          fullWidth
          onClick={() => setShowIngredients((open) => !open)}
          endIcon={
            <ExpandMoreIcon
              sx={{
                transition: "transform 150ms",
                transform: showIngredients ? "rotate(180deg)" : "none",
              }}
            />
          }
          aria-expanded={showIngredients}
        >
          {ingredients.length === 0
            ? "No ingredients listed"
            : `Ingredients (${ingredients.length})`}
        </Button>

        <Collapse in={showIngredients}>
          <Paper variant="outlined" sx={{ p: 2, mt: 1 }}>
            <Stack
              spacing={1}
              sx={{
                "& > :not(:last-child)": {
                  borderBottom: 1,
                  borderColor: "divider",
                  pb: 1,
                },
              }}
            >
              {ingredients.map((ingredient) => (
                <Box key={ingredient.id}>
                  <Typography>
                    <Box component="span" sx={{ fontWeight: 600 }}>
                      {ingredient.amount}
                    </Box>{" "}
                    {ingredient.name}
                  </Typography>
                  {ingredient.note ? (
                    <Typography variant="caption" color="text.secondary">
                      {ingredient.note}
                    </Typography>
                  ) : null}
                </Box>
              ))}
            </Stack>
          </Paper>
        </Collapse>
      </Box>
    </Stack>
  );
}
