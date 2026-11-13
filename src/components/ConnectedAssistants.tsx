"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { disconnectAssistantAction } from "@/app/household/assistant-actions";

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

/**
 * The AI assistants this person has connected to Trivet (MCP-PLAN.md), each
 * with a Disconnect that takes effect on its next request. Only drawn when
 * there is one, like Hidden households: nobody needs to read about a feature
 * they have not used.
 */
export function ConnectedAssistants({
  assistants,
}: {
  assistants: ConnectedAssistant[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (assistants.length === 0) return null;

  return (
    <Card>
      <CardContent>
        <Typography variant="h2" sx={{ mb: 0.5 }}>
          Connected assistants
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          They can see what you see in Trivet, and plan if you allowed it.
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
      </CardContent>
    </Card>
  );
}
