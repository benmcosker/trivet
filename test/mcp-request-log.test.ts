import { afterAll, beforeEach, describe, expect, it } from "vitest";

const { prisma } = await import("@/lib/db");
const {
  describeExchange,
  recentMcpRequests,
  recordMcpExchange,
  requestLogEnabled,
  RETENTION_DAYS,
} = await import("@/lib/mcp/request-log");
const { makeHousehold, resetDatabase } = await import("./support/db");

/** The admin's temporary record of what assistants asked Trivet. */
describe("describeExchange", () => {
  const call = (id: number, name: string, args: unknown) => ({
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: { name, arguments: args },
  });

  it("records a tool call with its arguments and success", () => {
    const [row] = describeExchange(
      JSON.stringify(call(1, "search_recipes", { query: "grouper" })),
      200,
      JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [] } }),
    );
    expect(row).toEqual({
      method: "tools/call",
      tool: "search_recipes",
      arguments: '{"query":"grouper"}',
      status: 200,
      outcome: "ok",
      detail: null,
      result: null,
    });
  });

  it("keeps a few facts from a tool's answer, not the answer", () => {
    const answer = (text: unknown) =>
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        result: { content: [{ type: "text", text: JSON.stringify(text) }] },
      });
    const [search] = describeExchange(
      JSON.stringify(call(1, "search_recipes", { query: "chicken" })),
      200,
      answer({ total: 54, recipes: [{ title: "A long recipe" }] }),
    );
    expect(JSON.parse(search.result!)).toEqual({ total: 54 });
    const [planned] = describeExchange(
      JSON.stringify(call(1, "plan_dinner", { date: "2026-11-19" })),
      200,
      answer({
        ok: true,
        planned: "Cacio e Pepe",
        date: "2026-11-19",
        slot: "DINNER",
        replaced: null,
      }),
    );
    expect(JSON.parse(planned.result!)).toMatchObject({
      planned: "Cacio e Pepe",
    });
  });

  it("marks a tool's own error, with its message", () => {
    const [row] = describeExchange(
      JSON.stringify(call(2, "get_recipe", { id: "nope" })),
      200,
      JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        result: {
          isError: true,
          content: [{ type: "text", text: "No recipe with that id here." }],
        },
      }),
    );
    expect(row).toMatchObject({
      outcome: "error",
      detail: "No recipe with that id here.",
    });
  });

  it("splits a batch into one row per message, matched by id", () => {
    const rows = describeExchange(
      JSON.stringify([
        { jsonrpc: "2.0", id: 1, method: "tools/list" },
        call(2, "get_week", {}),
      ]),
      200,
      JSON.stringify([
        { jsonrpc: "2.0", id: 2, error: { message: "boom" } },
        { jsonrpc: "2.0", id: 1, result: { tools: [] } },
      ]),
    );
    expect(rows.map((r) => [r.method, r.tool, r.outcome])).toEqual([
      ["tools/list", null, "ok"],
      ["tools/call", "get_week", "error"],
    ]);
  });

  it("records a refusal as one row, with why", () => {
    const [row] = describeExchange(
      JSON.stringify(call(1, "get_pantry", {})),
      403,
      JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: { message: "This assistant is no longer connected to Trivet." },
      }),
    );
    expect(row).toMatchObject({
      method: "tools/call",
      tool: null,
      arguments: null,
      status: 403,
      outcome: "refused",
      detail: "This assistant is no longer connected to Trivet.",
    });
  });

  it("records a GET or DELETE as turned away by design, not a problem", () => {
    const [row] = describeExchange(
      "",
      405,
      JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: { message: "POST only" },
      }),
      "GET",
    );
    expect(row).toMatchObject({
      method: "HTTP GET",
      status: 405,
      outcome: "ok",
      detail: "POST only",
    });
  });

  it("shortens very long arguments", () => {
    const [row] = describeExchange(
      JSON.stringify(call(1, "search_recipes", { query: "x".repeat(5000) })),
      200,
      "",
    );
    expect(row.arguments!.length).toBeLessThanOrEqual(2001);
  });

  it("can be switched off", () => {
    expect(requestLogEnabled({})).toBe(true);
    expect(requestLogEnabled({ MCP_REQUEST_LOG: "off" })).toBe(false);
  });
});

describe("recordMcpExchange", () => {
  beforeEach(resetDatabase);
  afterAll(async () => {
    await resetDatabase();
    await prisma.$disconnect();
  });

  it("keeps the person, and lets go of entries past retention", async () => {
    const { userId } = await makeHousehold("Ours");
    await prisma.mcpRequestLog.create({
      data: {
        method: "tools/call",
        status: 200,
        outcome: "ok",
        durationMs: 5,
        createdAt: new Date(
          Date.now() - (RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000,
        ),
      },
    });

    await recordMcpExchange({
      requestBody: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "get_pantry", arguments: {} },
      }),
      status: 200,
      responseBody: JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} }),
      durationMs: 12,
      userId,
      clientId: "claude",
    });

    const rows = await recentMcpRequests();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tool: "get_pantry",
      durationMs: 12,
      assistant: "Removed",
      user: { name: "Cook", household: { name: "Ours" } },
    });
  });

  it("goes with the person when their account is deleted", async () => {
    const { userId } = await makeHousehold("Ours");
    await recordMcpExchange({
      requestBody: "",
      status: 401,
      responseBody: "",
      durationMs: 1,
      userId,
      clientId: null,
    });
    await prisma.user.delete({ where: { id: userId } });
    expect(await prisma.mcpRequestLog.count()).toBe(0);
  });
});
