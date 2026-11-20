"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import MuiLink from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import { useState, useTransition, type ReactNode } from "react";

import { agreeToAiAction } from "@/app/upload/ai-consent-actions";

import { PaperNote } from "./PaperNote";

/**
 * Asks, once, before anything is sent to Anthropic (`ai-consent.ts`).
 *
 * It stands in front of the whole upload card rather than inside it, so a
 * link or a share that arrived with the page waits here: the workflow, and
 * the effects that read what was shared on arrival, only mount once the
 * person has said yes. Saying no is just leaving; typing a recipe in needs
 * no agreement, so that is the other way out.
 */
export function AiConsentGate({
  agreed: agreedAtLoad,
  waiting,
  children,
}: {
  agreed: boolean;
  /** Something was shared to Trivet and will be read once they agree. */
  waiting: boolean;
  children: ReactNode;
}) {
  const [agreed, setAgreed] = useState(agreedAtLoad);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (agreed) return <>{children}</>;

  function agree() {
    setError(null);
    startTransition(async () => {
      try {
        await agreeToAiAction();
        setAgreed(true);
      } catch {
        setError("That didn't save. Check your connection and try again.");
      }
    });
  }

  return (
    <Stack spacing={2}>
      {waiting ? (
        <PaperNote label="Shared to Trivet">
          Waiting until you agree, then read straight away.
        </PaperNote>
      ) : null}
      {error ? (
        <PaperNote label="Not saved" live>
          {error}
        </PaperNote>
      ) : null}

      <Card>
        <CardContent>
          <Typography variant="h2" sx={{ mb: 1 }}>
            Before Trivet reads a recipe for you
          </Typography>
          <Stack spacing={1.5} sx={{ mb: 3, maxWidth: "62ch" }}>
            <Typography>
              Trivet reads recipes with Claude, an AI model made by Anthropic.
              Whatever you add here (a photo, a PDF, a web page or text you
              paste) is sent to Anthropic to be read, and the recipe comes back
              for you to check before it is saved.
            </Typography>
            <Typography>
              Your name, email address and the rest of your account are not
              sent. Anthropic does not use what it reads to train its models.
            </Typography>
            <Typography color="text.secondary">
              You can change your mind on the Household page.{" "}
              <MuiLink component={Link} href="/privacy#ai">
                Read how your recipes are handled
              </MuiLink>
              .
            </Typography>
          </Stack>
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 2,
            }}
          >
            <Button variant="contained" onClick={agree} disabled={pending}>
              {pending ? "Saving…" : "Agree and continue"}
            </Button>
            <Button component={Link} href="/recipes/new" disabled={pending}>
              Type a recipe in instead
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Stack>
  );
}
