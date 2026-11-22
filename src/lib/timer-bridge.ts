/**
 * Telling the iPhone app about a timer, so it can notify when the page cannot.
 *
 * A web page is suspended the moment the phone locks, so a timer running in it
 * cannot ring. The app can: it schedules a local notification for the end time
 * (`ios/TrivetBox/TrivetBox/TimerBridge.swift`). In a browser there is no such
 * handler, and every call here is a no-op.
 *
 * Messages are idempotent on `id`: scheduling again replaces the pending
 * notification, which is what restoring a timer or adding a minute needs, and
 * cancelling one that is not pending does nothing.
 */

/** Must match `TimerBridge.name` in the app. */
export const TIMER_BRIDGE = "trivetTimer";

type Handler = { postMessage?: (message: unknown) => void } | undefined;
type BridgeWindow = {
  webkit?: { messageHandlers?: Record<string, Handler> };
};

function handler(win: BridgeWindow | undefined): Handler {
  return win?.webkit?.messageHandlers?.[TIMER_BRIDGE];
}

/** Whether the app is running this page, for wording that depends on it. */
export function hasTimerBridge(
  win: BridgeWindow | undefined = typeof window === "undefined"
    ? undefined
    : (window as BridgeWindow),
): boolean {
  return Boolean(handler(win)?.postMessage);
}

export function scheduleNativeTimer(
  timer: { id: string; at: number; title: string; body: string },
  win: BridgeWindow | undefined = typeof window === "undefined"
    ? undefined
    : (window as BridgeWindow),
): void {
  handler(win)?.postMessage?.({ type: "schedule", ...timer });
}

export function cancelNativeTimer(
  id: string,
  win: BridgeWindow | undefined = typeof window === "undefined"
    ? undefined
    : (window as BridgeWindow),
): void {
  handler(win)?.postMessage?.({ type: "cancel", id });
}
