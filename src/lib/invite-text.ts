/**
 * The text an invite goes out as, and the link that opens it in Messages.
 *
 * Sent from the inviter's own phone, never from Trivet's number. That is not
 * a technical preference. Trivet's texting is registered with the carriers
 * for one purpose - the shopping list, to members who ticked a box agreeing
 * to it - and the public page that registration points at (`/sms`) promises
 * a member only ever enters their own number, "never anybody else's". An
 * invitee is, by definition, somebody who has agreed to nothing yet.
 * Texting them from the app's number would break that registration and the
 * promise with it, and the number that went down would be the one the
 * shopping lists go out on.
 *
 * From the inviter's phone it is simply one person texting another, which
 * needs no registration and no consent record - and arrives as a message
 * from somebody they know rather than from an unknown number, which is the
 * difference between being opened and being filtered.
 *
 * No server imports, so the household page's client component can use it.
 */

export type InviteTextKind = "family" | "outside";

/**
 * What the text says. Short, because it is pre-written into somebody else's
 * conversation and they will edit it if it does not sound like them.
 *
 * The code is not repeated beside the link: the sign-up page reads it out of
 * the address and fills it in, so a second copy is only something to mistype.
 */
export function inviteMessage(link: string, kind: InviteTextKind): string {
  return kind === "family"
    ? `Join our recipe box on Trivet: ${link}`
    : `Start your own recipe box on Trivet: ${link}`;
}

/**
 * An `sms:` link that opens Messages with the text written and no recipient,
 * so the inviter picks the contact themselves.
 *
 * `sms:?&body=` is the one spelling both platforms read. iOS has historically
 * wanted the body after `&`, Android after `?`; the empty query with a
 * leading `&` satisfies both, and is what the rest of the web settled on.
 */
export function smsHref(body: string): string {
  return `sms:?&body=${encodeURIComponent(body)}`;
}
