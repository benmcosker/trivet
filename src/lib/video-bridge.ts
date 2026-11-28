/**
 * Importing a recipe from a video the person has, on the iPhone.
 *
 * Trivet does not scrape Instagram or TikTok. Instead the person screen-records a
 * reel (or picks a cooking video from Photos), and the app reads it on the
 * phone: the words on screen, with Vision, and the spoken words, with the
 * system's on-device speech recognition. The upload page's "From a video"
 * button posts here over `window.webkit.messageHandlers.trivetVideo`
 * (ios/TrivetBox/TrivetBox/VideoBridge.swift). The person sees what was read and
 * can correct it, and the app then leaves it where a share would be left and
 * brings `/upload?shared=1` forward, which reads it like a share. See
 * REEL-IMPORT-PLAN.md in the plans repo.
 *
 * In a browser there is no handler: `hasVideoBridge()` is false and the button is
 * not shown.
 */

/** Must match `VideoBridge.name` in the app. */
export const VIDEO_BRIDGE = "trivetVideo";

type Handler = { postMessage?: (message: unknown) => unknown } | undefined;
type BridgeWindow = {
  webkit?: { messageHandlers?: Record<string, Handler> };
};

function handler(win: BridgeWindow | undefined): Handler {
  return win?.webkit?.messageHandlers?.[VIDEO_BRIDGE];
}

const here = (): BridgeWindow | undefined =>
  typeof window === "undefined" ? undefined : (window as BridgeWindow);

/** Whether the app is running this page and can read a video. */
export function hasVideoBridge(
  win: BridgeWindow | undefined = here(),
): boolean {
  return Boolean(handler(win)?.postMessage);
}

/**
 * How it ended:
 * - `imported`: the person approved what was read, it was left for the page, and
 *   the app is bringing `/upload?shared=1` forward.
 * - `cancelled`: the person closed the picker or the review.
 * - `unavailable`: there is no app here to ask.
 */
export type VideoOutcome = "imported" | "cancelled" | "unavailable";

/**
 * Open the app's video picker and wait. Throws with the app's own sentence when
 * it fails (a video that is too long, one that cannot be opened), which the page
 * shows as it is.
 */
export async function importFromVideo(
  win: BridgeWindow | undefined = here(),
): Promise<VideoOutcome> {
  const target = handler(win);
  if (!target?.postMessage) return "unavailable";
  const answer = await target.postMessage({ type: "open" });
  return answer && typeof answer === "object" && "imported" in answer
    ? "imported"
    : "cancelled";
}
