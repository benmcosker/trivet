/**
 * How an email gets sent, and what is known when it does not.
 *
 * The same shape as src/lib/sms: an adapter that can describe its own
 * availability, so a feature with no credentials is absent from the UI rather
 * than present and broken. Two transports now, and the reason for the seam is
 * the same one it was for texting - the thing that must not happen is the app
 * believing a message went out when it only went to a log.
 */

export type EmailMessage = {
  to: string;
  subject: string;
  /**
   * Plain text only, deliberately.
   *
   * The one email this app sends is a link and two sentences around it. HTML
   * would mean a second copy of the same words to keep in step, a template to
   * render, and the part of email that most reliably lands in spam.
   */
  text: string;
};

export type EmailSenderInfo = {
  id: string;
  label: string;
  /** False when the sender has not been given what it needs to send. */
  available: boolean;
  /** Why not, when it is not. Shown to whoever can do something about it. */
  unavailableReason?: string;
};

export type EmailSendResult = { ok: true } | { ok: false; error: string };

export type EmailSender = {
  info(): EmailSenderInfo;
  send(message: EmailMessage): Promise<EmailSendResult>;
};
