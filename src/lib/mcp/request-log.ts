import { prisma } from "../db";

/**
 * An admin-only record of what assistants ask Trivet (/admin/assistants).
 *
 * Temporary, while assistants are new: kept RETENTION_DAYS, off with
 * MCP_REQUEST_LOG=off, and removable as a unit (this file, its table, the
 * lines in the MCP route and the admin page).
 *
 * What a person typed to their assistant never reaches Trivet. What arrives
 * is the tool calls the assistant chose to make, `search_recipes` with
 * `{"query":"grouper"}`, and that is what is kept: one row per JSON-RPC
 * message, matched to its answer by id so each row says whether it worked.
 */

export const RETENTION_DAYS = 14;
const MAX_TEXT = 2000;

export function requestLogEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.MCP_REQUEST_LOG?.trim().toLowerCase() !== "off";
}

type Message = {
  id?: string | number | null;
  method?: string;
  params?: { name?: unknown; arguments?: unknown };
};

type Answer = {
  id?: string | number | null;
  error?: { message?: unknown };
  result?: { isError?: unknown; content?: { text?: unknown }[] };
};

const shorten = (text: string) =>
  text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…` : text;

function asList<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  return value && typeof value === "object" ? [value as T] : [];
}

function parse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export type LoggedRequest = {
  method: string;
  tool: string | null;
  arguments: string | null;
  status: number;
  outcome: "ok" | "error" | "refused";
  detail: string | null;
  /** A few facts from a successful tool's answer, as JSON. */
  result: string | null;
};

/**
 * The facts worth keeping from a tool's answer, so the admin page can say
 * "54 found" or "Opened Zuni Chicken" without keeping the answer itself.
 */
export function resultFacts(
  tool: string | null,
  text: unknown,
): Record<string, unknown> | null {
  if (!tool || typeof text !== "string") return null;
  const answer = parse(text) as Record<string, unknown> | null;
  if (!answer || typeof answer !== "object") return null;
  const count = (key: string) =>
    Array.isArray(answer[key]) ? (answer[key] as unknown[]).length : undefined;
  switch (tool) {
    case "search_recipes":
      return { total: answer.total ?? count("recipes") };
    case "get_recipe":
      return { title: answer.title };
    case "get_week":
      return { weekStarting: answer.weekStarting };
    case "get_shopping_list":
      return { items: count("items"), weekStarting: answer.weekStarting };
    case "get_pantry":
      return { items: count("pantry") };
    case "suggest_dinners":
      return {
        suggested: Array.isArray(answer.suggestions)
          ? (answer.suggestions as { recipe?: unknown }[]).filter(
              (s) => s.recipe,
            ).length
          : undefined,
      };
    case "plan_dinner":
      return answer.cleared
        ? { removed: answer.removed }
        : {
            planned: answer.planned,
            date: answer.date,
            slot: answer.slot,
            replaced: answer.replaced,
          };
    case "add_pantry_item":
      return { added: answer.pantryItem };
    case "add_to_list":
      return { added: answer.added };
    default:
      return null;
  }
}

/**
 * What one HTTP exchange amounts to, one entry per message in it. Pure, so
 * it can be tested without a server.
 */
export function describeExchange(
  requestBody: string,
  status: number,
  responseBody: string,
): LoggedRequest[] {
  const messages = asList<Message>(parse(requestBody));
  const answers = asList<Answer>(parse(responseBody));
  const answerFor = (id: Message["id"]) =>
    id == null ? undefined : answers.find((a) => a.id === id);

  // Refused before the server looked at the body: one row for the request.
  if (status >= 400 || messages.length === 0) {
    const refusal = answers[0]?.error?.message;
    return [
      {
        method: messages[0]?.method ?? "(none)",
        tool: null,
        arguments: null,
        status,
        outcome: status >= 400 ? "refused" : "ok",
        detail: typeof refusal === "string" ? shorten(refusal) : null,
        result: null,
      },
    ];
  }

  return messages.map((message) => {
    const isCall = message.method === "tools/call";
    const answer = answerFor(message.id);
    const toolError = answer?.result?.isError === true;
    const errorText =
      typeof answer?.error?.message === "string"
        ? answer.error.message
        : toolError && typeof answer?.result?.content?.[0]?.text === "string"
          ? answer.result.content[0].text
          : null;
    const tool =
      isCall && typeof message.params?.name === "string"
        ? message.params.name
        : null;
    const facts =
      answer && !answer.error && !toolError
        ? resultFacts(tool, answer.result?.content?.[0]?.text)
        : null;
    return {
      method: message.method ?? "(none)",
      tool,
      arguments:
        isCall && message.params?.arguments !== undefined
          ? shorten(JSON.stringify(message.params.arguments))
          : null,
      status,
      outcome: answer?.error || toolError ? "error" : "ok",
      detail: errorText ? shorten(errorText) : null,
      result: facts ? shorten(JSON.stringify(facts)) : null,
    };
  });
}

/** Write an exchange down, and let go of anything past retention. */
export async function recordMcpExchange(input: {
  requestBody: string;
  status: number;
  responseBody: string;
  durationMs: number;
  userId: string | null;
  clientId: string | null;
}): Promise<void> {
  const rows = describeExchange(
    input.requestBody,
    input.status,
    input.responseBody,
  ).map((row) => ({
    ...row,
    durationMs: input.durationMs,
    userId: input.userId,
    clientId: input.clientId,
  }));
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.$transaction([
    prisma.mcpRequestLog.createMany({ data: rows }),
    prisma.mcpRequestLog.deleteMany({ where: { createdAt: { lt: cutoff } } }),
  ]);
}

/** The newest entries, with who and which assistant, for the admin page. */
export async function recentMcpRequests(take = 300) {
  const rows = await prisma.mcpRequestLog.findMany({
    orderBy: { createdAt: "desc" },
    take,
    include: {
      user: {
        select: { name: true, household: { select: { name: true } } },
      },
    },
  });
  const clientIds = [
    ...new Set(rows.flatMap((r) => (r.clientId ? [r.clientId] : []))),
  ];
  const clients = await prisma.oauthClient.findMany({
    where: { clientId: { in: clientIds } },
    select: { clientId: true, name: true },
  });
  const nameOf = new Map(clients.map((c) => [c.clientId, c.name]));
  return rows.map((row) => ({
    ...row,
    assistant: row.clientId ? (nameOf.get(row.clientId) ?? "Removed") : null,
  }));
}
