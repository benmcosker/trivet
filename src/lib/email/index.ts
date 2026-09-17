import { consoleEmailSender } from "./console";
import { resendSender } from "./resend";
import type { EmailSender } from "./types";

/**
 * Whether the log-only sender counts as a working one.
 *
 * Without this the console sender is unreachable, which makes it useless: the
 * reset flow is gated on being able to send, so in development - where nobody
 * has a Resend account - the link never appears and the flow cannot be
 * exercised at all. Same reasoning, and same shape, as SMS_LOG_ONLY.
 *
 * Refused outright in production, whatever the variable says. The failure this
 * guards against is somebody sitting locked out waiting for a mail that only
 * ever reached a log.
 */
function logOnlyEnabled(): boolean {
  return (
    process.env.EMAIL_LOG_ONLY === "true" &&
    process.env.NODE_ENV !== "production"
  );
}

/**
 * The sender this deployment will use.
 *
 * Resolved per call rather than at module load, because the environment is
 * read at runtime and a module cached from build time would answer for the
 * wrong one.
 */
export function getEmailSender(): EmailSender {
  return resendSender.info().available ? resendSender : consoleEmailSender;
}

/** Whether this deployment can deliver a mail anywhere worth calling sent. */
export function emailAvailable(): boolean {
  return resendSender.info().available || logOnlyEnabled();
}

export * from "./types";
export { resendSender, consoleEmailSender };
