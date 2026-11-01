import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Several photos uploaded as one recipe. Everything slow or billable is
 * stood in for; what is under test is that the photos are checked one by
 * one, read in one call, in order, and that a set already saved is
 * recognised as a set.
 */
const mocks = vi.hoisted(() => ({
  extractRecipeFromImages: vi.fn(),
  findRecipeBySourceHash: vi.fn(),
  claimUploadSlot: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  getCurrentHousehold: async () => ({ id: "cook", householdId: "home" }),
}));
vi.mock("@/lib/extract-recipe", async (original) => ({
  ...(await original<typeof import("@/lib/extract-recipe")>()),
  extractRecipeFromImages: mocks.extractRecipeFromImages,
}));
vi.mock("@/lib/duplicates", async (original) => ({
  ...(await original<typeof import("@/lib/duplicates")>()),
  findRecipeBySourceHash: mocks.findRecipeBySourceHash,
  findSimilarlyTitled: async () => [],
}));
vi.mock("@/lib/upload-quota", () => ({
  claimUploadSlot: mocks.claimUploadSlot,
}));
vi.mock("@/lib/storage", () => ({
  storeFile: async (_bytes: Uint8Array, name: string) => ({
    url: `https://blob.example/${name}`,
  }),
}));

const { POST } = await import("@/app/api/upload/route");

const JPEG = readFileSync(join(__dirname, "fixtures/photo.jpg"));
const photo = (name: string, bytes: Uint8Array = JPEG) =>
  new File([new Uint8Array(bytes)], name, { type: "image/jpeg" });

function upload(files: File[]) {
  const body = new FormData();
  for (const file of files) body.append("file", file);
  return POST(
    new Request("http://localhost/api/upload", { method: "POST", body }),
  );
}

const RECIPE = {
  title: "Pearl Couscous Salad",
  servings: 4,
  ingredients: [],
  instructions: ["Boil the couscous."],
  tags: [],
  equipment: [],
};

beforeEach(() => {
  mocks.extractRecipeFromImages.mockReset();
  mocks.extractRecipeFromImages.mockResolvedValue({ ok: true, recipe: RECIPE });
  mocks.findRecipeBySourceHash.mockReset();
  mocks.findRecipeBySourceHash.mockResolvedValue(null);
  mocks.claimUploadSlot.mockReset();
  mocks.claimUploadSlot.mockResolvedValue({ ok: true });
});

describe("several photos as one recipe", () => {
  it("reads them in one call, in the order chosen", async () => {
    const second = new Uint8Array([...JPEG, 0]);
    const response = await upload([photo("one.jpg"), photo("two.jpg", second)]);

    expect(response.status).toBe(200);
    expect(mocks.extractRecipeFromImages).toHaveBeenCalledTimes(1);
    const [images] = mocks.extractRecipeFromImages.mock.calls[0];
    expect(images).toHaveLength(2);
    expect(images[1].bytes.length).toBe(second.length);

    const body = await response.json();
    expect(body.recipe.title).toBe("Pearl Couscous Salad");
    expect(body.source).toBe("PHOTO");
    // One recipe has one original: the first photo.
    expect(body.sourceFileName).toBe("one.jpg");
  });

  it("spends one reading from the daily allowance, not one per photo", async () => {
    await upload([photo("a.jpg"), photo("b.jpg"), photo("c.jpg")]);
    expect(mocks.claimUploadSlot).toHaveBeenCalledTimes(1);
  });

  it("refuses a PDF mixed in with photos", async () => {
    const pdf = new File([new TextEncoder().encode("%PDF-1.4\n")], "card.pdf", {
      type: "application/pdf",
    });
    const response = await upload([photo("a.jpg"), pdf]);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/PDF goes on its own/);
    expect(mocks.extractRecipeFromImages).not.toHaveBeenCalled();
  });

  it("names the photo that is not a photo", async () => {
    const junk = new File([new Uint8Array([1, 2, 3, 4])], "x.jpg");
    const response = await upload([photo("a.jpg"), junk]);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/^Photo 2:/);
  });

  it("refuses more than six", async () => {
    const response = await upload(
      Array.from({ length: 7 }, (_, i) => photo(`${i}.jpg`)),
    );
    expect(response.status).toBe(400);
    expect(mocks.claimUploadSlot).not.toHaveBeenCalled();
  });

  it("recognises the same set chosen again, before reading it", async () => {
    mocks.findRecipeBySourceHash.mockResolvedValue({
      id: "r1",
      publicId: "abcd1234",
      title: "Pearl Couscous Salad",
    });
    const response = await upload([photo("a.jpg"), photo("b.jpg")]);
    expect(response.status).toBe(409);
    expect(mocks.extractRecipeFromImages).not.toHaveBeenCalled();
  });
});
