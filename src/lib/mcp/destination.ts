/**
 * Where approving an assistant actually sends the person, for the consent
 * screen.
 *
 * Anyone can register an assistant and call it anything, "Claude" included,
 * and its name and website are whatever the registrant typed. The one thing
 * Trivet can vouch for is the callback address the sign-in code goes to:
 * Better Auth only accepts a callback the assistant registered, and the
 * request carrying it is signed. So the consent screen names that address,
 * and says so plainly when it isn't one of the assistants people mean.
 */

/**
 * `hosts` match the host or any subdomain of it. `exact` match only that
 * host: Gemini returns through Google's account-linking callback,
 * oauth-redirect.googleusercontent.com, and other googleusercontent.com
 * hosts serve anyone's content, so nothing beside it may count.
 */
const KNOWN: { name: string; hosts: string[]; exact?: string[] }[] = [
  { name: "Claude", hosts: ["claude.ai", "claude.com"] },
  { name: "ChatGPT", hosts: ["chatgpt.com", "chat.openai.com"] },
  {
    name: "Gemini",
    hosts: ["gemini.google.com"],
    exact: ["oauth-redirect.googleusercontent.com"],
  },
];

const LOCAL = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export type Destination =
  /** One of the assistants Trivet supports, at its own address. */
  | { kind: "known"; host: string; assistant: string }
  /** A tool on the person's own computer: Claude Code, Cursor, an inspector. */
  | { kind: "local" }
  /** Somewhere else: shown, with a warning. */
  | { kind: "other"; host: string }
  /** No usable address: the screen refuses to continue. */
  | { kind: "missing" };

export function destinationOf(redirectUri: string | undefined): Destination {
  if (!redirectUri) return { kind: "missing" };
  let url: URL;
  try {
    url = new URL(redirectUri);
  } catch {
    return { kind: "missing" };
  }
  const host = url.hostname.toLowerCase();
  if (LOCAL.has(host)) return { kind: "local" };
  if (url.protocol !== "https:") return { kind: "other", host };
  const known = KNOWN.find(
    (entry) =>
      entry.exact?.includes(host) ||
      entry.hosts.some((h) => host === h || host.endsWith(`.${h}`)),
  );
  return known
    ? { kind: "known", host, assistant: known.name }
    : { kind: "other", host };
}

/**
 * The name of a supported assistant that a registrant's chosen name claims
 * to be, if any: "Claude", "ChatGPT for Trivet" and "gemini" all claim one.
 */
export function claimedAssistant(name: string): string | null {
  const lower = name.toLowerCase();
  if (/\bclaude\b/.test(lower)) return "Claude";
  if (/chat\s*gpt|openai/.test(lower)) return "ChatGPT";
  // Gemini registers itself as "Google".
  if (/\bgemini\b|\bgoogle\b/.test(lower)) return "Gemini";
  return null;
}

/**
 * True when the name claims a supported assistant that the destination does
 * not belong to: the shape of someone pretending.
 */
export function looksLikeImpersonation(
  name: string,
  destination: Destination,
): boolean {
  const claimed = claimedAssistant(name);
  if (!claimed) return false;
  if (destination.kind === "local") return false;
  return destination.kind !== "known" || destination.assistant !== claimed;
}
