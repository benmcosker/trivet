/**
 * The one email this app sends.
 *
 * Kept apart from the transport for the same reason `sms/message.ts` is: what
 * the mail says is a question about this app, and it is the half worth testing
 * without a network. The adapter's job ends at "deliver these bytes".
 *
 * Import-free, so a test can reach it without standing up Prisma.
 */

/** How long a reset link is good for. Better Auth's own default, said out loud. */
export const RESET_TOKEN_TTL_SECONDS = 60 * 60;

/**
 * Written to be read on a phone by somebody who is already annoyed.
 *
 * The expiry is stated because a link that has quietly gone stale is
 * indistinguishable from one that never worked, and "it didn't work" is the
 * report you get either way. The did-not-ask line is there because this is the
 * one message the app sends to an address without the account holder having
 * done anything in the app first - the only mail here that a stranger could
 * cause to arrive.
 */
export function resetPasswordEmail({
  url,
  brand,
  ttlSeconds = RESET_TOKEN_TTL_SECONDS,
}: {
  url: string;
  /** What to sign it as. The display name, not the SMS campaign name. */
  brand: string;
  ttlSeconds?: number;
}): { subject: string; text: string } {
  const hours = Math.round(ttlSeconds / 3600);
  const window =
    ttlSeconds < 3600
      ? `${Math.round(ttlSeconds / 60)} minutes`
      : `${hours} hour${hours === 1 ? "" : "s"}`;

  return {
    subject: `Reset your ${brand} password`,
    text: [
      `Someone asked to reset the password on your ${brand} account.`,
      "",
      "Open this link to choose a new one:",
      url,
      "",
      `The link works once, and stops working after ${window}.`,
      "",
      "If this was not you, nothing has changed and you can ignore this. " +
        "Your password stays as it is until the link above is used.",
    ].join("\n"),
  };
}
