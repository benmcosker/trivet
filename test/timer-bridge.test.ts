import { describe, expect, it, vi } from "vitest";

import {
  TIMER_BRIDGE,
  cancelNativeTimer,
  hasTimerBridge,
  scheduleNativeTimer,
} from "@/lib/timer-bridge";

const timer = {
  id: "r:1",
  at: 1_000,
  title: "Pearl Onions",
  body: "Step 3: 5 min is up.",
};

describe("timer bridge", () => {
  it("does nothing, and says so, in a browser", () => {
    expect(hasTimerBridge({})).toBe(false);
    expect(() => scheduleNativeTimer(timer, {})).not.toThrow();
    expect(() => cancelNativeTimer("r:1", {})).not.toThrow();
    expect(hasTimerBridge(undefined)).toBe(false);
  });

  it("schedules and cancels over the handler the app registers", () => {
    const postMessage = vi.fn();
    const win = {
      webkit: { messageHandlers: { [TIMER_BRIDGE]: { postMessage } } },
    };
    expect(hasTimerBridge(win)).toBe(true);
    scheduleNativeTimer(timer, win);
    cancelNativeTimer("r:1", win);
    expect(postMessage).toHaveBeenNthCalledWith(1, {
      type: "schedule",
      ...timer,
    });
    expect(postMessage).toHaveBeenNthCalledWith(2, {
      type: "cancel",
      id: "r:1",
    });
  });

  it("ignores a different handler, and names the one the app registers", () => {
    const win = {
      webkit: { messageHandlers: { trivetShare: { postMessage: vi.fn() } } },
    };
    expect(hasTimerBridge(win)).toBe(false);
    expect(TIMER_BRIDGE).toBe("trivetTimer");
  });
});
