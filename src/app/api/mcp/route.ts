import { requireMcpAuth } from "@better-auth/mcp";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { auth } from "@/lib/auth";
import { assistantAccess } from "@/lib/mcp/access";
import { MCP_SCOPES, mcpResource } from "@/lib/mcp/resource";
import { trivetMcpServer } from "@/lib/mcp/server";

/**
 * Trivet's MCP endpoint, https://trivetbox.com/api/mcp (MCP-PLAN.md).
 *
 * Streamable HTTP, stateless: each request builds a server for the person the
 * access token belongs to, answers, and is done, so it runs on Vercel's
 * functions with nothing to keep between calls. A request with no token, or
 * an expired one, gets the 401 that starts the assistant's sign-in.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function refused(status: number, message: string): Response {
  return Response.json(
    { jsonrpc: "2.0", error: { code: -32001, message }, id: null },
    { status },
  );
}

const handler = requireMcpAuth(
  auth,
  async (request, claims) => {
    const access = await assistantAccess(claims);
    if (!access) {
      // Disconnected on the Household page, or the person left their
      // household. The token still verifies, so say why rather than 401,
      // which would only send the assistant round the sign-in again.
      return refused(
        403,
        "This assistant is no longer connected to Trivet. Reconnect it from the assistant's settings.",
      );
    }

    const server = trivetMcpServer({ householdId: access.householdId });
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    try {
      return await transport.handleRequest(request);
    } finally {
      void server.close();
    }
  },
  // The token must be bound to this endpoint, not to the sign-in server it
  // came from (the default).
  { resource: mcpResource(), requiredScopes: [MCP_SCOPES.read] },
);

export { handler as GET, handler as POST, handler as DELETE };
