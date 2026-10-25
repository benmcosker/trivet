/**
 * The From line: a display name in front of the one verified address.
 *
 * `EMAIL_FROM` was set as a bare `info@trivetbox.com`, and Gmail shows a bare
 * address by its local part - so every mail arrived from "info", with a red
 * "I" for an avatar. For the invitation that undid the point of the subject
 * line: it leads with the inviter's name because "Ben invited you" reads as a
 * message, and then the sender column said "info", which reads as phishing.
 *
 * Only the display name ever varies. The address stays whatever `EMAIL_FROM`
 * names, on the domain verified with Resend; a different domain would fail
 * verification and go to spam, while a display name costs nothing.
 *
 * Import-free, so a test can reach it without standing up the transport.
 */

/** Long enough for any real name and "via Trivet"; short of a sentence. */
const MAX_DISPLAY_NAME = 64;

/**
 * The address part of `EMAIL_FROM`, whether it was set bare
 * (`info@trivetbox.com`) or already with a name (`Trivet <info@...>`).
 * Either way the name here wins, so the env var cannot override what a
 * particular mail says it is from.
 */
export function fromAddress(emailFrom: string): string {
  const bracketed = emailFrom.match(/<([^<>]+)>/);
  return (bracketed ? bracketed[1] : emailFrom).trim();
}

/**
 * Make a display name safe to put in a header.
 *
 * The name can be a member's own - whatever they typed at sign-up - so it is
 * treated as untrusted. Line breaks and other control characters go, because
 * a newline in a header is how a header injection starts; quotes, angle
 * brackets and backslashes go, because they are the syntax of the From line
 * itself and a name containing them could rewrite where it says the mail is
 * from. Resend's API takes `from` as a JSON field rather than a raw header,
 * which blunts the injection case, but this does not rely on that.
 */
export function cleanDisplayName(name: string): string {
  return name
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/["<>\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_DISPLAY_NAME)
    .trim();
}

/** `"Display Name" <address>`, or the bare address if no name survives. */
export function fromHeader(emailFrom: string, displayName: string): string {
  const address = fromAddress(emailFrom);
  const name = cleanDisplayName(displayName);
  return name ? `"${name}" <${address}>` : address;
}
