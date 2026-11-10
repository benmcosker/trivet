import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Pasted text read as a recipe. The model call and the allowance are stood
 * in for; what is under test is what reaches the model and what comes back.
 */
const mocks = vi.hoisted(() => ({
  extractRecipeFromText: vi.fn(),
  claimUploadSlot: vi.fn(),
  user: { id: "cook", householdId: "home" } as {
    id: string;
    householdId: string;
  } | null,
}));

vi.mock("@/lib/session", () => ({
  getCurrentHousehold: async () => mocks.user,
}));
vi.mock("@/lib/extract-recipe", async (original) => ({
  ...(await original<typeof import("@/lib/extract-recipe")>()),
  extractRecipeFromText: mocks.extractRecipeFromText,
}));
vi.mock("@/lib/duplicates", () => ({ findSimilarlyTitled: async () => [] }));
vi.mock("@/lib/upload-quota", () => ({
  claimUploadSlot: mocks.claimUploadSlot,
}));

const { POST } = await import("@/app/api/import-text/route");

const caption =
  "Crispy lemon chicken. 2 chicken breasts, 1 lemon, 1/2 cup flour. " +
  "Pound, dredge, fry 3 min a side. https://www.tiktok.com/@cook/video/1";

const post = (body: unknown) =>
  POST(
    new Request("https://trivetbox.com/api/import-text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

describe("POST /api/import-text", () => {
  beforeEach(() => {
    mocks.user = { id: "cook", householdId: "home" };
    mocks.claimUploadSlot.mockReset().mockResolvedValue({ ok: true });
    mocks.extractRecipeFromText.mockReset().mockResolvedValue({
      ok: true,
      recipe: { title: "Crispy Lemon Chicken" },
    });
  });

  it("reads the text, with its link, and answers as a text import", async () => {
    const response = await post({ text: caption });
    expect(response.status).toBe(200);
    expect(mocks.extractRecipeFromText).toHaveBeenCalledWith({
      text: caption,
      link: "https://www.tiktok.com/@cook/video/1",
      fromScreenshots: false,
    });
    const payload = await response.json();
    expect(payload).toMatchObject({
      source: "TEXT",
      imageUrl: null,
      recipe: { title: "Crispy Lemon Chicken" },
    });
  });

  it("tells the model when the words were read off screenshots", async () => {
    await post({ text: caption, origin: "screenshots" });
    expect(mocks.extractRecipeFromText).toHaveBeenCalledWith(
      expect.objectContaining({ fromScreenshots: true }),
    );
  });

  it("refuses a too-short paste before spending any allowance", async () => {
    const response = await post({ text: "lemon chicken" });
    expect(response.status).toBe(400);
    expect(mocks.claimUploadSlot).not.toHaveBeenCalled();
    expect(mocks.extractRecipeFromText).not.toHaveBeenCalled();
  });

  it("stops at the daily limit", async () => {
    mocks.claimUploadSlot.mockResolvedValue({
      ok: false,
      limit: 30,
      retryAfterSeconds: 60,
    });
    const response = await post({ text: caption });
    expect(response.status).toBe(429);
    expect(mocks.extractRecipeFromText).not.toHaveBeenCalled();
  });

  it("needs a signed-in household", async () => {
    mocks.user = null;
    expect((await post({ text: caption })).status).toBe(401);
  });
});
