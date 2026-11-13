import { prisma } from "../db";

/**
 * What connected assistants do, counted and recorded (MCP-PLAN.md, Safety).
 */

const DEFAULT_DAILY_CALLS = 1000;

/**
 * MCP requests one person's assistants may make in a UTC day.
 *
 * Generous: planning a week in conversation is a few dozen calls. It exists
 * for the assistant stuck in a loop, not for a person using it. A malformed
 * `MCP_DAILY_LIMIT` falls back rather than becoming NaN and letting every
 * comparison through.
 */
export function dailyAssistantLimit(): number {
  const raw = process.env.MCP_DAILY_LIMIT?.trim();
  const parsed = raw ? Number(raw) : NaN;
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : DEFAULT_DAILY_CALLS;
}

/**
 * Count one request against the person's day, answering whether it may go
 * ahead. Counted before the work, as card imports are, so a refused request
 * still counts and a loop cannot slip past by failing.
 */
export async function claimAssistantCall(
  userId: string,
  now: Date = new Date(),
): Promise<{ ok: true } | { ok: false; retryAfterSeconds: number }> {
  const day = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const row = await prisma.assistantQuota.upsert({
    where: { userId_day: { userId, day } },
    create: { userId, day, count: 1 },
    update: { count: { increment: 1 } },
  });
  if (row.count <= dailyAssistantLimit()) return { ok: true };

  const tomorrow = new Date(day.getTime() + 24 * 60 * 60 * 1000);
  return {
    ok: false,
    retryAfterSeconds: Math.max(
      1,
      Math.ceil((tomorrow.getTime() - now.getTime()) / 1000),
    ),
  };
}

/** Write down what an assistant changed, so "who planned this?" has an answer. */
export async function recordAssistantAction(input: {
  userId: string;
  clientId: string;
  tool: string;
  summary: string;
}): Promise<void> {
  await prisma.assistantAction.create({ data: input });
}

/** The person's latest assistant changes, newest first, for the Household page. */
export async function recentAssistantActions(userId: string, take = 5) {
  return prisma.assistantAction.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
    select: { clientId: true, summary: true, createdAt: true },
  });
}
