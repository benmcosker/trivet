/**
 * Recipes found on Instagram and TikTok.
 *
 * Neither serves its posts to a server that asks for the page: both answer
 * with a login wall or a script shell, so the ordinary link import reads
 * nothing. What each one does offer differs, and so does the answer:
 *
 * - **TikTok** publishes a short description of each video for link
 *   previews, which is usually its caption. A TikTok link is read from that,
 *   and from the recipe page the caption links to when it links to one.
 * - **Instagram**'s oEmbed needs a reviewed Meta developer app, and returns
 *   no caption even then. There is nothing honest to fetch, so a link is
 *   answered with what does work: a screenshot of the caption, uploaded as a
 *   photo, which the image import reads like any card.
 *
 * Scraping either site is not on the table: both forbid it, and it would
 * break whenever they changed a page.
 */

import { fetchPage, type PageFetcher } from "./fetch-page";
import { metaContent } from "./recipe-markup";

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

const TIKTOK_TIMEOUT_MS = 10_000;

/** Fewer characters than this is a caption with no recipe in it. */
const MIN_CAPTION_CHARS = 40;

/** What to say when what TikTok shares holds neither a recipe nor a link. */
export const TIKTOK_NO_RECIPE =
  "Trivet couldn't find a recipe in what TikTok shares about that video. " +
  "Take a screenshot of the full caption and add it below as a photo, or " +
  "type the recipe in if it's only spoken.";

/**
 * Whether a caption is worth reading for a recipe on its own.
 *
 * Short ones are not sent to the model: "Dinner in 20 minutes! #pasta" would
 * come back as a guessed recipe. Nor is one TikTok cut short with an
 * ellipsis - half an ingredient list read as a whole one is worse than
 * asking for a screenshot.
 */
export function captionHoldsRecipe(caption: string): boolean {
  const text = caption.trim();
  return text.length >= MIN_CAPTION_CHARS && !/(\.\.\.|…)$/.test(text);
}

/** Link-in-bio pages: a list of links, never the recipe itself. */
const LINK_PAGES = new Set([
  "linktr.ee",
  "beacons.ai",
  "stan.store",
  "linkin.bio",
  "lnk.bio",
  "bio.link",
]);

/**
 * The recipe page a caption points at, if it points at one.
 *
 * Many creators keep the recipe on their own site and put the address in the
 * caption ("RECIPE: https://www.inspiredtaste.net/12689/…"). That page is the
 * better source - real amounts and steps, usually with recipe markup - so it
 * is read in preference to the caption. Links back into TikTok or Instagram,
 * and link-in-bio pages, are skipped: none of them holds a recipe.
 */
export function recipeLinkInCaption(caption: string): string | null {
  for (const match of caption.matchAll(/https?:\/\/[^\s<>"'“”]+/g)) {
    // A sentence's own punctuation is not part of the address.
    const candidate = match[0].replace(/[.,;:!?)\]…]+$/, "");
    let host: string;
    try {
      host = new URL(candidate).hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      continue;
    }
    if (socialSite(candidate) || LINK_PAGES.has(host)) continue;
    return candidate;
  }
  return null;
}

export type TikTokCaption =
  | {
      ok: true;
      caption: string;
      /** The creator's display name, for the recipe's source line. */
      author: string | null;
      thumbnailUrl: string | null;
    }
  | { ok: false; error: string };

/**
 * The caption out of TikTok's link-preview description.
 *
 * TikTok writes it as `16.6K Likes, 219 Comments. TikTok video from Nico
 * Pallotta (@nico): "Easy Pearl Couscous Salad GET RECIPE: https://…".` -
 * the caption is what sits between the quotes. Anything not in that shape is
 * taken whole.
 */
export function captionFromPreview(description: string): {
  caption: string;
  author: string | null;
} {
  const author =
    description.match(/TikTok video from (.+?)\s*\(@/)?.[1]?.trim() ?? null;
  const quoted = description.match(/[“"]([\s\S]+)[”"]/)?.[1];
  return { caption: (quoted ?? description).trim(), author };
}

/**
 * A TikTok video's caption, from the preview TikTok publishes for it.
 *
 * TikTok's oEmbed endpoint stopped returning captions - it now answers with
 * a bare player - so this reads the description the video page publishes for
 * link previews, the same text iMessage and Slack show when a TikTok link is
 * pasted. It is usually the caption, sometimes cut short; whether what comes
 * back is worth reading is the caller's call.
 */
export async function fetchTikTokCaption(
  address: string,
  fetchImpl?: PageFetcher,
): Promise<TikTokCaption> {
  const page = await fetchPage(address, {
    timeoutMs: TIKTOK_TIMEOUT_MS,
    ...(fetchImpl ? { fetchImpl } : {}),
  });
  if (!page.ok) {
    return {
      ok: false,
      error:
        "TikTok didn't return that video. It may be private or deleted, or " +
        "TikTok may be busy. A screenshot of the caption, added below as a " +
        "photo, works too.",
    };
  }

  // The longest of the three: they are the same text, cut at different
  // lengths, when they differ at all.
  const description = ["og:description", "twitter:description", "description"]
    .map((name) => metaContent(page.html, name) ?? "")
    .sort((a, b) => b.length - a.length)[0];
  if (!description) return { ok: false, error: TIKTOK_NO_RECIPE };

  const { caption, author } = captionFromPreview(description);
  const image = metaContent(page.html, "og:image");
  return {
    ok: true,
    caption,
    author,
    thumbnailUrl: image?.startsWith("https://") ? image : null,
  };
}

/**
 * The link inside whatever a share sheet passed along.
 *
 * TikTok's share text is often a sentence with the link at the end ("Check
 * out this video! https://vm.tiktok.com/…"), and a Shortcut forwards it
 * whole. The first web address in it is the one meant; text with none is
 * passed on as it is, for the page's own check to answer.
 */
export function linkFromShare(text: string | null | undefined): string | null {
  const trimmed = (text ?? "").trim().slice(0, 2048);
  if (!trimmed) return null;
  return trimmed.match(/https?:\/\/[^\s<>"']+/)?.[0] ?? trimmed;
}
