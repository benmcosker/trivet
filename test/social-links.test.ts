import { describe, expect, it } from "vitest";

import { linkFromShare, socialAdvice, socialSite } from "@/lib/social-links";

describe("socialSite", () => {
  it("recognises TikTok, short links included", () => {
    expect(
      socialSite("https://www.tiktok.com/@cook/video/7300000000000000000"),
    ).toBe("tiktok");
    expect(socialSite("https://vm.tiktok.com/ZMabc123/")).toBe("tiktok");
  });

  it("recognises Instagram", () => {
    expect(socialSite("https://www.instagram.com/p/Cabc123/")).toBe(
      "instagram",
    );
    expect(socialSite("https://instagr.am/p/Cabc123/")).toBe("instagram");
  });

  it("leaves ordinary pages, and look-alikes, to the page import", () => {
    expect(socialSite("https://smittenkitchen.com/2024/01/orzo/")).toBeNull();
    expect(socialSite("https://tiktok.com.example.net/x")).toBeNull();
    expect(socialSite("not a url")).toBeNull();
  });
});

describe("socialAdvice", () => {
  it("points either site's link at a screenshot of the caption", () => {
    expect(socialAdvice("instagram")).toMatch(/^Instagram doesn't share/);
    expect(socialAdvice("tiktok")).toMatch(/^TikTok doesn't share/);
    expect(socialAdvice("tiktok")).toMatch(/screenshot of the caption/);
  });
});

describe("linkFromShare", () => {
  it("finds the link inside a shared sentence", () => {
    expect(
      linkFromShare("Check out this recipe! https://cook.example/orzo #dinner"),
    ).toBe("https://cook.example/orzo");
  });

  it("passes a bare link, or text with none, through as it is", () => {
    expect(linkFromShare(" https://cook.example/orzo ")).toBe(
      "https://cook.example/orzo",
    );
    expect(linkFromShare("smittenkitchen.com/orzo")).toBe(
      "smittenkitchen.com/orzo",
    );
  });

  it("has nothing to read from nothing", () => {
    expect(linkFromShare(null)).toBeNull();
    expect(linkFromShare("   ")).toBeNull();
  });
});
