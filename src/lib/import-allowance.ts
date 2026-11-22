import { prisma } from "./db";
import { entitlementFor, type Entitlement } from "./entitlements";
import {
  FREE_IMPORTS_PER_MONTH,
  PAID_IMPORTS_PER_MONTH,
  TRIAL_IMPORTS_PER_MONTH,
} from "./pricing";

/**
 * The monthly allowance of recipes a household may have read.
 *
 * Reading a recipe is the one thing Trivet does that costs money every time,
 * so how many a household gets is what the paid plan is mostly for. This is
 * the product limit; `upload-quota.ts` is the separate, much looser daily
 * ceiling against a runaway loop, and both apply.
 *
 * Off until `IMPORT_ALLOWANCE=on` in the deployment, because turning it on
 * with no trial dates set would cap every existing household at the free
 * number at once. Households that existed before the paid plan have no
 * `trialEndsAt`; give them one first (see `PRICING.md`).
 */

export type AllowanceKind = "free" | "trial" | "paid";

export function allowanceEnforced(): boolean {
  return process.env.IMPORT_ALLOWANCE?.trim() === "on";
}

/** How many this household gets this month, and why that number. */
export function allowanceFor(entitlement: Entitlement): {
  kind: AllowanceKind;
  limit: number;
} {
  if (!entitlement.paid) return { kind: "free", limit: FREE_IMPORTS_PER_MONTH };
  if (entitlement.reason === "subscription") {
    return { kind: "paid", limit: PAID_IMPORTS_PER_MONTH };
  }
  return { kind: "trial", limit: TRIAL_IMPORTS_PER_MONTH };
}

/** First day of the month a moment falls in, UTC. */
export function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** First day of the following month, UTC: when the count starts over. */
export function nextMonthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

export type AllowanceClaim =
  | { ok: true; used: number; limit: number; kind: AllowanceKind }
  | {
      ok: false;
      limit: number;
      kind: AllowanceKind;
      retryAfterSeconds: number;
    };

/**
 * Take one off the household's month, or say it is spent.
 *
 * The check and the increment are one statement, so two reads arriving
 * together cannot both squeeze under the limit, and a refused attempt leaves
 * the count where it was: this measures what was granted. The cost is that a
 * read which then fails is still counted, which is the safe direction.
 */
export async function claimImportAllowance(
  householdId: string,
  now: Date = new Date(),
): Promise<AllowanceClaim> {
  if (!allowanceEnforced()) {
    return { ok: true, used: 0, limit: Number.POSITIVE_INFINITY, kind: "paid" };
  }

  const household = await prisma.household.findUnique({
    where: { id: householdId },
    select: {
      trialEndsAt: true,
      subscription: { select: { status: true, currentPeriodEnd: true } },
    },
  });
  const { kind, limit } = allowanceFor(
    household ? entitlementFor(household, now) : { paid: false },
  );

  const month = monthStart(now);
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO import_count ("householdId", "month", "count")
    VALUES (${householdId}, ${month}::date, 1)
    ON CONFLICT ("householdId", "month")
    DO UPDATE SET "count" = import_count."count" + 1
    WHERE import_count."count" < ${limit}
    RETURNING "count"`;

  if (rows.length === 0) {
    return {
      ok: false,
      limit,
      kind,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((nextMonthStart(now).getTime() - now.getTime()) / 1000),
      ),
    };
  }
  return { ok: true, used: rows[0].count, limit, kind };
}

/** What to tell somebody whose month is spent. */
export function allowanceMessage(kind: AllowanceKind, limit: number): string {
  const which =
    kind === "paid"
      ? "the limit on the household plan"
      : kind === "trial"
        ? "the limit during the free month"
        : "the free limit";
  return (
    `That is ${limit} recipes read this month, which is ${which}. ` +
    `It starts over on the 1st; recipes can still be typed in.`
  );
}
