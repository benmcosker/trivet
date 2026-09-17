import type { EmailSender, EmailSenderInfo } from "./types";

/**
 * The sender used when no credentials exist: writes the message to the log and
 * reports success.
 *
 * For development, where the whole flow - the link, its expiry, what the mail
 * reads like - is worth exercising without a mail account. It deliberately does
 * *not* declare itself available, so it can never stand in for the real one in
 * production and leave somebody waiting for a reset link that went to a log
 * file they will never read.
 *
 * That guard matters more here than it does for texting. A shopping list that
 * silently fails is an inconvenience; a password reset that silently fails is
 * somebody locked out of the app with no way to tell whether to keep waiting.
 */
export const consoleEmailSender: EmailSender = {
  info(): EmailSenderInfo {
    return {
      id: "console",
      label: "Log only (development)",
      available: false,
      unavailableReason:
        "No email provider is configured, so messages are only written to " +
        "the server log.",
    };
  },

  async send({ to, subject, text }) {
    console.log(`[email] to ${to}\nsubject: ${subject}\n\n${text}\n`);
    return { ok: true };
  },
};
