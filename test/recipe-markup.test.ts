import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  findRecipeMarkup,
  markupImageUrl,
  metaContent,
  readablePageText,
} from "@/lib/recipe-markup";

/**
 * The parser is tested against saved HTML and nothing else.
 *
 * Neither CI nor a development container can reach the public web, so a test
 * that fetched a real recipe site would fail for a reason that has nothing to
 * do with this code - and would start failing on somebody else's schedule
 * even where it could. The fixtures are hand-written rather than scraped, and
 * carry only the shapes the parser has to survive.
 */
const fixtures = join(process.cwd(), "test/fixtures");
const page = (name: string) => readFileSync(join(fixtures, name), "utf8");

describe("findRecipeMarkup", () => {
  it("reads a Recipe published at the top level", () => {
    const markup = findRecipeMarkup(page("recipe-top-level.html"));

    expect(markup?.recipe.name).toBe("Leek and Potato Soup");
    expect(markup?.recipe.recipeIngredient).toHaveLength(4);
  });

  it("takes the first complete Recipe when a block holds two", () => {
    // One of the measured sites returns two Recipe matches in one block, the
    // first a stub with a name and nothing else. Taking "the first" would
    // hand the model a recipe with no ingredients and no method.
    const markup = findRecipeMarkup(page("recipe-top-level.html"));
    const instructions = markup?.recipe.recipeInstructions;

    expect(Array.isArray(instructions) && instructions).toHaveLength(3);
  });

  it("prefers the recipe's own publisher to og:site_name", () => {
    // The fixture's og:site_name is deliberately wrong. The markup is the
    // more specific claim and wins.
    expect(findRecipeMarkup(page("recipe-top-level.html"))?.siteName).toBe(
      "Pretend Kitchen",
    );
  });

  it("finds a Recipe nested in a @graph array", () => {
    const markup = findRecipeMarkup(page("recipe-graph.html"));

    expect(markup?.recipe.name).toBe("Sheet Pan Harissa Chicken");
    expect(markup?.recipe.recipeIngredient).toContain("3 tbsp harissa");
  });

  it("names the site from the WebSite node when the recipe does not", () => {
    expect(findRecipeMarkup(page("recipe-graph.html"))?.siteName).toBe(
      "Pretend Blog",
    );
  });

  it("ignores a malformed block and reads the next one", () => {
    // The graph fixture carries a block with a trailing comma ahead of the
    // real one. One bad block must not cost the page its recipe.
    expect(findRecipeMarkup(page("recipe-graph.html"))).not.toBeNull();
  });

  it("returns null for a page with no ld+json at all", () => {
    expect(findRecipeMarkup(page("recipe-plain.html"))).toBeNull();
  });

  it("is not fooled by a script tag that merely mentions a recipe", () => {
    expect(findRecipeMarkup(page("recipe-plain.html"))).toBeNull();
  });

  it("reads a block wrapped in CDATA", () => {
    const html = `<script type="application/ld+json">//<![CDATA[
      {"@type":"Recipe","name":"Wrapped","recipeIngredient":["salt"],
       "recipeInstructions":["Season."]}
    ]]></script>`;

    expect(findRecipeMarkup(html)?.recipe.name).toBe("Wrapped");
  });

  it("accepts single quotes and extra attributes on the tag", () => {
    const html =
      `<script class="x" type='application/ld+json' data-y="1">` +
      `{"@type":"Recipe","name":"Attributed"}</script>`;

    expect(findRecipeMarkup(html)?.recipe.name).toBe("Attributed");
  });
});

describe("markupImageUrl", () => {
  it("takes the first image from an array of URLs", () => {
    const html = page("recipe-top-level.html");

    expect(markupImageUrl(findRecipeMarkup(html), html)).toBe(
      "https://cdn.example.com/soup-1x1.jpg",
    );
  });

  it("unwraps an ImageObject", () => {
    const html = page("recipe-graph.html");

    expect(markupImageUrl(findRecipeMarkup(html), html)).toBe(
      "https://cdn.pretendblog.example/harissa-chicken.jpg",
    );
  });

  it("falls back to og:image, and only to an absolute one", () => {
    expect(
      markupImageUrl(null, '<meta property="og:image" content="/x.jpg">'),
    ).toBeNull();
    expect(
      markupImageUrl(
        null,
        '<meta property="og:image" content="https://a/x.jpg">',
      ),
    ).toBe("https://a/x.jpg");
  });

  it("has nothing to offer a page with neither", () => {
    const html = page("recipe-plain.html");

    expect(markupImageUrl(findRecipeMarkup(html), html)).toBeNull();
  });
});

describe("metaContent", () => {
  it("reads a meta tag whichever order its attributes are in", () => {
    expect(
      metaContent(
        '<meta content="Backwards" property="og:site_name">',
        "og:site_name",
      ),
    ).toBe("Backwards");
  });
});

describe("readablePageText", () => {
  const text = readablePageText(page("recipe-plain.html"));

  it("keeps the ingredients and the method", () => {
    expect(text).toContain("350 ml buttermilk");
    expect(text).toContain("Whisk the dry ingredients together.");
  });

  it("drops script and style contents", () => {
    expect(text).not.toContain("recipeAnalytics");
    expect(text).not.toContain("baking powder;");
    expect(text).not.toContain("#333");
  });

  it("drops comments and tags", () => {
    expect(text).not.toContain("a comment that is not the recipe");
    expect(text).not.toContain("<li>");
  });

  it("decodes the entities that end up in ingredient lines", () => {
    expect(text).toContain("the tops bubble & set");
    expect(text).toContain("Buttermilk Pancakes – Old Blog");
  });

  it("stops at its ceiling rather than handing over a whole site", () => {
    const huge = `<p>${"word ".repeat(50_000)}</p>`;
    const capped = readablePageText(huge, 1_000);

    expect(capped.length).toBeLessThan(1_100);
    expect(capped.endsWith("[truncated]")).toBe(true);
  });
});
