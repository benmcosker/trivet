/**
 * Reading `schema.org/Recipe` out of a page's own markup.
 *
 * Four of the six recipe sites measured for this feature publish JSON-LD, so
 * this is the usual way in - but what comes out of here is an *input to
 * extraction*, never a substitute for it. A site can answer 200 with the full
 * ingredient list and a two-step teaser of the method, and no amount of
 * parsing can tell that from a genuinely short recipe. The model is asked to
 * make that call; see `extractRecipeFromPage`.
 *
 * No parsing dependency, on purpose. A regex over `<script type="application/
 * ld+json">` blocks plus `JSON.parse` is the whole job, and the alternative is
 * a DOM implementation in the serverless bundle to read four tags.
 */

/** A `<script>` tag and whatever is inside it. */
const SCRIPT_TAG = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;

/** `type="application/ld+json"`, in any of the ways sites write it. */
const LD_JSON_TYPE = /type\s*=\s*["']?application\/ld\+json/i;

/** CDATA and comment wrappers some CMSes put around inline JSON. */
const CDATA =
  /^\s*(?:<!--)?\s*(?:\/\/)?\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*(?:-->)?\s*$/;
const HTML_COMMENT_WRAP = /^\s*<!--([\s\S]*?)-->\s*$/;

type JsonObject = Record<string, unknown>;

export type PageMarkup = {
  /** The Recipe node, exactly as the page published it. */
  recipe: JsonObject;
  /** The site's own name for itself, where the markup gives one. */
  siteName: string | null;
};

/**
 * The first usable `schema.org/Recipe` in a page.
 *
 * "First usable" rather than "the one": one of the measured sites returns two
 * Recipe nodes inside a single `ld+json` block, the second a stub carrying
 * little more than a name. So every node is collected in document order and
 * the first *complete* one wins - complete meaning it has ingredients and a
 * method. If none is complete, the first named one is still worth handing to
 * the model, which can say so in its confidence.
 */
export function findRecipeMarkup(html: string): PageMarkup | null {
  const documents = ldJsonDocuments(html);

  const candidates: JsonObject[] = [];
  for (const document of documents) {
    collectRecipes(document, candidates);
  }
  if (candidates.length === 0) return null;

  const recipe =
    candidates.find(isComplete) ??
    candidates.find((node) => typeof node.name === "string") ??
    candidates[0];

  return { recipe, siteName: siteNameFrom(recipe, documents, html) };
}

/** Does this node carry enough to be the recipe rather than a stub of one? */
function isComplete(node: JsonObject): boolean {
  return (
    typeof node.name === "string" &&
    asArray(node.recipeIngredient).length > 0 &&
    asArray(node.recipeInstructions).length > 0
  );
}

/** Every parsed `ld+json` block in the page, in document order. */
function ldJsonDocuments(html: string): unknown[] {
  const documents: unknown[] = [];

  for (const match of html.matchAll(SCRIPT_TAG)) {
    const [, attributes = "", body = ""] = match;
    if (!LD_JSON_TYPE.test(attributes)) continue;

    const text = unwrap(body);
    if (!text) continue;

    try {
      documents.push(JSON.parse(text));
    } catch {
      // One malformed block is not the whole page. Sites inline JSON that has
      // been through a templating engine and lost a quote; the next block is
      // often the one that matters.
    }
  }

  return documents;
}

function unwrap(body: string): string {
  const cdata = body.match(CDATA);
  if (cdata?.[1]) return cdata[1].trim();

  const commented = body.match(HTML_COMMENT_WRAP);
  if (commented?.[1]) return commented[1].trim();

  return body.trim();
}

/**
 * Walk anything and collect the Recipe nodes.
 *
 * A recursive walk rather than a `@graph` special case: Yoast nests the recipe
 * in `@graph`, WP Recipe Maker publishes it at the top level, and others put
 * it inside `mainEntity` or inside an array of arrays. All three are the same
 * walk, and the walk cannot be wrong about a shape nobody has tried yet.
 */
function collectRecipes(node: unknown, into: JsonObject[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectRecipes(item, into);
    return;
  }

  if (!isObject(node)) return;

  if (hasType(node, "Recipe")) into.push(node);

  for (const value of Object.values(node)) {
    if (Array.isArray(value) || isObject(value)) collectRecipes(value, into);
  }
}

function hasType(node: JsonObject, type: string): boolean {
  const declared = node["@type"];
  if (typeof declared === "string") return declared === type;
  if (Array.isArray(declared)) return declared.includes(type);
  return false;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * What the site calls itself.
 *
 * This becomes `sourceName` on the saved recipe, so it wants the publication
 * rather than the author: "Once Upon a Chef", not "Jenn Segal". The recipe's
 * own publisher is the most specific answer, the `WebSite` node in the graph
 * the next, and `og:site_name` the last. A null here falls back to the bare
 * hostname at the call site.
 */
function siteNameFrom(
  recipe: JsonObject,
  documents: unknown[],
  html: string,
): string | null {
  const publisher =
    nameOf(recipe.publisher) ?? nameOf(recipe.sourceOrganization);
  if (publisher) return publisher;

  const nodes: JsonObject[] = [];
  for (const document of documents) collectTyped(document, nodes);
  for (const type of ["WebSite", "Organization", "NewsMediaOrganization"]) {
    const node = nodes.find((candidate) => hasType(candidate, type));
    const name = nameOf(node);
    if (name) return name;
  }

  return metaContent(html, "og:site_name");
}

function collectTyped(node: unknown, into: JsonObject[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectTyped(item, into);
    return;
  }
  if (!isObject(node)) return;
  if (node["@type"]) into.push(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value) || isObject(value)) collectTyped(value, into);
  }
}

function nameOf(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const name = nameOf(item);
      if (name) return name;
    }
    return null;
  }
  if (isObject(value) && typeof value.name === "string") {
    return value.name.trim() || null;
  }
  return null;
}

/** A `<meta property="og:site_name" content="...">`, either attribute first. */
export function metaContent(html: string, property: string): string | null {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)\\s*=\\s*["']${escaped}["'][^>]*content\\s*=\\s*["']([^"']*)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content\\s*=\\s*["']([^"']*)["'][^>]*(?:property|name)\\s*=\\s*["']${escaped}["']`,
      "i",
    ),
  ];

  for (const pattern of patterns) {
    const found = html.match(pattern)?.[1];
    if (found) return decodeEntities(found).trim() || null;
  }
  return null;
}

/**
 * The dish photo the page advertises.
 *
 * `image` is the loosest field in the whole vocabulary - a string, an array of
 * strings, an `ImageObject`, or an array of those - so every shape is reduced
 * to the first absolute http(s) URL in it. `og:image` is the fallback, which
 * is what the page would show if it were shared anywhere else.
 */
export function markupImageUrl(
  markup: PageMarkup | null,
  html: string,
): string | null {
  const fromRecipe = markup ? firstImageUrl(markup.recipe.image) : null;
  if (fromRecipe) return fromRecipe;

  const og = metaContent(html, "og:image");
  return og && /^https?:\/\//i.test(og) ? og : null;
}

function firstImageUrl(value: unknown): string | null {
  if (typeof value === "string") {
    return /^https?:\/\//i.test(value) ? value : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const url = firstImageUrl(item);
      if (url) return url;
    }
    return null;
  }
  if (isObject(value)) {
    return firstImageUrl(value.url ?? value.contentUrl);
  }
  return null;
}

/** Tags whose contents are not readable text however they are stripped. */
const DEAD_WEIGHT =
  /<(script|style|noscript|svg|template|iframe)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;

/** Block-level ends worth keeping as a line break. */
const LINE_BREAKS = /<\/?(?:br|p|div|li|tr|h[1-6]|section|article)\b[^>]*>/gi;

/**
 * The page as plain text, for when there is no markup to read.
 *
 * Crude by design: a recipe page's navigation, comments and "you might also
 * like" rail all survive this, and that is fine - the model is being asked to
 * find the recipe in a page, which is a thing it is good at. What matters is
 * that the ingredients and the method are *in here*, which stripping tags
 * guarantees and a cleverer readability heuristic would not.
 *
 * The ceiling is the real constraint. A modern recipe page is mostly markup
 * and script; the text left after this is a few thousand characters, and the
 * limit only bites on something pathological.
 */
export function readablePageText(html: string, limit = 60_000): string {
  const text = decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(DEAD_WEIGHT, " ")
      .replace(LINE_BREAKS, "\n")
      .replace(/<[^>]*>/g, " "),
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text.length > limit ? `${text.slice(0, limit)}\n[truncated]` : text;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  deg: "°",
  copy: "©",
  reg: "®",
  trade: "™",
  rsquo: "\u2019",
  lsquo: "\u2018",
  ldquo: "\u201c",
  rdquo: "\u201d",
  middot: "·",
  bull: "•",
  times: "×",
  eacute: "é",
  frac12: "½",
  frac14: "¼",
  frac34: "¾",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi, (whole, body) => {
    const entity = String(body);
    if (entity.startsWith("#")) {
      const code =
        entity[1]?.toLowerCase() === "x"
          ? Number.parseInt(entity.slice(2), 16)
          : Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : whole;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? whole;
  });
}
