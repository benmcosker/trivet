import type { EmailSender, EmailSenderInfo } from "./types";

/**
 * Twilio Email, over the SendGrid REST API directly.
 *
 * Same vendor as the texting, which is the whole reason it is this one: the
 * account, the billing and the credential rotation are already here, and a
 * second mail vendor would have meant a second row in lifecycle.json and a
 * second thing to forget. `sms/twilio.ts` is its sibling and this follows its
 * shape deliberately.
 *
 * No SDK, for the reason that file gives: sending one message is a JSON POST
 * to one URL, and the official package pulls a dependency tree onto a
 * serverless function to wrap it.
 *
 * The API is SendGrid's - Twilio acquired it and has since folded it into the
 * console as "Email", but the endpoint, the key format and the payload are
 * SendGrid's own. The key is **not** the Twilio auth token: it is made under
 * Email -> Settings -> API Keys, starts with `SG.`, and only needs Mail Send
 * permission.
 *
 * `EMAIL_FROM` has to be at a domain authenticated under Email -> Domains.
 * An unauthenticated sender is accepted by the API and then not delivered, so
 * it is treated as a credential here rather than as a setting with a default -
 * a default would be a guess that fails silently.
 */

const API = "https://api.sendgrid.com/v3/mail/send";

function credentials() {
  return {
    key: process.env.TWILIO_EMAIL_API_KEY?.trim() ?? "",
    from: process.env.EMAIL_FROM?.trim() ?? "",
  };
}

export const twilioEmailSender: EmailSender = {
  info(): EmailSenderInfo {
    const { key, from } = credentials();
    const missing = [
      !key && "TWILIO_EMAIL_API_KEY",
      !from && "EMAIL_FROM",
    ].filter(Boolean);

    return {
      id: "twilio-email",
      label: "Twilio Email",
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
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: from },
          subject,
          content: [{ type: "text/plain", value: text }],
        }),
      });

      // 202 Accepted, not 200, and with an empty body - the mail is queued
      // rather than sent by the time this returns. `response.ok` covers the
      // whole 2xx range, so this needs no special case; it is written down
      // because a check for `=== 200` here would reject every success.
      if (response.ok) return { ok: true };

      /*
       * SendGrid's own message is the useful part - "The from address does not
       * match a verified Sender Identity", "Permission denied, wrong
       * credentials" - and it names no secret, so it is worth passing through
       * rather than flattening to "failed". Several can come back at once;
       * they are joined rather than having the first one picked, because the
       * second is often the one that explains the first.
       */
      const failure: { errors?: { message?: string }[] } | null = await response
        .json()
        .then((json) => json as { errors?: { message?: string }[] })
        .catch(() => null);

      const messages = (failure?.errors ?? [])
        .map((e) => e.message)
        .filter((m): m is string => Boolean(m));

      return {
        ok: false,
        error: messages.length
          ? messages.join(" ")
          : `Twilio Email refused the message (${response.status}).`,
      };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Could not reach Twilio Email.",
      };
    }
  },
};
