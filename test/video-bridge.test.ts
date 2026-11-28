import { describe, expect, it, vi } from "vitest";

import {
  VIDEO_BRIDGE,
  hasVideoBridge,
  importFromVideo,
} from "@/lib/video-bridge";

const withHandler = (postMessage: (message: unknown) => unknown) => ({
  webkit: { messageHandlers: { [VIDEO_BRIDGE]: { postMessage } } },
});

describe("video bridge", () => {
  it("is absent in a browser, and importing does nothing", async () => {
    expect(hasVideoBridge({})).toBe(false);
    expect(hasVideoBridge(undefined)).toBe(false);
    expect(await importFromVideo({})).toBe("unavailable");
  });

  it("asks the app to open its picker over the handler it registers", async () => {
    const postMessage = vi.fn(async () => ({ imported: true }));
    const win = withHandler(postMessage);
    expect(hasVideoBridge(win)).toBe(true);
    expect(await importFromVideo(win)).toBe("imported");
    expect(postMessage).toHaveBeenCalledWith({ type: "open" });
  });

  it("reads a closed picker or review as cancelled", async () => {
    expect(await importFromVideo(withHandler(async () => null))).toBe(
      "cancelled",
    );
    expect(await importFromVideo(withHandler(() => undefined))).toBe(
      "cancelled",
    );
  });

  it("passes the app's own reason on when it fails", async () => {
    const win = withHandler(async () => {
      throw new Error("That video is 5 minutes long.");
    });
    await expect(importFromVideo(win)).rejects.toThrow("5 minutes");
  });

  it("ignores a different handler, and names the one the app registers", () => {
    const win = {
      webkit: { messageHandlers: { trivetScan: { postMessage: vi.fn() } } },
    };
    expect(hasVideoBridge(win)).toBe(false);
    expect(VIDEO_BRIDGE).toBe("trivetVideo");
  });
});
