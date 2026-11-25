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

type Handler = { postMessage?: (message: unknown) => void } | undefined;
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

/** Ask the app to open the scanner. Returns false when there is no app. */
export function openScanner(win: BridgeWindow | undefined = here()): boolean {
  const target = handler(win);
  if (!target?.postMessage) return false;
  target.postMessage({ type: "open" });
  return true;
}
