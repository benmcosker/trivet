"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteAccountAction } from "@/app/household/account-actions";
import { showHouseholdAction } from "@/app/recipes/moderation-actions";
import type { DeletionPreview } from "@/lib/account-deletion";

/**
 * The households this one has hidden, each with a way to show it again.
 * Only drawn when there is one: nobody needs to read about a feature they
 * have not used.
 */
export function HiddenHouseholds({
  households,
}: {
  households: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (households.length === 0) return null;

  return (
    <Card>
      <CardContent>
        <Typography variant="h2" sx={{ mb: 0.5 }}>
          Hidden households
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          Their shared recipes and reviews don&apos;t show up for your
          household.
        </Typography>
        <Stack divider={<Divider />}>
          {households.map((household) => (
            <Box
              key={household.id}
              sx={{
                py: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 2,
              }}
            >
              <Typography>{household.name}</Typography>
              <Button
                size="small"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await showHouseholdAction(household.id);
                    router.refresh();
                  })
                }
              >
                Show again
              </Button>
            </Box>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}

/**
 * Delete my account: Apple's guideline 5.1.1(v), which asks that it be done
 * in the app rather than by email. Last on the page, and confirmed by typing
 * the account's email address, because it cannot be undone.
 */
export function DeleteAccount({
  email,
  householdName,
  preview,
}: {
  email: string;
  householdName: string;
  preview: DeletionPreview;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const consequence = preview.lastMember
    ? `You're the last person in ${householdName}, so the household goes too: ` +
      `its ${plural(preview.recipes, "recipe")}, plans, pantry and lists.` +
      (preview.sharedRecipes > 0
        ? ` That includes ${plural(preview.sharedRecipes, "recipe")} shared ` +
          "with other households, which leave their libraries and their plans."
        : "")
    : `${householdName} keeps everything: the recipes, plans and lists you ` +
      "added stay with the rest of your household. Your reviews and sign-in go.";

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const result = await deleteAccountAction(typed);
      // Only an answer comes back on a refusal; success leaves the page.
      if (result && !result.ok) setError(result.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent>
        <Typography variant="h2" sx={{ mb: 0.5 }}>
          Delete my account
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          {consequence} It can&apos;t be undone.
        </Typography>
        <Button color="error" variant="outlined" onClick={() => setOpen(true)}>
          Delete my account
        </Button>
      </CardContent>

      <Dialog
        open={open}
        onClose={() => !busy && setOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Delete your account?</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            {consequence} Type your email address to confirm.
          </DialogContentText>
          <TextField
            label="Your email address"
            value={typed}
            onChange={(event) => {
              setTyped(event.target.value);
              setError(null);
            }}
            type="email"
            autoComplete="off"
            autoCapitalize="none"
            fullWidth
            error={Boolean(error)}
            helperText={error ?? email}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={busy || typed.trim().length === 0}
            onClick={confirm}
          >
            {busy ? "Deleting…" : "Delete my account"}
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}
