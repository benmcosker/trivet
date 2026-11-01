import { describe, expect, it, vi } from "vitest";

import {
  INSTAGRAM_ADVICE,
  TIKTOK_OEMBED,
  captionHoldsRecipe,
  fetchTikTokCaption,
  linkFromShare,
  recipeLinkInCaption,
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

  it("returns a short caption too, since it may still carry a link", async () => {
    const result = await fetchTikTokCaption(
      VIDEO,
      answer(200, { title: "Recipe: https://example.com/orzo" }),
    );
    expect(result.ok && result.caption).toBe(
      "Recipe: https://example.com/orzo",
    );
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

describe("captionHoldsRecipe", () => {
  it("reads a caption long enough to hold one", () => {
    expect(captionHoldsRecipe(RECIPE_CAPTION)).toBe(true);
  });

  it("skips a teaser, rather than letting the model guess", () => {
    expect(captionHoldsRecipe("Dinner in 20! #pasta")).toBe(false);
  });
});

describe("recipeLinkInCaption", () => {
  it("finds the recipe page a creator links to", () => {
    // The caption that prompted this, from Inspired Taste.
    const caption =
      "We've been obsessed with this easy couscous salad for years! Recipe " +
      "linked in our bio @inspiredtaste or you can google it. RECIPE: " +
      "https://www.inspiredtaste.net/12689/lemon-and-herb-couscous-salad-recipe/";
    expect(recipeLinkInCaption(caption)).toBe(
      "https://www.inspiredtaste.net/12689/lemon-and-herb-couscous-salad-recipe/",
    );
  });

  it("leaves off a sentence's own punctuation", () => {
    expect(
      recipeLinkInCaption("Full recipe here (https://cook.example/orzo)."),
    ).toBe("https://cook.example/orzo");
  });

  it("skips links that never hold a recipe", () => {
    expect(
      recipeLinkInCaption(
        "More on https://www.tiktok.com/@cook and https://linktr.ee/cook " +
          "and https://www.instagram.com/cook",
      ),
    ).toBeNull();
    expect(
      recipeLinkInCaption("https://linktr.ee/cook then https://cook.example/a"),
    ).toBe("https://cook.example/a");
  });

  it("finds nothing in a caption with no link", () => {
    expect(recipeLinkInCaption(RECIPE_CAPTION)).toBeNull();
  });
});
