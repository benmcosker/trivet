/**
 * Fetching somebody else's recipe page, server-side.
 *
 * Two of the six sites measured for this feature answer 403 to anything that
 * is not a real browser - Cloudflare-style fingerprinting that looks past the
 * User-Agent at the TLS handshake, which a server cannot get around. So a
 * refusal is an ordinary outcome here rather than an error, and this module's
 * job is to name which ordinary outcome happened so the page can say something
 * useful about it.
 *
 * The fetch itself goes through a seam. Nothing in CI or in a development
 * container can reach the public web, so every test of this drives it with a
 * stubbed `fetchImpl`; a test that tried a real site would be a test that
 * fails for a reason that has nothing to do with the code.
 */

/** Exactly the shape of `fetch`, so the default needs no adapter. */
export type PageFetcher = (url: string, init: RequestInit) => Promise<Response>;

/**
 * A current desktop Chrome.
 *
 * Worth sending because some sites vary their markup rather than their
 * willingness - a default Node user agent gets a stripped page from a CDN
 * that would have served the full one. It does not get past the two that
 * refuse; nothing a server sends does.
 */
export const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

/**
 * How long a site gets to answer.
 *
 * The route's own ceiling is 60s and the model call after this is the slow
 * half, so the page fetch gets a fifth of the budget. A site that has not
 * answered in twenty seconds is not about to.
 */
export const PAGE_TIMEOUT_MS = 20_000;

/** Enough for any recipe page; small enough that a hostile one cannot hurt. */
export const MAX_PAGE_BYTES = 2 * 1024 * 1024;

/** Enough for a dish photo, in line with what the uploader accepts. */
export const MAX_IMAGE_FETCH_BYTES = 8 * 1024 * 1024;

/**
 * How many redirects to follow before giving up.
 *
 * Five is more than any recipe site needs and short enough that a loop costs
 * five requests rather than a timeout.
 */
export const MAX_REDIRECTS = 5;

/**
 * Why a page did not come back, in the terms the copy is written in.
 *
 * - `refused` - the site answered, and answered no. Print it yourself.
 * - `missing` - there is nothing at that address. Check the address.
 * - `timeout` - no answer in time. Same remedy as a refusal.
 * - `error` - it answered with something that is not a readable page.
 */
export type PageFailure = "refused" | "missing" | "timeout" | "error";

export type PageFetchResult =
  | { ok: true; html: string; finalUrl: string }
  | { ok: false; failure: PageFailure; status?: number };

/** Answered, and answered no. */
const REFUSING_STATUSES = new Set([
  401, 402, 403, 405, 406, 429, 451, 503,
  // Cloudflare's own range: "web server is returning an unknown error" and
  // friends. These are the bot wall talking, not the origin.
  520, 521, 522, 523, 524, 525, 526, 527, 530,
]);

/** Nothing there. */
const MISSING_STATUSES = new Set([404, 410]);

/**
 * Hosts a signed-in person must not be able to make this server fetch.
 *
 * The route takes an arbitrary address and fetches it with the deployment's
 * own network position, which is the shape of a server-side request forgery.
 * This is the cheap half of the defence - a literal address pointing at the
 * loopback, link-local or private ranges, or at a name that cannot be on the
 * public web. It does not stop a public name that resolves inward, which
 * would need a resolve-then-connect of its own; worth doing if this ever
 * runs somewhere with an interesting internal network.
 */
export function isPublicHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (host === "localhost" || host.endsWith(".localhost")) return false;
  if (host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd")) {
    return false;
  }
  if (host.startsWith("fe80:")) return false;

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = ipv4.slice(1).map(Number);
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a >= 224) return false;
  }

  return true;
}

/**
 * Follow redirects by hand, checking every hop.
 *
 * `redirect: "follow"` would be one line instead of thirty, and it is the
 * hole this exists to close. The address somebody pastes is checked against
 * `isPublicHost` before anything is fetched - but a page is free to answer
 * 302 to wherever it likes, and with the platform following that redirect
 * internally nothing ever looks at where it went. A public page pointing at
 * `http://169.254.169.254/` is a request for the deployment's own cloud
 * metadata, made by the deployment, with the deployment's credentials.
 *
 * So every hop is a fetch this code decides to make, and every hop goes
 * through the same guard as the first one. A redirect somewhere it may not
 * go is not distinguished from any other unreadable answer: the person
 * pasted an address and got a page that cannot be read, which is what `error`
 * already says, and saying more would describe this server's network to
 * somebody probing it.
 */
async function fetchFollowing(
  address: string,
  init: RequestInit,
  fetchImpl: PageFetcher,
): Promise<{ ok: true; response: Response; finalUrl: string } | { ok: false }> {
  let current = address;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    let url: URL;
    try {
      url = new URL(current);
    } catch {
      return { ok: false };
    }

    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return { ok: false };
    }
    if (!isPublicHost(url.hostname)) return { ok: false };

    const response = await fetchImpl(url.toString(), {
      ...init,
      redirect: "manual",
    });

    if (response.status < 300 || response.status > 399) {
      return { ok: true, response, finalUrl: response.url || url.toString() };
    }

    const location = response.headers.get("location");
    if (!location) {
      // A 3xx with nowhere to go is not a redirect, whatever it says.
      return { ok: true, response, finalUrl: url.toString() };
    }

    // Relative Locations are common and legal; resolve against this hop.
    try {
      current = new URL(location, url).toString();
    } catch {
      return { ok: false };
    }
  }

  // More hops than any real page needs: a loop, or something playing.
  return { ok: false };
}

/**
 * Fetch a page as HTML, or say why not.
 *
 * Redirects are followed - one of the measured sites answers 301 before it
 * answers anything else - and the address that finally answered comes back as
 * `finalUrl`, because that is the one worth saving as the recipe's source.
 * They are followed by hand rather than by the platform, so that each one is
 * checked: see `fetchFollowing`.
 */
export async function fetchPage(
  address: string,
  options: {
    fetchImpl?: PageFetcher;
    timeoutMs?: number;
    maxBytes?: number;
  } = {},
): Promise<PageFetchResult> {
  const {
    fetchImpl = globalThis.fetch,
    timeoutMs = PAGE_TIMEOUT_MS,
    maxBytes = MAX_PAGE_BYTES,
  } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const hop = await fetchFollowing(
      address,
      {
        signal: controller.signal,
        headers: {
          "User-Agent": BROWSER_USER_AGENT,
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
      },
      fetchImpl,
    );

    if (!hop.ok) return { ok: false, failure: "error" };
    const { response } = hop;

    if (!response.ok) {
      return {
        ok: false,
        failure: statusFailure(response.status),
        status: response.status,
      };
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType && !/text\/html|xhtml|text\/plain/i.test(contentType)) {
      // A PDF or an image at the end of a link is a real thing to paste, but
      // it is not what this path reads, and handing its bytes to the model as
      // text would produce confident nonsense.
      return { ok: false, failure: "error" };
    }

    const bytes = await readCapped(response, maxBytes);
    return {
      ok: true,
      html: decodeHtml(bytes, contentType),
      finalUrl: hop.finalUrl,
    };
  } catch (error) {
    return { ok: false, failure: networkFailure(error) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch the dish photo a page advertises.
 *
 * Best effort in the strictest sense: any failure at all comes back null and
 * the review screen says no photo came back. A missing photo is a thing the
 * cook can fix in ten seconds after saving, so none of this is worth failing
 * an import over.
 */
export async function fetchImageBytes(
  address: string,
  options: {
    fetchImpl?: PageFetcher;
    timeoutMs?: number;
    maxBytes?: number;
  } = {},
): Promise<Uint8Array | null> {
  const {
    fetchImpl = globalThis.fetch,
    timeoutMs = PAGE_TIMEOUT_MS,
    maxBytes = MAX_IMAGE_FETCH_BYTES,
  } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Through the same guarded follower as the page. An image address comes
    // out of somebody else's markup rather than out of our own hands, so it
    // is no more trustworthy than the page that advertised it.
    const hop = await fetchFollowing(
      address,
      {
        signal: controller.signal,
        headers: { "User-Agent": BROWSER_USER_AGENT, Accept: "image/*" },
      },
      fetchImpl,
    );
    if (!hop.ok || !hop.response.ok) return null;
    return await readCapped(hop.response, maxBytes);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Read a body, stopping at a ceiling.
 *
 * `response.arrayBuffer()` would read whatever is sent, and what is sent is
 * decided by somebody else - a serverless function with a few hundred MB of
 * memory should not be made to find out how big a page can be. Reading the
 * stream means the ceiling is enforced while the bytes arrive rather than
 * after.
 */
async function readCapped(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array> {
  const body = response.body;
  if (!body) {
    // A stubbed or already-buffered response has no stream. The ceiling still
    // applies, it just cannot be applied while the bytes arrive.
    const whole = new Uint8Array(await response.arrayBuffer());
    return whole.length > maxBytes ? whole.subarray(0, maxBytes) : whole;
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      const room = maxBytes - total;
      if (value.length >= room) {
        chunks.push(value.subarray(0, room));
        total = maxBytes;
        // Everything after the ceiling is thrown away, and the connection with
        // it: a page this big is not getting more useful further down.
        await reader.cancel();
        break;
      }

      chunks.push(value);
      total += value.length;
    }
  } finally {
    reader.releaseLock();
  }

  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  return joined;
}

/**
 * Decode using the charset the response declared.
 *
 * Recipe blogs are overwhelmingly UTF-8, but a long-running WordPress on
 * `windows-1252` turns every curly apostrophe into a replacement character,
 * and those land in the saved recipe. `TextDecoder` knows the legacy
 * encodings; an unknown label falls back rather than throwing.
 */
function decodeHtml(bytes: Uint8Array, contentType: string): string {
  const declared = contentType.match(/charset=\s*"?([\w-]+)"?/i)?.[1];
  for (const label of [declared, "utf-8"]) {
    if (!label) continue;
    try {
      return new TextDecoder(label).decode(bytes);
    } catch {
      // Unknown label; fall through to utf-8.
    }
  }
  return new TextDecoder().decode(bytes);
}

function statusFailure(status: number): PageFailure {
  if (MISSING_STATUSES.has(status)) return "missing";
  if (REFUSING_STATUSES.has(status)) return "refused";
  return "error";
}

function networkFailure(error: unknown): PageFailure {
  if (error instanceof Error && error.name === "AbortError") return "timeout";

  // Node's fetch wraps the real reason in `cause`, and a name that does not
  // resolve is the same outcome for the person as a 404: there is nothing at
  // that address, and nothing to print.
  const code = (error as { cause?: { code?: string } })?.cause?.code;
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "missing";
  if (code === "UND_ERR_HEADERS_TIMEOUT" || code === "UND_ERR_BODY_TIMEOUT") {
    return "timeout";
  }

  return "error";
}
