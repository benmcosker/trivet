"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";
import type { Destination } from "@/lib/mcp/destination";
import { MCP_SCOPES } from "@/lib/mcp/resource";
import { fonts } from "@/theme/theme";

import { PaperNote } from "./PaperNote";

/**
 * Approve or refuse an AI assistant. The signed request rides along in the
 * page's address, and `oauthProviderClient` adds it to the POST, so all this
 * sends is the answer and the scopes the person chose.
 */
export function ConsentForm({
  assistant,
  destination,
  impersonating,
  requested,
  canPlan,
}: {
  assistant: string;
  /** Where approving sends the person: the one fact Trivet can vouch for. */
  destination: Destination;
  /** Its name claims Claude, ChatGPT or Gemini, but it doesn't go there. */
  impersonating: boolean;
  requested: string[];
  canPlan: boolean;
}) {
  // Unticked: looking is the default, planning is something to opt into.
  const [allowPlanning, setAllowPlanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function answer(accept: boolean) {
    setBusy(true);
    setError(null);
    // Everything asked for except planning, unless the person allowed it.
    const scope = requested
      .filter((s) => s !== MCP_SCOPES.write || allowPlanning)
      .join(" ");
    const result = await authClient.$fetch<{
      redirect?: boolean;
      url?: string;
    }>("/oauth2/consent", { method: "POST", body: { accept, scope } });
    if (result.error || !result.data?.url) {
      setError("That didn't go through. Start again from your assistant.");
      setBusy(false);
      return;
    }
    window.location.href = result.data.url;
  }

  return (
    <Box sx={{ maxWidth: 560 }}>
      <Typography sx={{ fontFamily: fonts.serif, fontSize: 20, mb: 3 }}>
        {assistant} would like to use your Trivet.{" "}
        <Link href="/assistants" sx={{ fontSize: "0.85em" }}>
          How this works
        </Link>
      </Typography>

      <Typography sx={{ mt: -2, mb: 3 }} color="text.secondary">
        {destination.kind === "known" ? (
          <>
            Approving sends you back to <strong>{destination.assistant}</strong>
            , at {destination.host}.
          </>
        ) : destination.kind === "local" ? (
          <>Approving sends you back to an app on this computer.</>
        ) : destination.kind === "other" ? (
          <>
            Approving sends you back to <strong>{destination.host}</strong>.
          </>
        ) : null}
      </Typography>

      {impersonating ? (
        <Box sx={{ mb: 3 }}>
          <PaperNote label="Can't connect this">
            It calls itself {assistant}, but it doesn&apos;t send you back to{" "}
            {assistant}&apos;s own address. Anyone can give an assistant any
            name, so Trivet won&apos;t connect it. Connect {assistant} from its
            own settings instead.
          </PaperNote>
        </Box>
      ) : destination.kind === "other" ? (
        <Box sx={{ mb: 3 }}>
          <PaperNote label="Check this first">
            This isn&apos;t Claude, ChatGPT or Gemini. Only connect it if you
            set it up yourself and know {destination.host}: whoever runs it will
            see what you see in Trivet.
          </PaperNote>
        </Box>
      ) : null}

      <Stack spacing={1.5} sx={{ mb: 3 }}>
        <Typography>
          It will be able to <strong>see</strong> your household&apos;s recipes
          and the shared library, your week&apos;s plan, the shopping list and
          the pantry - what you see in Trivet, and nothing more.
        </Typography>
        {canPlan ? (
          <FormControlLabel
            control={
              <Checkbox
                checked={allowPlanning}
                onChange={(event) => setAllowPlanning(event.target.checked)}
              />
            }
            label="Also let it plan: put dinners on days, and add to the pantry and the list."
          />
        ) : null}
        <Typography color="text.secondary" variant="body2">
          It can never delete a recipe, change your household, save a recipe
          without your review, or text anyone. Whatever it plans shows in Trivet
          for you to undo, and you can disconnect it at any time from the
          Household page.
        </Typography>
      </Stack>

      {error ? (
        <Box sx={{ mb: 2 }}>
          <PaperNote label="Not connected" live>
            {error}
          </PaperNote>
        </Box>
      ) : null}

      <Stack direction="row" spacing={1.5}>
        {/* Nothing to approve when it is pretending to be someone else. */}
        {impersonating ? null : (
          <Button
            variant="contained"
            disabled={busy}
            onClick={() => answer(true)}
          >
            Connect
          </Button>
        )}
        <Button disabled={busy} onClick={() => answer(false)}>
          Cancel
        </Button>
      </Stack>
    </Box>
  );
}
