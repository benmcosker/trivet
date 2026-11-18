"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  removeSharedWithUsAction,
  shareWithHouseholdAction,
  stopSharingWithAction,
} from "@/app/recipes/share-actions";
import type { ShareTarget } from "@/lib/recipe-shares";

/** What sharing with one household does, said where it is done. */
export const SHARE_WITH_ONE =
  "They will find it in their library, as you keep it: your edits reach them too. A photo that came with a website or a PDF stays with you.";

/** "The Smiths", "The Smiths and the Lees", "The Smiths, the Lees and 2 more". */
export function sharedWithLine(names: string[]): string {
  if (names.length === 0) return "Private to your household.";
  if (names.length === 1) return `Shared with ${names[0]}.`;
  if (names.length === 2) return `Shared with ${names[0]} and ${names[1]}.`;
  return `Shared with ${names[0]}, ${names[1]} and ${names.length - 2} more.`;
}

/**
 * Who else can cook from this household's recipe: households it names, one
 * at a time, by the email of someone in each (`recipe-shares.ts`).
 *
 * A sentence and a button, like the rest of the page's controls: the
 * sentence says who can see it now, the button what pressing it would do.
 */
export function ShareWithHouseholds({
  recipeId,
  sharedWith,
}: {
  recipeId: string;
  sharedWith: ShareTarget[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  function share(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await shareWithHouseholdAction(recipeId, email);
      if (result.ok) {
        setEmail("");
        setOpen(false);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  function stop(householdId: string) {
    startTransition(async () => {
      await stopSharingWithAction(recipeId, householdId);
      router.refresh();
    });
  }

  return (
    <Box sx={{ mt: 3, pt: 2, borderTop: 1, borderColor: "divider" }}>
      <Box
        sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1 }}
      >
        <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
          {sharedWithLine(sharedWith.map((h) => h.name))}
        </Typography>
        {open ? null : (
          <Button size="small" onClick={() => setOpen(true)}>
            Share with a household
          </Button>
        )}
      </Box>

      {sharedWith.length > 0 ? (
        <Box component="ul" sx={{ listStyle: "none", p: 0, m: 0, mt: 1 }}>
          {sharedWith.map((h) => (
            <Box
              component="li"
              key={h.householdId}
              sx={{ display: "flex", alignItems: "center", gap: 1 }}
            >
              <Typography variant="body2" sx={{ flexGrow: 1 }}>
                {h.name}
              </Typography>
              <Button
                size="small"
                disabled={pending}
                onClick={() => stop(h.householdId)}
                aria-label={`Stop sharing with ${h.name}`}
              >
                Stop sharing
              </Button>
            </Box>
          ))}
        </Box>
      ) : null}

      {open ? (
        <Box
          component="form"
          onSubmit={share}
          sx={{ mt: 1.5, maxWidth: "60ch" }}
        >
          <Typography variant="body2" sx={{ mb: 1.5 }}>
            {SHARE_WITH_ONE}
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
            <TextField
              size="small"
              type="email"
              label="Email of someone in that household"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
              required
              sx={{ flexGrow: 1, minWidth: 240 }}
            />
            <Button
              size="small"
              disabled={pending}
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              size="small"
              type="submit"
              variant="contained"
              disabled={pending || !email.trim()}
            >
              Share
            </Button>
          </Box>
          {error ? (
            <Typography
              variant="body2"
              color="error"
              role="alert"
              sx={{ mt: 1 }}
            >
              {error}
            </Typography>
          ) : null}
        </Box>
      ) : null}
    </Box>
  );
}

/**
 * The other side: a household something was shared with can take it out of
 * its library, without hiding the household that shared it.
 */
export function RemoveSharedWithUs({ recipeId }: { recipeId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="small"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await removeSharedWithUsAction(recipeId);
          router.push("/recipes");
        })
      }
    >
      Remove from our library
    </Button>
  );
}
