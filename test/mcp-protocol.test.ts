import { describe, expect, it } from "vitest";

/**
 * Both MCP protocol eras, over HTTP, through the same handler the route uses.
 *
 * Claude moved to the 2026-07-28 revision, where every request carries its
 * own envelope; ChatGPT and Gemini still speak the 2025 revisions with an
 * `initialize` handshake. The old transport knew only the 2025 ones and
 * answered every 2026 request "Unsupported protocol version" (400), so these
 * drive a real client of each era at `createMcpHandler(trivetMcpServer)` and
 * check which version actually went over the wire.
 *
 * Listing tools and prompts needs no database: the server is built for a
 * person, but nothing is read until a tool is called.
 */
const { createMcpHandler } = await import("@modelcontextprotocol/server");
const { Client, StreamableHTTPClientTransport } =
  await import("@modelcontextprotocol/client");
const { Client: LegacyClient } =
  await import("@modelcontextprotocol/sdk/client/index.js");
const { StreamableHTTPClientTransport: LegacyTransport } =
  await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
const { trivetMcpServer } = await import("@/lib/mcp/server");

const URL_ = new URL("https://trivet.test/api/mcp");

/** The route's handler, minus sign-in, with every protocol version it saw. */
function endpoint(canPlan: boolean) {
  const seen: string[] = [];
  const mcp = createMcpHandler(() =>
    trivetMcpServer({
      householdId: "h",
      userId: "u",
      clientId: "c",
      canPlan,
    }),
  );
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init);
    const version = request.headers.get("mcp-protocol-version");
    if (version) seen.push(version);
    // Each request also names it in the body: the handshake's params, or the
    // 2026 envelope's _meta.
    if (request.method === "POST") {
      const body = await request.clone().text();
      for (const match of body.matchAll(/"protocolVersion":"([\d-]+)"/g)) {
        seen.push(match[1]);
      }
    }
    return mcp.fetch(request);
  };
  return { fetch, seen };
}

describe("the MCP endpoint speaks both protocol eras", () => {
  it("answers a 2026-07-28 client, as Claude now is", async () => {
    const { fetch, seen } = endpoint(false);
    // Pinned, so there is no falling back to the 2025 handshake: either the
    // 2026 revision is served or this fails.
    const client = new Client(
      { name: "modern", version: "0" },
      { versionNegotiation: { mode: { pin: "2026-07-28" } } },
    );
    await client.connect(new StreamableHTTPClientTransport(URL_, { fetch }));

    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toContain("search_recipes");
    expect(tools.map((t) => t.name)).not.toContain("plan_dinner");
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name)).toContain("plan_my_week");

    expect(seen).toContain("2026-07-28");
    await client.close();
  });

  it("still answers a 2025 client, as ChatGPT and Gemini are", async () => {
    const { fetch, seen } = endpoint(true);
    const client = new LegacyClient({ name: "legacy", version: "0" });
    await client.connect(new LegacyTransport(URL_, { fetch }));

    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toContain("plan_dinner");

    expect(seen).toContain("2025-11-25");
    expect(seen).not.toContain("2026-07-28");
    await client.close();
  });
});
