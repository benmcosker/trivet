"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Divider from "@mui/material/Divider";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { disconnectAssistantAction } from "@/app/household/assistant-actions";
import { fonts } from "@/theme/theme";

import { CopyAddress } from "./CopyAddress";

export type ConnectedAssistant = {
  clientId: string;
  name: string;
  /** Already worded, on the server, so the page and its hydration agree. */
  connected: string;
  lastActive: string;
  canPlan: boolean;
  /** The latest thing it changed, in words, or null if it has only looked. */
  lastChange: string | null;
};

const linkSx = {
  fontFamily: fonts.sans,
  fontSize: "0.75rem",
  fontWeight: 700,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  textDecoration: "none",
  py: 1.5,
} as const;

/**
 * The AI assistants this person has connected to Trivet (MCP-PLAN.md), each
 * with a Disconnect that takes effect on its next request.
 *
 * Always drawn, unlike Hidden households: this is where people find out the
 * feature exists. With nothing connected it invites a connection, with the
 * address to paste and a link to the help page; drawn on the assistants
 * board (https://claude.ai/artifact/GroZmtNXWFLMiFvP7jNn6b).
 */
export function ConnectedAssistants({
  assistants,
  address,
}: {
  assistants: ConnectedAssistant[];
  /** Trivet's MCP address, `/api/mcp` on this site. */
  address: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (assistants.length === 0) {
    return (
      <Card>
        <CardContent>
          <Typography variant="h2" sx={{ mb: 0.5 }}>
            Connected assistants
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Ask Claude, or another AI assistant, about your recipes and your
            week. Connect it once, with this address.
          </Typography>
          <CopyAddress address={address} stacked>
            <Link href="/assistants" sx={linkSx}>
              How to connect
            </Link>
          </CopyAddress>
          <Typography variant="body2" color="text.muted" sx={{ mt: 2 }}>
            It sees what you see, and plans only if you let it. Nothing is
            connected yet.
          </Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <Typography variant="h2" sx={{ mb: 0.5 }}>
          Connected assistants
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          They see what you see in Trivet, and plan if you allowed it.
          Disconnecting one stops it at once.
        </Typography>
        <Stack divider={<Divider />}>
          {assistants.map((assistant) => (
            <Box
              key={assistant.clientId}
              sx={{
                py: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 2,
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ overflowWrap: "anywhere" }}>
                  {assistant.name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {assistant.canPlan ? "Can see and plan" : "Can see"} ·
                  connected {assistant.connected} · last active{" "}
                  {assistant.lastActive}
                </Typography>
                {assistant.lastChange ? (
                  <Typography variant="body2" color="text.secondary">
                    Latest: {assistant.lastChange}
                  </Typography>
                ) : null}
              </Box>
              <Button
                size="small"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await disconnectAssistantAction(assistant.clientId);
                    router.refresh();
                  })
                }
              >
                Disconnect
              </Button>
            </Box>
          ))}
        </Stack>
        <Link href="/assistants" sx={{ ...linkSx, display: "inline-block" }}>
          Connect another
        </Link>
      </CardContent>
    </Card>
  );
}
