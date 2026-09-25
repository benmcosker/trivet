import { describe, expect, it } from "vitest";

import { publicIdFromPath, recipePath, slugifyTitle } from "@/lib/recipe-url";

describe("slugifyTitle", () => {
  it.each([
    ["Pork Ragu with Pappardelle", "pork-ragu-with-pappardelle"],
    ["Nana's Chicken & Dumplings", "nanas-chicken-dumplings"],
    ["Nana\u2019s Chicken", "nanas-chicken"],
    ["  Spaced  Out  ", "spaced-out"],
    ["Chili 2", "chili-2"],
  ])("turns %j into %j", (title, expected) => {
    expect(slugifyTitle(title)).toBe(expected);
  });

  it("keeps the letters under an accent rather than dropping them", () => {
    // Dropping the whole character gives "cr-me-br-l-e", which is not a name.
    expect(slugifyTitle("Crème Brûlée")).toBe("creme-brulee");
  });

  it("has nothing to say about a title with no letters in it", () => {
    expect(slugifyTitle("!!!")).toBe("");
    expect(slugifyTitle("🍲")).toBe("");
  });

  it("cuts a long title at a word rather than mid-syllable", () => {
    const slug = slugifyTitle(
      "Sheet Pan Chicken Thighs with Charred Lemon and Fennel and Potatoes",
    );
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith("-")).toBe(false);
    expect(slug).toBe(
      "sheet-pan-chicken-thighs-with-charred-lemon-and-fennel-and",
    );
  });

  it("cuts a single enormous word, having no break to use", () => {
    expect(slugifyTitle("a".repeat(80))).toBe("a".repeat(60));
  });
});

describe("recipePath", () => {
  it("reads as the dish, and ends in the part that is looked up", () => {
    expect(recipePath({ publicId: "a3f91c47", title: "Pork Ragu" })).toBe(
      "/recipes/pork-ragu-a3f91c47",
    );
  });

  it("falls back to the id alone when the title slugs to nothing", () => {
    // "/recipes/-a3f91c47" is an address that looks broken.
    expect(recipePath({ publicId: "a3f91c47", title: "🍲" })).toBe(
      "/recipes/a3f91c47",
    );
  });
});

describe("publicIdFromPath", () => {
  it("takes the last segment, whatever the words in front say", () => {
    expect(publicIdFromPath("pork-ragu-a3f91c47")).toBe("a3f91c47");
    // The same recipe after a rename. Old links keep resolving, which is the
    // whole reason the words are not what gets looked up.
    expect(publicIdFromPath("nanas-ragu-a3f91c47")).toBe("a3f91c47");
  });

  it("is not confused by a title that ends in a number", () => {
    expect(publicIdFromPath("chili-2-a3f91c47")).toBe("a3f91c47");
  });

  it("hands back a cuid whole, so old addresses can still be matched", () => {
    const cuid = "cmueg2ru7000104layw1c3nqo";
    expect(publicIdFromPath(cuid)).toBe(cuid);
  });

  it("accepts a bare public id, for a link with the words stripped off", () => {
    expect(publicIdFromPath("a3f91c47")).toBe("a3f91c47");
  });
});
