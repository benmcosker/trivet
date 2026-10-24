/**
 * What somebody pasted, turned into an address worth fetching.
 *
 * Deliberately import-free, the same way `meal-slots.ts` is: the link half of
 * the upload card runs `normaliseAddress` in the browser so a typo costs
 * nothing, and `/api/import-url` runs it again on the server because a client
 * check is a courtesy rather than a boundary. Anything imported here would be
 * bundled into the client along with it.
 */

/** A scheme at the front: `https:`, `mailto:`, `javascript:`. */
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Normalise a pasted address, or say it is not one.
 *
 * Lenient about the scheme on purpose - people paste
 * `smittenkitchen.com/2024/...` constantly, and refusing that would be the app
 * being pedantic about a detail it can supply itself. Anything that is not
 * http(s) after that is refused rather than guessed at: a `mailto:` is a
 * deliberate thing to have typed, not a near-miss.
 */
export function normaliseAddress(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;

  const withScheme = HAS_SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  // A single word with no dot is a search, not a host. `localhost` and bare
  // intranet names lose nothing by being refused here - this app fetches the
  // public web.
  if (!url.hostname.includes(".") || url.hostname.endsWith(".")) return null;

  return url.toString();
}

/** The site, as a person would name it: `halfbakedharvest.com`. */
export function hostLabel(address: string): string {
  try {
    return new URL(address).hostname.replace(/^www\./i, "");
  } catch {
    return address;
  }
}

/**
 * The address as the copy says it back: host and path, no scheme.
 *
 * "Nothing is at halfbakedharvest.com/soup" wants the path, because the path
 * is the part that is usually wrong. The scheme is noise in a sentence.
 */
export function displayAddress(address: string): string {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return address;
  }

  const path = `${url.pathname}${url.search}`.replace(/\/$/, "");
  return `${hostLabel(address)}${path}`;
}
