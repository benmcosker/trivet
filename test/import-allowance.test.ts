import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { prisma } from "@/lib/db";
import {
  allowanceFor,
  allowanceMessage,
  claimImportAllowance,
  monthStart,
  nextMonthStart,
} from "@/lib/import-allowance";
import {
  FREE_IMPORTS_PER_MONTH,
  PAID_IMPORTS_PER_MONTH,
  TRIAL_IMPORTS_PER_MONTH,
} from "@/lib/pricing";

import { makeHousehold, resetDatabase } from "./support/db";

const day = (iso: string) => new Date(`${iso}T12:00:00Z`);

describe("what a household gets", () => {
  it("is the free number with neither a trial nor a subscription", () => {
    expect(allowanceFor({ paid: false })).toEqual({
      kind: "free",
      limit: FREE_IMPORTS_PER_MONTH,
    });
  });

  it("is the trial's number during the free month", () => {
    expect(
      allowanceFor({ paid: true, reason: "trial", until: day("2026-12-20") }),
    ).toEqual({ kind: "trial", limit: TRIAL_IMPORTS_PER_MONTH });
  });

  it("is the paid number on a subscription", () => {
    expect(
      allowanceFor({
        paid: true,
        reason: "subscription",
        until: day("2026-12-20"),
      }),
    ).toEqual({ kind: "paid", limit: PAID_IMPORTS_PER_MONTH });
  });
});

describe("the month", () => {
  it("starts on the 1st, UTC, and rolls over in December", () => {
    expect(monthStart(day("2026-11-21")).toISOString()).toBe(
      "2026-11-01T00:00:00.000Z",
    );
    expect(nextMonthStart(day("2026-11-21")).toISOString()).toBe(
      "2026-12-01T00:00:00.000Z",
    );
    expect(nextMonthStart(day("2026-12-31")).toISOString()).toBe(
      "2027-01-01T00:00:00.000Z",
    );
  });

  it("names the limit, and says typing a recipe still works", () => {
    expect(allowanceMessage("free", FREE_IMPORTS_PER_MONTH)).toContain(
      `${FREE_IMPORTS_PER_MONTH} recipes`,
    );
    expect(allowanceMessage("free", FREE_IMPORTS_PER_MONTH)).toContain(
      "free limit",
    );
    expect(allowanceMessage("paid", 20)).toContain("household plan");
    expect(allowanceMessage("trial", 20)).toContain("free month");
    expect(allowanceMessage("free", FREE_IMPORTS_PER_MONTH)).toContain(
      "typed in",
    );
  });
});

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("claiming", () => {
  beforeEach(resetDatabase);
  afterEach(() => vi.unstubAllEnvs());
  afterAll(async () => {
    await resetDatabase();
    await prisma.$disconnect();
  });

  const now = day("2026-12-10");

  it("does nothing, and touches nothing, until it is switched on", async () => {
    const { householdId } = await makeHousehold();
    for (let i = 0; i < 50; i++) {
      expect((await claimImportAllowance(householdId, now)).ok).toBe(true);
    }
    expect(await prisma.importCount.count()).toBe(0);
  });

  describe("switched on", () => {
    beforeEach(() => vi.stubEnv("IMPORT_ALLOWANCE", "on"));

    it("lets a free household read its few, then refuses with the time left", async () => {
      const { householdId } = await makeHousehold();
      for (let i = 1; i <= FREE_IMPORTS_PER_MONTH; i++) {
        expect(await claimImportAllowance(householdId, now)).toMatchObject({
          ok: true,
          used: i,
          kind: "free",
        });
      }
      const refused = await claimImportAllowance(householdId, now);
      expect(refused).toMatchObject({
        ok: false,
        kind: "free",
        limit: FREE_IMPORTS_PER_MONTH,
      });
      if (!refused.ok) {
        expect(refused.retryAfterSeconds).toBe(
          Math.ceil((nextMonthStart(now).getTime() - now.getTime()) / 1000),
        );
      }
    });

    it("does not count a refusal, so hammering cannot push it further", async () => {
      const { householdId } = await makeHousehold();
      for (let i = 0; i < FREE_IMPORTS_PER_MONTH + 5; i++) {
        await claimImportAllowance(householdId, now);
      }
      const row = await prisma.importCount.findFirstOrThrow({
        where: { householdId },
      });
      expect(row.count).toBe(FREE_IMPORTS_PER_MONTH);
    });

    it("starts over in the next month", async () => {
      const { householdId } = await makeHousehold();
      for (let i = 0; i < FREE_IMPORTS_PER_MONTH; i++) {
        await claimImportAllowance(householdId, now);
      }
      expect((await claimImportAllowance(householdId, now)).ok).toBe(false);
      expect(
        (await claimImportAllowance(householdId, day("2027-01-02"))).ok,
      ).toBe(true);
    });

    it("gives a household in its free month the trial's number", async () => {
      const { householdId } = await makeHousehold();
      await prisma.household.update({
        where: { id: householdId },
        data: { trialEndsAt: day("2026-12-25") },
      });
      for (let i = 1; i <= TRIAL_IMPORTS_PER_MONTH; i++) {
        expect((await claimImportAllowance(householdId, now)).ok).toBe(true);
      }
      expect(await claimImportAllowance(householdId, now)).toMatchObject({
        ok: false,
        kind: "trial",
      });
    });

    it("gives a subscribed household the paid number", async () => {
      const { householdId } = await makeHousehold();
      await prisma.subscription.create({
        data: {
          householdId,
          source: "WEB",
          externalId: "sub_1",
          interval: "MONTH",
          status: "ACTIVE",
          currentPeriodEnd: day("2026-12-30"),
        },
      });
      for (let i = 1; i <= PAID_IMPORTS_PER_MONTH; i++) {
        expect((await claimImportAllowance(householdId, now)).ok).toBe(true);
      }
      expect(await claimImportAllowance(householdId, now)).toMatchObject({
        ok: false,
        kind: "paid",
      });
    });

    it("counts each household on its own", async () => {
      const a = await makeHousehold();
      const b = await makeHousehold();
      for (let i = 0; i < FREE_IMPORTS_PER_MONTH; i++) {
        await claimImportAllowance(a.householdId, now);
      }
      expect((await claimImportAllowance(a.householdId, now)).ok).toBe(false);
      expect((await claimImportAllowance(b.householdId, now)).ok).toBe(true);
    });

    it("lets only the limit through when claims arrive together", async () => {
      const { householdId } = await makeHousehold();
      const results = await Promise.all(
        Array.from({ length: FREE_IMPORTS_PER_MONTH + 6 }, () =>
          claimImportAllowance(householdId, now),
        ),
      );
      expect(results.filter((r) => r.ok)).toHaveLength(FREE_IMPORTS_PER_MONTH);
    });
  });
});
