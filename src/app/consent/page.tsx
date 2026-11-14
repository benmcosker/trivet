import Typography from "@mui/material/Typography";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/AppShell";
import { ConsentForm } from "@/components/ConsentForm";
import { prisma } from "@/lib/db";
import { PaperNote } from "@/components/PaperNote";
import { destinationOf, looksLikeImpersonation } from "@/lib/mcp/destination";
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
        select: { name: true },
      })
    : null;
  const assistant = client?.name?.trim() || "An AI assistant";
  // Where the code goes, not where the registrant says it lives: see
  // `destination.ts`.
  const destination = destinationOf(
    typeof params.redirect_uri === "string" ? params.redirect_uri : undefined,
  );

  return (
    <AppShell>
      <Typography variant="h1" sx={{ mb: 1 }}>
        Connect an assistant
      </Typography>
      {destination.kind === "missing" ? (
        <PaperNote label="Can't connect">
          This request doesn&apos;t say which assistant it&apos;s for or where
          to go back to. Start again from your assistant&apos;s settings.
        </PaperNote>
      ) : (
        <ConsentForm
          assistant={assistant}
          destination={destination}
          impersonating={looksLikeImpersonation(assistant, destination)}
          requested={[...requested]}
          canPlan={PLANNING_OFFERED && requested.has(MCP_SCOPES.write)}
        />
      )}
    </AppShell>
  );
}
