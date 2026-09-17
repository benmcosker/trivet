import type { EmailSender, EmailSenderInfo } from "./types";

/**
 * Resend, over its REST API directly.
 *
 * No SDK, for the reason `sms/twilio.ts` gives: sending one message is a JSON
 * POST to one URL, and the official package pulls a dependency tree onto a
 * serverless function to wrap it. If this ever needs more of Resend than "send
 * a message", that trade is worth revisiting.
 *
 * This is not the same vendor as the texting, and that is a deliberate second
 * choice rather than the first. Twilio does sell email - it owns SendGrid, and
 * it is in the same console - which would have meant one account, one bill and
 * one credential to rotate. It is a thirty-day trial and then a monthly plan,
 * and this app sends password resets: a dozen a year, against a floor of about
 * twenty dollars a month. A second vendor on a free tier is the cheaper kind
 * of complexity.
 *
 * `EMAIL_FROM` has to be an address at a domain verified with Resend, which for
 * this deployment means trivetbox.com. An unverified sender is accepted by the
 * API and then not delivered, so it is treated as a credential here rather than
 * as a setting with a sensible default - a default would be a guess that fails
 * silently.
 */

const API = "https://api.resend.com/emails";

function credentials() {
  return {
    key: process.env.RESEND_API_KEY?.trim() ?? "",
    from: process.env.EMAIL_FROM?.trim() ?? "",
  };
}

export const resendSender: EmailSender = {
  info(): EmailSenderInfo {
    const { key, from } = credentials();
    const missing = [!key && "RESEND_API_KEY", !from && "EMAIL_FROM"].filter(
      Boolean,
    );

    return {
      id: "resend",
      label: "Resend",
      available: missing.length === 0,
      ...(missing.length > 0
        ? { unavailableReason: `Not configured: ${missing.join(", ")}.` }
        : {}),
    };
  },

  async send({ to, subject, text }) {
    const { key, from } = credentials();
    if (!key || !from) return { ok: false, error: "Email is not configured." };

    try {
      const response = await fetch(API, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from, to: [to], subject, text }),
      });

      if (response.ok) return { ok: true };

      // Resend's own message is the useful part - "domain is not verified",
      // "invalid from address" - and it names no secret, so it is worth passing
      // through rather than flattening to "failed".
      const failure: { message?: string } | null = await response
        .json()
        .then((json) => json as { message?: string })
        .catch(() => null);

      return {
        ok: false,
        error:
          failure?.message ??
          `Resend refused the message (${response.status}).`,
      };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error ? error.message : "Could not reach Resend.",
      };
    }
  },
};
