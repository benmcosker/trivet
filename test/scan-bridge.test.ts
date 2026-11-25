import { describe, expect, it, vi } from "vitest";

import { SCAN_BRIDGE, hasScanBridge, openScanner } from "@/lib/scan-bridge";

const withHandler = (postMessage: (message: unknown) => unknown) => ({
  webkit: { messageHandlers: { [SCAN_BRIDGE]: { postMessage } } },
});

describe("scan bridge", () => {
  it("is absent in a browser, and opening does nothing", async () => {
    expect(hasScanBridge({})).toBe(false);
    expect(hasScanBridge(undefined)).toBe(false);
    expect(await openScanner({})).toBe("unavailable");
  });

  it("asks the app to open the scanner over the handler it registers", async () => {
    const postMessage = vi.fn(async () => ({ scanned: true }));
    const win = withHandler(postMessage);
    expect(hasScanBridge(win)).toBe(true);
    expect(await openScanner(win)).toBe("scanned");
    expect(postMessage).toHaveBeenCalledWith({ type: "open" });
  });

  it("reads a closed scanner as cancelled", async () => {
    expect(await openScanner(withHandler(async () => null))).toBe("cancelled");
  });

  it("treats an app that answers nothing (before it could) as cancelled", async () => {
    expect(await openScanner(withHandler(() => undefined))).toBe("cancelled");
  });

  it("passes the app's own reason on when a scan fails", async () => {
    const win = withHandler(async () => {
      throw new Error("That's 7 pages, and one recipe can take 6.");
    });
    await expect(openScanner(win)).rejects.toThrow("one recipe can take 6");
  });

  it("ignores a different handler, and names the one the app registers", () => {
    const win = {
      webkit: { messageHandlers: { trivetShare: { postMessage: vi.fn() } } },
    };
    expect(hasScanBridge(win)).toBe(false);
    expect(SCAN_BRIDGE).toBe("trivetScan");
  });
});
