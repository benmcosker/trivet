/**
 * What a recipe's web address looks like.
 *
 * `/recipes/cmueg2ru7000104layw1c3nqo` is a cuid, and twenty-five characters
 * that say nothing about the dish. `/recipes/pork-ragu-a3f91c47` says what it
 * is, in a link somebody can read aloud, paste into a message, or recognise in
 * a list of bookmarks.
 *
 * ## The words are decoration
 *
 * Only the eight characters on the end are looked up. The slug in front is
 * regenerated from whatever the title says at the moment the link is drawn, so:
 *
 * - Renaming a dish cannot break a link anybody saved. The words in their copy
 *   go stale, the address still resolves, and the page redirects them to the
 *   current spelling.
 * - Nothing has to be stored twice or kept in step. There is no slug column
 *   drifting away from the title it was made from.
 * - Two households can both have a Chicken Soup without either address having
 *   to admit the other exists - which a `chicken-soup-2` would.
 *
 * Import-free, because the planner is a client component and this has to be
 * usable there too. Making a new `publicId` needs a random source and lives in
 * `recipe-mutations.ts` with the code that inserts rows.
 */

/**
 * How much of a long title to keep.
 *
 * "Sheet Pan Chicken Thighs with Charred Lemon and Fennel" is a fine name for
 * a dish and a poor one for a URL. Cut at a word boundary under this, so the
 * address stays readable rather than ending mid-syllable.
 */
const MAX_SLUG_LENGTH = 60;

/** The title, as the readable half of an address. */
export function slugifyTitle(title: string): string {
  const slug = title
    .normalize("NFD")
    // Strip the accents NFD just separated out: "Crème Brûlée" -> "creme
    // brulee" rather than "cr-me-br-l-e", which is what dropping the whole
    // character would give.
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    // Apostrophes close up rather than separating: "Nana's" is "nanas", not
    // "nana-s". Both the typed one and the curly one a word processor makes.
    .replace(/['\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (slug.length <= MAX_SLUG_LENGTH) return slug;

  const cut = slug.slice(0, MAX_SLUG_LENGTH);
  const lastBreak = cut.lastIndexOf("-");
  // A single word longer than the limit has no break to cut at, and half a
  // word is still better than sixty characters of one.
  return lastBreak > 0 ? cut.slice(0, lastBreak) : cut;
}

/**
 * Where this recipe lives.
 *
 * A title of nothing but punctuation slugs to an empty string, and
 * `/recipes/-a3f91c47` is an address that looks broken. Those get the id
 * alone, which is ugly and correct.
 */
export function recipePath(recipe: {
  publicId: string;
  title: string;
}): string {
  const slug = slugifyTitle(recipe.title);
  return `/recipes/${slug ? `${slug}-${recipe.publicId}` : recipe.publicId}`;
}

/**
 * The part of an address that identifies a recipe.
 *
 * Everything before the last hyphen is thrown away, which is what makes the
 * words disposable. A title ending in a number - "Chili 2" - is no trouble:
 * the last segment is still the id.
 *
 * A cuid from an older link has no hyphens in it and comes back whole, which
 * is how `getRecipe` can go on matching those: it tries this against
 * `publicId` and the raw parameter against `id`, and old addresses keep
 * working.
 */
export function publicIdFromPath(param: string): string {
  const lastHyphen = param.lastIndexOf("-");
  return lastHyphen === -1 ? param : param.slice(lastHyphen + 1);
}
