"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import TextField from "@mui/material/TextField";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  hideHouseholdAction,
  reportContentAction,
} from "@/app/recipes/moderation-actions";
import { REPORT_REASONS } from "@/lib/moderation-copy";
import type { ReportTarget } from "@/lib/moderation-copy";

/**
 * Report this, or hide the household it came from: Apple's guideline 1.2 for
 * content other people share. Only on what another household shared, and
 * kept quiet - two small words, not buttons - because nearly everything in
 * the library is somebody's family recipe, not a problem.
 */
export function ReportOrHide({
  target,
  household,
  what,
  afterHide = "refresh",
}: {
  target: ReportTarget;
  /** The household that shared it. */
  household: { id: string; name: string };
  /** "recipe" or "review", for the copy. */
  what: "recipe" | "review";
  /** A hidden recipe's page is gone, so leave it for the library. */
  afterHide?: "refresh" | "library";
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"report" | "sent" | "hide" | null>(null);
  const [reason, setReason] = useState<string>(REPORT_REASONS[0].value);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function sendReport() {
    setBusy(true);
    try {
      await reportContentAction(target, reason, note.trim() || null);
      setDialog("sent");
    } finally {
      setBusy(false);
    }
  }

  async function hide() {
    setBusy(true);
    try {
      await hideHouseholdAction(household.id);
      setDialog(null);
      if (afterHide === "library") router.push("/recipes");
      else router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const link = {
    typography: "caption",
    color: "text.secondary",
    textDecoration: "underline",
    textUnderlineOffset: "2px",
    "&:hover, &:focus-visible": { color: "text.primary" },
    // The word is small; the target it answers to is not.
    py: "12px",
    my: "-12px",
  } as const;

  return (
    <>
      <Box
        component="span"
        sx={{ display: "inline-flex", gap: 1.5, alignItems: "baseline" }}
      >
        <ButtonBase sx={link} onClick={() => setDialog("report")}>
          Report
        </ButtonBase>
        <ButtonBase sx={link} onClick={() => setDialog("hide")}>
          Hide {household.name}
        </ButtonBase>
      </Box>

      <Dialog
        open={dialog === "report"}
        onClose={() => setDialog(null)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Report this {what}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 1.5 }}>
            Trivet&apos;s admins read every report within a day, and take down
            what breaks the rules. {household.name} isn&apos;t told who reported
            it.
          </DialogContentText>
          <RadioGroup
            aria-label="Why"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          >
            {REPORT_REASONS.map((option) => (
              <FormControlLabel
                key={option.value}
                value={option.value}
                control={<Radio />}
                label={option.label}
              />
            ))}
          </RadioGroup>
          <TextField
            label="Anything to add (optional)"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            multiline
            minRows={2}
            fullWidth
            slotProps={{ htmlInput: { maxLength: 1000 } }}
            sx={{ mt: 1.5 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="contained" disabled={busy} onClick={sendReport}>
            Send report
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={dialog === "sent"}
        onClose={() => setDialog(null)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Thanks for telling us</DialogTitle>
        <DialogContent>
          <DialogContentText>
            The admins will look at it within a day. You can also hide{" "}
            {household.name}, so nothing they share shows up for your household.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)}>Done</Button>
          <Button onClick={() => setDialog("hide")}>
            Hide {household.name}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={dialog === "hide"}
        onClose={() => setDialog(null)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Hide {household.name}?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Their shared recipes leave your library, and their reviews leave
            your recipe pages. They aren&apos;t told. You can show them again
            from your Household page.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="contained" disabled={busy} onClick={hide}>
            Hide them
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
