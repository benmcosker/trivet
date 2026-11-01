import { describe, expect, it, vi } from "vitest";

import {
  INSTAGRAM_ADVICE,
  TIKTOK_OEMBED,
  fetchTikTokCaption,
  linkFromShare,
  socialSite,
} from "@/lib/social-links";

const VIDEO = "https://www.tiktok.com/@cook/video/7300000000000000000";
const RECIPE_CAPTION =
  "Lemon orzo: 1 cup orzo, 2 cups stock, zest of a lemon, parmesan. " +
  "Toast the orzo, add stock, simmer 10 min, finish with lemon. #dinner";

const answer = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe("socialSite", () => {
  it("recognises TikTok, short links included", () => {
    expect(socialSite(VIDEO)).toBe("tiktok");
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

  it("tells an Instagram link what does work", () => {
    expect(INSTAGRAM_ADVICE).toMatch(/screenshot of the caption/);
  });
});

describe("fetchTikTokCaption", () => {
  it("asks TikTok's own oEmbed endpoint for the video", async () => {
    const fetcher = answer(200, { title: RECIPE_CAPTION });
    await fetchTikTokCaption(VIDEO, fetcher);
    expect(fetcher).toHaveBeenCalledWith(
      `${TIKTOK_OEMBED}?url=${encodeURIComponent(VIDEO)}`,
      expect.anything(),
    );
  });

  it("returns the caption, the creator and the thumbnail", async () => {
    const result = await fetchTikTokCaption(
      VIDEO,
      answer(200, {
        title: RECIPE_CAPTION,
        author_name: "Weeknight Cook",
        thumbnail_url: "https://p16-sign.tiktokcdn.com/thumb.jpeg",
      }),
    );
    expect(result).toEqual({
      ok: true,
      caption: RECIPE_CAPTION,
      author: "Weeknight Cook",
      thumbnailUrl: "https://p16-sign.tiktokcdn.com/thumb.jpeg",
    });
  });

  it("refuses a caption too short to hold a recipe, rather than guessing", async () => {
    const result = await fetchTikTokCaption(
      VIDEO,
      answer(200, { title: "Dinner in 20! #pasta" }),
    );
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.error).toMatch(/only spoken in the video/);
  });

  it("says plainly when TikTok won't return the video", async () => {
    for (const fetcher of [
      answer(404, { message: "Not found" }),
      vi.fn(async () => {
        throw new Error("network");
      }),
      vi.fn(async () => new Response("<html>", { status: 200 })),
    ]) {
      const result = await fetchTikTokCaption(VIDEO, fetcher);
      expect(result.ok).toBe(false);
      expect(result.ok ? "" : result.error).toMatch(/private or deleted/);
    }
  });

  it("drops a thumbnail that is not https", async () => {
    const result = await fetchTikTokCaption(
      VIDEO,
      answer(200, { title: RECIPE_CAPTION, thumbnail_url: "http://x/y.jpg" }),
    );
    expect(result.ok && result.thumbnailUrl).toBeNull();
  });
});

describe("linkFromShare", () => {
  it("finds the link inside TikTok's share sentence", () => {
    expect(
      linkFromShare(
        "Check out this video! https://vm.tiktok.com/ZMabc123/ #fyp",
      ),
    ).toBe("https://vm.tiktok.com/ZMabc123/");
  });

  it("passes a bare link, or text with none, through as it is", () => {
    expect(linkFromShare(" https://www.instagram.com/reel/Cx1/ ")).toBe(
      "https://www.instagram.com/reel/Cx1/",
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
