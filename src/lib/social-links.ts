/**
 * Recipes found on Instagram and TikTok.
 *
 * Neither serves its posts to a server that asks for the page: both answer
 * with a login wall or a script shell, so the ordinary link import reads
 * nothing. What each one does offer differs, and so does the answer:
 *
 * - **TikTok** has a public oEmbed endpoint - no key, no login - whose
 *   `title` is the video's caption. Many recipe videos put the whole recipe
 *   there, so a TikTok link is read from that.
 * - **Instagram**'s oEmbed needs a reviewed Meta developer app, and returns
 *   no caption even then. There is nothing honest to fetch, so a link is
 *   answered with what does work: a screenshot of the caption, uploaded as a
 *   photo, which the image import reads like any card.
 *
 * Scraping either site is not on the table: both forbid it, and it would
 * break whenever they changed a page.
 */

export type SocialSite = "tiktok" | "instagram";

const TIKTOK_HOSTS = new Set([
  "tiktok.com",
  "www.tiktok.com",
  "m.tiktok.com",
  "vm.tiktok.com",
  "vt.tiktok.com",
]);

const INSTAGRAM_HOSTS = new Set([
  "instagram.com",
  "www.instagram.com",
  "m.instagram.com",
  "instagr.am",
]);

/** Which social site an address is on, or null for an ordinary page. */
export function socialSite(address: string): SocialSite | null {
  let host: string;
  try {
    host = new URL(address).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (TIKTOK_HOSTS.has(host)) return "tiktok";
  if (INSTAGRAM_HOSTS.has(host)) return "instagram";
  return null;
}

/** What to say when somebody pastes an Instagram link. */
export const INSTAGRAM_ADVICE =
  "Instagram doesn't share captions with other apps, so Trivet can't read " +
  "that link. Take a screenshot of the caption and add it below as a photo.";

export const TIKTOK_OEMBED = "https://www.tiktok.com/oembed";
const TIKTOK_TIMEOUT_MS = 10_000;

/** Fewer characters than this is a caption with no recipe in it. */
const MIN_CAPTION_CHARS = 40;

export type TikTokCaption =
  | {
      ok: true;
      caption: string;
      /** The creator's display name, for the recipe's source line. */
      author: string | null;
      thumbnailUrl: string | null;
    }
  | { ok: false; error: string };

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

/**
 * A TikTok video's caption, through TikTok's own oEmbed endpoint.
 *
 * A caption too short to hold a recipe is refused here rather than sent to
 * the model: "Dinner in 20 minutes! #pasta" would come back as a guessed
 * recipe, and the recipe usually lives in the voice-over, which nothing can
 * read without downloading the video.
 */
export async function fetchTikTokCaption(
  address: string,
  fetcher: Fetcher = fetch,
): Promise<TikTokCaption> {
  const unavailable = {
    ok: false as const,
    error:
      "TikTok didn't return that video. It may be private or deleted, or " +
      "TikTok may be busy; try again in a minute.",
  };

  let response: Response;
  try {
    response = await fetcher(
      `${TIKTOK_OEMBED}?url=${encodeURIComponent(address)}`,
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(TIKTOK_TIMEOUT_MS),
      },
    );
  } catch {
    return unavailable;
  }
  if (!response.ok) return unavailable;

  const body: unknown = await response.json().catch(() => null);
  if (!body || typeof body !== "object") return unavailable;
  const { title, author_name, thumbnail_url } = body as Record<string, unknown>;

  const caption = typeof title === "string" ? title.trim() : "";
  if (caption.length < MIN_CAPTION_CHARS) {
    return {
      ok: false,
      error:
        "That TikTok's caption doesn't hold a recipe. If the recipe is only " +
        "spoken in the video, type it in instead.",
    };
  }

  return {
    ok: true,
    caption,
    author:
      typeof author_name === "string" && author_name.trim()
        ? author_name.trim()
        : null,
    thumbnailUrl:
      typeof thumbnail_url === "string" && thumbnail_url.startsWith("https://")
        ? thumbnail_url
        : null,
  };
}
