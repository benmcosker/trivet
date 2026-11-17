import * as Sentry from "@sentry/nextjs";

/**
 * A failure the app caught and survived, reported anyway.
 *
 * These are the ones that matter most and were the easiest to miss: a photo
 * that would not upload, a list that would not text, an invitation that
 * never sent. Each was caught so the person sees a sentence instead of a
 * crash - which also meant nothing but a line in the server log, which
 * nobody reads until somebody complains. Now each is also an issue in
 * Sentry, grouped and alerting like a crash.
 *
 * The message keeps the log's own prefix ("[sms] could not text the
 * shopping list"), and the part in brackets becomes the `area` tag, so
 * Sentry can be filtered to one feature. Without a DSN this is the log line
 * it always was.
 */
export function reportError(message: string, error?: unknown): void {
  if (error === undefined) console.error(message);
  else console.error(message, error);

  const area = /^\[([^\]]+)\]/.exec(message)?.[1] ?? "trivet";
  const exception =
    error instanceof Error
      ? error
      : new Error(
          error === undefined ? message : `${message}: ${String(error)}`,
        );

  Sentry.captureException(exception, {
    tags: { area, handled: "yes" },
    contexts: { failure: { what: message } },
  });
}
