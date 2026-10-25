/**
 * The invitation, as an email.
 *
 * Kept apart from the transport for the same reason `reset-password.ts` is:
 * what the mail says is a question about this app, and the half worth
 * testing without a network.
 *
 * Import-free, so a test can reach it without standing up Prisma.
 */

export type InviteEmailKind = "family" | "outside";

/**
 * Written for somebody who has never heard of the app, opening it because a
 * person they know sent it.
 *
 * So it leads with that person's name rather than the product's: "Ben invited
 * you" is a message, "You've been invited to Trivet" is a newsletter, and the
 * second is the one that gets filtered. It says what joining actually does,
 * because the two kinds of invite do very different things - one hands over a
 * household's whole library, the other starts an empty one - and somebody
 * deciding whether to click deserves to know which.
 *
 * The expiry is stated for the reason the reset mail states it: a link that
 * has gone stale looks exactly like one that never worked. And the ignore line
 * is there because, like the reset mail, this reaches an address whose owner
 * has done nothing in the app - it is the other mail here a stranger could be
 * the cause of.
 */
export function inviteEmail({
  link,
  brand,
  inviterName,
  kind,
  householdName,
  expiresInDays,
}: {
  link: string;
  /** What to sign it as. The display name, not the SMS campaign name. */
  brand: string;
  inviterName: string;
  kind: InviteEmailKind;
  /** The new household's name, for an outside invite where one was chosen. */
  householdName?: string | null;
  expiresInDays: number;
}): { subject: string; text: string } {
  const who = inviterName.trim() || "Someone";

  const what =
    kind === "family"
      ? `${who} has invited you to join their household on ${brand}, ` +
        "a shared recipe box, weekly meal planner and shopping list. " +
        "You'll see their recipes and plan the week together."
      : `${who} has invited you to start your own recipe box on ${brand}` +
        (householdName?.trim() ? `, as ${householdName.trim()}` : "") +
        ". It's a recipe box, weekly meal planner and shopping list - " +
        "yours to fill.";

  return {
    subject: `${who} invited you to ${brand}`,
    text: [
      what,
      "",
      "Open this link to create your account:",
      link,
      "",
      // "Only for this email address" because an emailed invite is always
      // locked to the address it went to - the same field does both - and
      // somebody signing up from another one is otherwise turned away after
      // filling in the whole form.
      "The invitation works once, only for this email address, and stops " +
        `working after ${expiresInDays} ` +
        `day${expiresInDays === 1 ? "" : "s"}.`,
      "",
      `If you don't know ${who === "Someone" ? "who sent this" : who}, ` +
        "you can ignore this email. Nothing happens unless the link is used.",
    ].join("\n"),
  };
}
