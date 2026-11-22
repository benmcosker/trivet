/**
 * Print the page, in the browser or in the iPhone app.
 *
 * `window.print()` does nothing inside the app's web view, so there the page
 * asks the app to open the iPhone's print sheet instead
 * (`ios/TrivetBox/TrivetBox/PrintBridge.swift`). Anywhere else it is the
 * browser's own print. The page's `@media print` rules apply either way.
 */

/** Must match `PrintBridge.name` in the app. */
export const PRINT_BRIDGE = "trivetPrint";

type PrintWindow = {
  print: () => void;
  webkit?: {
    messageHandlers?: Record<
      string,
      { postMessage?: (message: unknown) => void } | undefined
    >;
  };
};

export function printPage(win: PrintWindow = window as PrintWindow): void {
  const bridge = win.webkit?.messageHandlers?.[PRINT_BRIDGE];
  if (bridge?.postMessage) {
    bridge.postMessage({});
    return;
  }
  win.print();
}
