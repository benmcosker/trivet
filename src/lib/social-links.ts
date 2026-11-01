/**
 * Recipes found on Instagram and TikTok.
 *
 * Neither will share a post's caption with another app. Both answer a server
 * with a login wall or a page with no caption in it, Instagram's oEmbed needs
 * a reviewed Meta app and returns no caption even then, and TikTok's oEmbed
 * and link-preview text came back empty when tried. So a link to either is
 * not read: it is answered at once with what does work - a screenshot of the
 * caption, uploaded as a photo, which the image import reads like any card.
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

/** What to say when somebody pastes a link Trivet cannot read. */
export function socialAdvice(site: SocialSite): string {
  const name = site === "instagram" ? "Instagram" : "TikTok";
  return (
    `${name} doesn't share captions with other apps, so Trivet can't read ` +
    `that link. Take a screenshot of the caption and add it below as a photo.`
  );
}

/**
 * The link inside whatever a share sheet passed along.
 *
 * Some apps share a sentence with the link at the end ("Check out this
 * recipe! https://…"), and a Shortcut forwards it whole. The first web
 * address in it is the one meant; text with none is passed on as it is, for
 * the page's own check to answer.
 */
export function linkFromShare(text: string | null | undefined): string | null {
  const trimmed = (text ?? "").trim().slice(0, 2048);
  if (!trimmed) return null;
  return trimmed.match(/https?:\/\/[^\s<>"']+/)?.[0] ?? trimmed;
}
