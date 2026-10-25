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
   * Who the mail says it is from, in front of the verified address. Defaults
   * to the app's name. An invitation sets "Ben McOsker via Trivet", because a
   * stranger trusts a person they know before they trust a product - see
   * `from.ts`. Only the name varies; the address never does.
   */
  fromName?: string;
  /**
   * Plain text only, deliberately.
   *
   * Both emails this app sends - a password reset and an invitation - are a
   * link and a few sentences around it. HTML would mean a second copy of the
   * same words to keep in step, a template to render, and the part of email
   * that most reliably lands in spam. An invitation from a stranger's address
   * is already the mail most likely to be filtered; it does not need help.
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
