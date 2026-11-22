import { describe, expect, it, vi } from "vitest";

import { PRINT_BRIDGE, printPage } from "@/lib/print-page";

describe("printPage", () => {
  it("uses the browser's print outside the app", () => {
    const print = vi.fn();
    printPage({ print });
    expect(print).toHaveBeenCalledOnce();
  });

  it("asks the app instead, and does not also print, inside it", () => {
    const print = vi.fn();
    const postMessage = vi.fn();
    printPage({
      print,
      webkit: { messageHandlers: { [PRINT_BRIDGE]: { postMessage } } },
    });
    expect(postMessage).toHaveBeenCalledOnce();
    expect(print).not.toHaveBeenCalled();
  });

  it("falls back to the browser when a different handler is the only one", () => {
    const print = vi.fn();
    printPage({
      print,
      webkit: {
        messageHandlers: { trivetShare: { postMessage: vi.fn() } },
      },
    });
    expect(print).toHaveBeenCalledOnce();
  });

  it("names the handler the app registers", () => {
    expect(PRINT_BRIDGE).toBe("trivetPrint");
  });
});
