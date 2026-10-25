import { SmsConsentSource } from "@/generated/prisma/enums";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";

import { prisma } from "./db";
import { emailAvailable, getEmailSender } from "./email";
import {
  RESET_TOKEN_TTL_SECONDS,
  resetPasswordEmail,
} from "./email/reset-password";
import { checkInvite, inviteRejectionMessage, redeemInvite } from "./invites";
import { APP_NAME } from "./legal";
import { parsePhone } from "./phone";

const SIGN_UP_PATH = "/sign-up/email";

function readInviteCode(body: unknown): string {
  if (typeof body !== "object" || body === null) return "";
  const code = (body as { inviteCode?: unknown }).inviteCode;
  return typeof code === "string" ? code.trim() : "";
}

function readPhone(body: unknown): string {
  if (typeof body !== "object" || body === null) return "";
  const phone = (body as { phone?: unknown }).phone;
  return typeof phone === "string" ? phone.trim() : "";
}

function readSmsConsent(body: unknown): boolean {
  if (typeof body !== "object" || body === null) return false;
  // Strictly true, never truthy: an absent field, an empty string or the
  // string "false" all mean nobody ticked anything, and the one interpretation
  // that must never be reached by accident is "they agreed".
  return (body as { smsConsent?: unknown }).smsConsent === true;
}

function readEmail(body: unknown): string {
  if (typeof body !== "object" || body === null) return "";
  const email = (body as { email?: unknown }).email;
  return typeof email === "string" ? email : "";
}

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    resetPasswordTokenExpiresIn: RESET_TOKEN_TTL_SECONDS,

    /*
     * Every other session ends when the password does.
     *
     * Sessions here last thirty days, so without this a reset leaves whoever
     * prompted it still signed in for a month - which is the one case the
     * feature exists for. The cost is that the person resetting is signed out
     * on their other devices, which is the correct surprise.
     */
    revokeSessionsOnPasswordReset: true,

    /**
     * How a reset link reaches the person who asked for one.
     *
     * Better Auth owns everything hard about this - issuing the token, storing
     * it, expiring it, and refusing to say whether an address has an account
     * at all. It hands over a finished URL and asks only that it be delivered.
     *
     * Two things are worth knowing here.
     *
     * The URL is built from `BETTER_AUTH_URL`. That variable is not in env.ts's
     * REQUIRED list, so a wrong value does not fail at startup - it produces
     * reset links pointing at an origin nobody is serving, and the only symptom
     * is people saying the link is broken. DEPLOYING.md says the same thing
     * about sign-in; this is the second thing it silently breaks.
     *
     * A send that fails is logged and swallowed rather than thrown. Throwing
     * here turns the endpoint's deliberately uninformative answer into a 500
     * for real addresses and a 200 for made-up ones, which hands back exactly
     * the account-enumeration oracle better-auth went to the trouble of
     * closing. The person is told to check their mail either way; the log is
     * where the truth lives.
     */
    sendResetPassword: async ({ user, url }) => {
      if (!emailAvailable()) {
        console.error(
          "[reset] no email provider configured, so a reset link was " +
            "requested and could not be delivered. Set RESEND_API_KEY and " +
            "EMAIL_FROM.",
        );
        return;
      }

      const { subject, text } = resetPasswordEmail({ url, brand: APP_NAME });
      const result = await getEmailSender().send({
        to: user.email,
        subject,
        text,
      });

      if (!result.ok) {
        console.error("[reset] could not send the link:", result.error);
      }
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  hooks: {
    // The recipe library is shared but not public: an account only exists
    // because someone already inside issued an invite. Signup is gated here
    // rather than by `disableSignUp`, which would block it outright and leave
    // no way in at all.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== SIGN_UP_PATH) return;

      const code = readInviteCode(ctx.body);
      if (!code) {
        throw new APIError("FORBIDDEN", {
          message: "An invite code is required to create an account.",
        });
      }

      const result = await checkInvite(code, readEmail(ctx.body));
      if (!result.ok) {
        throw new APIError("FORBIDDEN", {
          message: inviteRejectionMessage[result.reason],
        });
      }
    }),

    // Consume the invite once the account exists.
    //
    // Validation above is not enough on its own: two people racing the same
    // code would both pass it. `redeemInvite` settles that race atomically in
    // the database, and whoever loses has their just-created account removed -
    // an account that reached this point without consuming an invite is
    // exactly what the gate exists to prevent.
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== SIGN_UP_PATH) return;

      const userId = ctx.context.newSession?.user.id;
      if (!userId) return;

      const code = readInviteCode(ctx.body);

      // Redemption can fail two ways, and they need telling apart. Answering
      // false means somebody else got there first. Throwing means the database
      // refused - and the account still has to go, or the address it was
      // created with is held hostage: the same person retrying with the same
      // email is told it already exists, having never got an account at all.
      let redeemed = false;
      let failure: unknown = null;
      try {
        redeemed = code ? await redeemInvite(code, userId) : false;
      } catch (error) {
        failure = error;
      }

      if (redeemed) {
        // Optional, and stored after the account is safely its own. A number
        // that will not parse is dropped rather than refused: it buys one
        // convenience, and losing a whole signup over a typo in a field nobody
        // had to fill in would be a poor trade. It can be set on the household
        // page afterwards, where a mistake can actually be seen and corrected.
        const phone = parsePhone(readPhone(ctx.body));
        if (phone.ok) {
          // The tick is only honoured alongside a number that parsed. Consent
          // recorded against a number the app failed to store would be a
          // permission to text nobody, and it would read in an audit as an
          // opt-in with nothing behind it.
          const consented = readSmsConsent(ctx.body);
          await prisma.user
            .update({
              where: { id: userId },
              data: {
                phone: phone.e164,
                ...(consented
                  ? {
                      smsConsentAt: new Date(),
                      smsConsentSource: SmsConsentSource.CHECKBOX,
                    }
                  : {}),
              },
            })
            .catch((error) => {
              console.error("[signup] could not store phone", error);
            });
        }
        return;
      }

      await prisma.user.delete({ where: { id: userId } }).catch(() => {
        // Already gone, or never committed. Either way the account is not
        // usable and the error below is still the right answer.
      });

      if (failure) {
        // The only record of what actually happened: better-auth turns this
        // into a status code, and the person signing up cannot be shown a
        // database error.
        console.error("[invite] redemption failed", failure);
        throw new APIError("INTERNAL_SERVER_ERROR", {
          message: "Something went wrong setting that account up. Try again.",
        });
      }

      throw new APIError("FORBIDDEN", {
        message: "That invite has already been used.",
      });
    }),
  },
});

export type Session = typeof auth.$Infer.Session;
