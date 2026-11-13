import Typography from "@mui/material/Typography";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/AppShell";
import { ConsentForm } from "@/components/ConsentForm";
import { prisma } from "@/lib/db";
import { MCP_SCOPES, PLANNING_OFFERED } from "@/lib/mcp/resource";
import { getCurrentUser } from "@/lib/session";

/**
 * Where a person approves an AI assistant (MCP-PLAN.md). Better Auth sends
 * them here mid-sign-in with the assistant's `client_id` and the `scope` it
 * asked for, signed so the request cannot be altered on the way.
 *
 * Looking is always part of the grant; planning is the person's choice, and
 * only offered when the assistant asked for it.
 */
export default async function ConsentPage({
  searchParams,
}: PageProps<"/consent">) {
  if (!(await getCurrentUser())) redirect("/sign-in");
  const params = await searchParams;
  const clientId = typeof params.client_id === "string" ? params.client_id : "";
  const scope = typeof params.scope === "string" ? params.scope : "";
  const requested = new Set(scope.split(" ").filter(Boolean));

  const client = clientId
    ? await prisma.oauthClient.findUnique({
        where: { clientId },
        select: { name: true, uri: true },
      })
    : null;

  return (
    <AppShell>
      <Typography variant="h1" sx={{ mb: 1 }}>
        Connect an assistant
      </Typography>
      <ConsentForm
        assistant={client?.name?.trim() || "An AI assistant"}
        assistantSite={client?.uri ?? null}
        requested={[...requested]}
        canPlan={PLANNING_OFFERED && requested.has(MCP_SCOPES.write)}
      />
    </AppShell>
  );
}
