import { prisma } from "./db";

/**
 * Whether a household may use the paid features, in one place.
 *
 * Nothing else may look at `Subscription` or `Household.trialEndsAt` to decide
 * this. It is the same rule as `recipe-visibility.ts`: a second copy of the
 * logic is how one feature ends up gated by the old rule after the price,
 * the processor or the trial length changes. A feature asks `hasPaidFeatures`
 * and does not learn why the answer is yes.
 *
 * Paid features are new imports past the free allowance, shopping lists by
 * text, and sharing with other households. The free tier - library, planner,
 * shopping list, connecting an assistant - never asks.
 */

/** A new household's free month. Set once, when the household is created. */
export const TRIAL_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** When a household created at `from` stops having the free month. */
export function trialEndFrom(from: Date): Date {
  return new Date(from.getTime() + TRIAL_DAYS * DAY_MS);
}

export type PaidFeaturesInput = {
  trialEndsAt: Date | null;
  subscription: {
    status: "ACTIVE" | "CANCELED" | "ENDED";
    currentPeriodEnd: Date;
  } | null;
};

export type Entitlement =
  | { paid: true; reason: "subscription" | "trial"; until: Date }
  | { paid: false };

/**
 * The rule, with no database in it so every case can be tested directly.
 *
 * A cancelled subscription keeps working to the end of the period that was
 * paid for, which is what the terms promise; an ended one - refunded or
 * charged back - does not, whatever date it carries. When both a trial and a
 * subscription apply, the later end is the one reported.
 */
export function entitlementFor(
  household: PaidFeaturesInput,
  now: Date,
): Entitlement {
  const sub = household.subscription;
  const subscribedUntil =
    sub && sub.status !== "ENDED" && sub.currentPeriodEnd > now
      ? sub.currentPeriodEnd
      : null;
  const trialUntil =
    household.trialEndsAt && household.trialEndsAt > now
      ? household.trialEndsAt
      : null;

  if (subscribedUntil && (!trialUntil || subscribedUntil >= trialUntil)) {
    return { paid: true, reason: "subscription", until: subscribedUntil };
  }
  if (trialUntil) return { paid: true, reason: "trial", until: trialUntil };
  return { paid: false };
}

export async function getEntitlement(
  householdId: string,
  now: Date = new Date(),
): Promise<Entitlement> {
  const household = await prisma.household.findUnique({
    where: { id: householdId },
    select: {
      trialEndsAt: true,
      subscription: { select: { status: true, currentPeriodEnd: true } },
    },
  });
  if (!household) return { paid: false };
  return entitlementFor(household, now);
}

export async function hasPaidFeatures(
  householdId: string,
  now: Date = new Date(),
): Promise<boolean> {
  return (await getEntitlement(householdId, now)).paid;
}
