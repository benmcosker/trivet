import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Permission to send imports to Anthropic (`ai-consent.ts`): the record
 * itself, and the one import route without a test file of its own refusing
 * before it fetches anything. The other two routes are covered in their own
 * files.
 */
const mocks = vi.hoisted(() => ({
  user: { id: "cook", householdId: "home" },
}));

vi.mock("@/lib/session", () => ({
  getCurrentHousehold: async () => mocks.user,
}));

const { prisma } = await import("@/lib/db");
const { aiConsentDate, hasAiConsent, recordAiConsent, withdrawAiConsent } =
  await import("@/lib/ai-consent");
const { POST: importUrl } = await import("@/app/api/import-url/route");
const { makeHousehold, resetDatabase } = await import("./support/db");

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("agreeing to AI reading", () => {
  let userId: string;

  beforeEach(async () => {
    await resetDatabase();
    ({ userId } = await makeHousehold());
    mocks.user = { id: userId, householdId: "home" };
  });

  afterAll(() => prisma.$disconnect());

  it("starts unagreed, for people who were here before it was asked", async () => {
    expect(await hasAiConsent(userId)).toBe(false);
    expect(await aiConsentDate(userId)).toBeNull();
  });

  it("keeps the first date when somebody agrees twice", async () => {
    const first = new Date("2026-11-20T09:00:00Z");
    await recordAiConsent(userId, first);
    await recordAiConsent(userId, new Date("2026-11-21T09:00:00Z"));
    expect(await aiConsentDate(userId)).toEqual(first);
  });

  it("asks again after it is taken back", async () => {
    await recordAiConsent(userId);
    await withdrawAiConsent(userId);
    expect(await hasAiConsent(userId)).toBe(false);
  });

  it("is one person's, not the household's", async () => {
    const other = await makeHousehold("Next door");
    await recordAiConsent(other.userId);
    expect(await hasAiConsent(userId)).toBe(false);
  });

  it("refuses a link before fetching the page", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const response = await importUrl(
      new Request("https://trivetbox.com/api/import-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://example.com/soup" }),
      }),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      code: "ai_consent_required",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
