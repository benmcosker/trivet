import { requireMcpAuth } from "@better-auth/mcp";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { after } from "next/server";

import { auth } from "@/lib/auth";
import { assistantAccess } from "@/lib/mcp/access";
import { claimAssistantCall } from "@/lib/mcp/activity";
import { recordMcpExchange, requestLogEnabled } from "@/lib/mcp/request-log";
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

/** Who each request turned out to be, for the request log. */
const identified = new WeakMap<Request, { userId: string; clientId: string }>();

const protectedHandler = requireMcpAuth(
  auth,
  async (request, claims) => {
    const access = await assistantAccess(claims);
    if (access) identified.set(request, access);
    if (!access) {
      // Disconnected on the Household page, or the person left their
      // household. The token still verifies, so say why rather than 401,
      // which would only send the assistant round the sign-in again.
      return refused(
        403,
        "This assistant is no longer connected to Trivet. Reconnect it from the assistant's settings.",
      );
    }

    // A daily allowance per person, so a runaway assistant loop cannot
    // hammer the database (MCP-PLAN.md, Safety).
    const allowance = await claimAssistantCall(access.userId);
    if (!allowance.ok) {
      const response = refused(
        429,
        "Trivet has had a lot of requests from your assistants today. Try again tomorrow.",
      );
      response.headers.set("retry-after", String(allowance.retryAfterSeconds));
      return response;
    }

    // Planning only if the person allowed it on the consent screen, which
    // the token's scopes record.
    const scopes =
      typeof claims.scope === "string" ? claims.scope.split(" ") : [];
    const server = trivetMcpServer({
      householdId: access.householdId,
      userId: access.userId,
      clientId: access.clientId,
      canPlan: scopes.includes(MCP_SCOPES.write),
    });
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
  {
    // The token must be bound to this endpoint, not to the sign-in server it
    // came from (the default).
    resource: mcpResource(),
    requiredScopes: [MCP_SCOPES.read],
    // What the first 401 tells an assistant to ask for. Both, so the
    // consent screen can offer planning: ChatGPT asks for exactly what this
    // names, and with read alone the person was never given the choice.
    // Asking is not granting: planning stays an unticked box on /consent.
    challengeScopes: [MCP_SCOPES.read, MCP_SCOPES.write],
  },
);

/**
 * Every request, written to the admin's request log once it has been
 * answered (`request-log.ts`; temporary). `after` runs once the response is
 * sent, so logging never slows an answer and a logging failure never breaks
 * one.
 */
/**
 * GET (a standing stream of server messages) and DELETE (ending a session)
 * have nothing to do on a stateless server that answers each POST in full.
 * The MCP spec's answer for that is 405, which assistants treat as "not
 * offered" and carry on; passed to the transport instead, they came back
 * 400 and showed up as problems in the request log.
 */
function notOffered(): Response {
  return Response.json(
    {
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message:
          "Trivet answers each request over POST and keeps no stream or session open.",
      },
      id: null,
    },
    { status: 405, headers: { allow: "POST" } },
  );
}

async function answer(request: Request): Promise<Response> {
  return request.method === "POST" ? protectedHandler(request) : notOffered();
}

async function handler(request: Request): Promise<Response> {
  if (!requestLogEnabled()) return answer(request);

  const started = Date.now();
  const requestBody =
    request.method === "POST" ? await request.clone().text() : "";
  const response = await answer(request);
  const copy = response.clone();

  after(async () => {
    try {
      const who = identified.get(request);
      await recordMcpExchange({
        httpMethod: request.method,
        requestBody,
        status: response.status,
        responseBody: await copy.text(),
        durationMs: Date.now() - started,
        userId: who?.userId ?? null,
        clientId: who?.clientId ?? null,
      });
    } catch (error) {
      console.error("[mcp] could not log a request", error);
    }
  });
  return response;
}

export { handler as GET, handler as POST, handler as DELETE };
