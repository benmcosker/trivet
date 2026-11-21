import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import {
  TRIAL_DAYS,
  entitlementFor,
  getEntitlement,
  hasPaidFeatures,
  trialEndFrom,
} from "@/lib/entitlements";
import { createInvite, redeemInvite } from "@/lib/invites";

import { makeHousehold, resetDatabase } from "./support/db";

const now = new Date("2026-12-01T12:00:00Z");
const day = (n: number) => new Date(now.getTime() + n * 24 * 60 * 60 * 1000);

describe("entitlementFor", () => {
  it("is not paid with neither a trial nor a subscription", () => {
    expect(
      entitlementFor({ trialEndsAt: null, subscription: null }, now),
    ).toEqual({
      paid: false,
    });
  });

  it("is paid during the trial, and not after it", () => {
    expect(
      entitlementFor({ trialEndsAt: day(3), subscription: null }, now),
    ).toEqual({ paid: true, reason: "trial", until: day(3) });
    expect(
      entitlementFor({ trialEndsAt: day(-1), subscription: null }, now),
    ).toEqual({ paid: false });
  });

  it("is not paid at the exact moment the trial ends", () => {
    expect(
      entitlementFor({ trialEndsAt: now, subscription: null }, now),
    ).toEqual({
      paid: false,
    });
  });

  it("is paid while an active subscription's period has not run out", () => {
    const subscription = {
      status: "ACTIVE" as const,
      currentPeriodEnd: day(10),
    };
    expect(entitlementFor({ trialEndsAt: null, subscription }, now)).toEqual({
      paid: true,
      reason: "subscription",
      until: day(10),
    });
  });

  it("keeps a cancelled subscription working to the end of what was paid", () => {
    const subscription = {
      status: "CANCELED" as const,
      currentPeriodEnd: day(5),
    };
    expect(entitlementFor({ trialEndsAt: null, subscription }, now).paid).toBe(
      true,
    );
    const lapsed = { status: "CANCELED" as const, currentPeriodEnd: day(-1) };
    expect(
      entitlementFor({ trialEndsAt: null, subscription: lapsed }, now).paid,
    ).toBe(false);
  });

  it("gives an ended subscription no access, whatever its date says", () => {
    const subscription = {
      status: "ENDED" as const,
      currentPeriodEnd: day(300),
    };
    expect(entitlementFor({ trialEndsAt: null, subscription }, now).paid).toBe(
      false,
    );
  });

  it("falls back to the trial when the subscription has ended", () => {
    const subscription = {
      status: "ENDED" as const,
      currentPeriodEnd: day(300),
    };
    expect(entitlementFor({ trialEndsAt: day(4), subscription }, now)).toEqual({
      paid: true,
      reason: "trial",
      until: day(4),
    });
  });

  it("reports the later end when a trial and a subscription both apply", () => {
    const subscription = {
      status: "ACTIVE" as const,
      currentPeriodEnd: day(30),
    };
    expect(
      entitlementFor({ trialEndsAt: day(4), subscription }, now),
    ).toMatchObject({ reason: "subscription", until: day(30) });
    expect(
      entitlementFor({ trialEndsAt: day(40), subscription }, now),
    ).toMatchObject({ reason: "trial", until: day(40) });
  });
});

describe("trialEndFrom", () => {
  it("is TRIAL_DAYS after the start", () => {
    expect(trialEndFrom(now)).toEqual(day(TRIAL_DAYS));
  });
});

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("with a database", () => {
  beforeEach(resetDatabase);
  afterAll(async () => {
    await resetDatabase();
    await prisma.$disconnect();
  });

  const sub = (householdId: string, over: object = {}) => ({
    householdId,
    source: "WEB" as const,
    externalId: "sub_1",
    interval: "MONTH" as const,
    status: "ACTIVE" as const,
    currentPeriodEnd: day(10),
    ...over,
  });

  it("is not paid for a household with neither, nor for one that is gone", async () => {
    const { householdId } = await makeHousehold();
    expect(await hasPaidFeatures(householdId, now)).toBe(false);
    expect(await getEntitlement("no-such-household", now)).toEqual({
      paid: false,
    });
  });

  it("reads a stored subscription", async () => {
    const { householdId } = await makeHousehold();
    await prisma.subscription.create({ data: sub(householdId) });
    expect(await getEntitlement(householdId, now)).toEqual({
      paid: true,
      reason: "subscription",
      until: day(10),
    });
  });

  it("allows one subscription per household and one row per processor id", async () => {
    const a = await makeHousehold();
    const b = await makeHousehold();
    await prisma.subscription.create({ data: sub(a.householdId) });
    await expect(
      prisma.subscription.create({
        data: sub(a.householdId, { externalId: "sub_other" }),
      }),
    ).rejects.toThrow();
    await expect(
      prisma.subscription.create({ data: sub(b.householdId) }),
    ).rejects.toThrow();
  });

  it("deletes the subscription with its household", async () => {
    const { householdId } = await makeHousehold();
    await prisma.subscription.create({ data: sub(householdId) });
    await prisma.household.delete({ where: { id: householdId } });
    expect(await prisma.subscription.count()).toBe(0);
  });

  it("starts a free month for a household an outside invite creates, and not for one joined", async () => {
    const ours = await makeHousehold();
    const stranger = await prisma.user.create({
      data: {
        id: "stranger",
        name: "Dana",
        email: "stranger@example.com",
        emailVerified: true,
        updatedAt: new Date(),
      },
    });
    const outside = await createInvite({
      createdById: ours.userId,
      householdId: null,
    });
    const before = Date.now();
    expect(await redeemInvite(outside.code, stranger.id)).toBe(true);

    const placed = await prisma.user.findUnique({
      where: { id: stranger.id },
      select: { household: { select: { trialEndsAt: true } } },
    });
    const ends = placed?.household?.trialEndsAt?.getTime() ?? 0;
    expect(ends).toBeGreaterThanOrEqual(
      trialEndFrom(new Date(before)).getTime(),
    );
    expect(ends).toBeLessThanOrEqual(trialEndFrom(new Date()).getTime());

    // The household that already existed got nothing from this.
    const existing = await prisma.household.findUnique({
      where: { id: ours.householdId },
      select: { trialEndsAt: true },
    });
    expect(existing?.trialEndsAt).toBeNull();
  });
});
