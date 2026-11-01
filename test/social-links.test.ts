import { describe, expect, it, vi } from "vitest";

import {
  INSTAGRAM_ADVICE,
  captionFromPreview,
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
  // A preview description the way TikTok writes it, from the video Ben tried.
  const PREVIEW =
    "16.6K Likes, 219 Comments. TikTok video from Nico Pallotta " +
    "(@nicopallotta): &quot;Easy Pearl Couscous Salad GET RECIPE: " +
    "https://theplantbasedschool.com/israeli-couscous-salad/ Despite its " +
    "English name&quot;. original sound - Nico &amp; Louise";

  const page = (head: string, status = 200) =>
    vi.fn(
      async () =>
        new Response(`<html><head>${head}</head><body></body></html>`, {
          status,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
    );

  it("reads the caption and creator out of the link-preview description", async () => {
    const result = await fetchTikTokCaption(
      VIDEO,
      page(
        `<meta property="og:description" content="${PREVIEW}">` +
          `<meta property="og:image" content="https://p16.tiktokcdn.com/a.jpeg">`,
      ),
    );
    expect(result).toEqual({
      ok: true,
      caption:
        "Easy Pearl Couscous Salad GET RECIPE: " +
        "https://theplantbasedschool.com/israeli-couscous-salad/ Despite its " +
        "English name",
      author: "Nico Pallotta",
      thumbnailUrl: "https://p16.tiktokcdn.com/a.jpeg",
    });
  });

  it("takes the longest of the descriptions a page publishes", async () => {
    const result = await fetchTikTokCaption(
      VIDEO,
      page(
        `<meta name="description" content="Short">` +
          `<meta name="twitter:description" content="${RECIPE_CAPTION}">`,
      ),
    );
    expect(result.ok && result.caption).toBe(RECIPE_CAPTION);
  });

  it("asks for a screenshot when the page publishes no description", async () => {
    const result = await fetchTikTokCaption(
      VIDEO,
      page("<title>TikTok</title>"),
    );
    expect(result.ok ? "" : result.error).toMatch(
      /screenshot of the full caption/,
    );
  });

  it("says plainly when TikTok won't return the video", async () => {
    for (const fetcher of [
      page("", 404),
      vi.fn(async () => {
        throw new Error("network");
      }),
    ]) {
      const result = await fetchTikTokCaption(VIDEO, fetcher);
      expect(result.ok).toBe(false);
      expect(result.ok ? "" : result.error).toMatch(/private or deleted/);
    }
  });
});

describe("captionFromPreview", () => {
  it("takes the caption from between the quotes", () => {
    expect(
      captionFromPreview(
        "12 Likes. TikTok video from Cook (@cook): “Lemon orzo, 1 cup orzo”. original sound",
      ),
    ).toEqual({ caption: "Lemon orzo, 1 cup orzo", author: "Cook" });
  });

  it("takes a description in any other shape whole", () => {
    expect(captionFromPreview("Lemon orzo with 1 cup orzo")).toEqual({
      caption: "Lemon orzo with 1 cup orzo",
      author: null,
    });
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

  it("skips a caption TikTok cut short, rather than half a recipe", () => {
    expect(captionHoldsRecipe(`${RECIPE_CAPTION} 2 cups cherry tom...`)).toBe(
      false,
    );
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
