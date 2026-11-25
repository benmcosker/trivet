/**
 * Opening the iPhone's document scanner from the upload page.
 *
 * Only the app can scan a card with edge detection and several pages
 * (VisionKit); a web page can only take a snapshot. So inside the app the upload
 * page offers a "Scan a card" button, which posts here over
 * `window.webkit.messageHandlers.trivetScan`
 * (ios/TrivetBox/TrivetBox/ScanBridge.swift). The app scans, saves the pages
 * where a share would be left, and reloads `/upload?shared=1`, which the page
 * already reads over the share bridge (`shared-item.ts`).
 *
 * In a browser there is no handler: `hasScanBridge()` is false and the button
 * is not shown.
 */

/** Must match `ScanBridge.name` in the app. */
export const SCAN_BRIDGE = "trivetScan";

type Handler = { postMessage?: (message: unknown) => unknown } | undefined;
type BridgeWindow = {
  webkit?: { messageHandlers?: Record<string, Handler> };
};

function handler(win: BridgeWindow | undefined): Handler {
  return win?.webkit?.messageHandlers?.[SCAN_BRIDGE];
}

const here = (): BridgeWindow | undefined =>
  typeof window === "undefined" ? undefined : (window as BridgeWindow);

/** Whether the app is running this page and can scan. */
export function hasScanBridge(win: BridgeWindow | undefined = here()): boolean {
  return Boolean(handler(win)?.postMessage);
}

/**
 * How a scan ended:
 * - `scanned`: it was left for the page, and the app is bringing
 *   `/upload?shared=1` forward to read it.
 * - `cancelled`: the person closed the scanner. Also what an app from before
 *   the scanner answered says, since its handler answered nothing.
 * - `unavailable`: there is no app here to ask.
 */
export type ScanOutcome = "scanned" | "cancelled" | "unavailable";

/**
 * Open the app's scanner and wait for it to finish. Throws with the app's
 * own sentence when the scan fails - the scanner broke, too many pages, it
 * could not be saved - which the page shows as it is.
 */
export async function openScanner(
  win: BridgeWindow | undefined = here(),
): Promise<ScanOutcome> {
  const target = handler(win);
  if (!target?.postMessage) return "unavailable";
  const answer = await target.postMessage({ type: "open" });
  return answer && typeof answer === "object" && "scanned" in answer
    ? "scanned"
    : "cancelled";
}
