import { describe, expect, it, vi } from "vitest";

import { SCAN_BRIDGE, hasScanBridge, openScanner } from "@/lib/scan-bridge";

describe("scan bridge", () => {
  it("is absent in a browser, and opening does nothing", () => {
    expect(hasScanBridge({})).toBe(false);
    expect(hasScanBridge(undefined)).toBe(false);
    expect(openScanner({})).toBe(false);
  });

  it("asks the app to open the scanner over the handler it registers", () => {
    const postMessage = vi.fn();
    const win = {
      webkit: { messageHandlers: { [SCAN_BRIDGE]: { postMessage } } },
    };
    expect(hasScanBridge(win)).toBe(true);
    expect(openScanner(win)).toBe(true);
    expect(postMessage).toHaveBeenCalledWith({ type: "open" });
  });

  it("ignores a different handler, and names the one the app registers", () => {
    const win = {
      webkit: { messageHandlers: { trivetShare: { postMessage: vi.fn() } } },
    };
    expect(hasScanBridge(win)).toBe(false);
    expect(SCAN_BRIDGE).toBe("trivetScan");
  });
});
