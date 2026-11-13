"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";
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
  assistantSite,
  requested,
  canPlan,
}: {
  assistant: string;
  assistantSite: string | null;
  requested: string[];
  canPlan: boolean;
}) {
  // Unticked: looking is the default, planning is something to opt into.
  const [allowPlanning, setAllowPlanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Whatever the assistant registered with, so it may not be a URL at all.
  const siteHost = hostOf(assistantSite);

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
        {assistant}
        {siteHost ? (
          <Typography component="span" color="text.secondary">
            {" "}
            ({siteHost})
          </Typography>
        ) : null}{" "}
        would like to use your Trivet.
      </Typography>

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
        <Button
          variant="contained"
          disabled={busy}
          onClick={() => answer(true)}
        >
          Connect
        </Button>
        <Button disabled={busy} onClick={() => answer(false)}>
          Cancel
        </Button>
      </Stack>
    </Box>
  );
}

function hostOf(site: string | null | undefined): string | null {
  if (!site) return null;
  try {
    const url = new URL(site);
    return url.protocol === "https:" ? url.host : null;
  } catch {
    return null;
  }
}
