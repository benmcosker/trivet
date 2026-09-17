import { afterEach, describe, expect, it, vi } from "vitest";

import {
  consoleEmailSender,
  emailAvailable,
  getEmailSender,
} from "@/lib/email";
import { twilioEmailSender } from "@/lib/email/twilio";
import {
  RESET_TOKEN_TTL_SECONDS,
  resetPasswordEmail,
} from "@/lib/email/reset-password";

const LINK = "https://trivetbox.com/api/auth/reset-password/abc123";

function withEnv(env: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) vi.stubEnv(key, "");
    else vi.stubEnv(key, value);
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the reset email", () => {
  it("carries the link, and says the link is the point", () => {
    const { subject, text } = resetPasswordEmail({
      url: LINK,
      brand: "Trivet",
    });
    expect(subject).toBe("Reset your Trivet password");
    expect(text).toContain(LINK);
  });

  /*
   * A link that has quietly gone stale is indistinguishable from one that
   * never worked, and "it didn't work" is the report you get either way. So
   * the window is stated, and stated in the units a person thinks in.
   */
  it("says how long it is good for, in hours", () => {
    const { text } = resetPasswordEmail({ url: LINK, brand: "Trivet" });
    expect(text).toContain("1 hour");
    expect(text).not.toContain("3600");
  });

  it("switches to minutes when the window is under an hour", () => {
    const { text } = resetPasswordEmail({
      url: LINK,
      brand: "Trivet",
      ttlSeconds: 900,
    });
    expect(text).toContain("15 minutes");
  });

  /*
   * This is the one mail the app sends that a stranger can cause to arrive in
   * somebody else's inbox, just by typing their address. It has to say that
   * ignoring it is safe, or it reads as a breach notice.
   */
  it("tells an unexpected recipient that nothing has happened", () => {
    const { text } = resetPasswordEmail({ url: LINK, brand: "Trivet" });
    expect(text).toMatch(/if this was not you/i);
    expect(text).toMatch(/password stays as it is/i);
  });

  it("agrees with the expiry the auth config is given", () => {
    expect(RESET_TOKEN_TTL_SECONDS).toBe(3600);
  });
});

describe("which sender a deployment gets", () => {
  it("needs both a key and a from address before it will claim to work", () => {
    withEnv({ TWILIO_EMAIL_API_KEY: "SG.x", EMAIL_FROM: undefined });
    expect(twilioEmailSender.info().available).toBe(false);
    expect(twilioEmailSender.info().unavailableReason).toContain("EMAIL_FROM");

    withEnv({
      TWILIO_EMAIL_API_KEY: undefined,
      EMAIL_FROM: "hi@trivetbox.com",
    });
    expect(twilioEmailSender.info().available).toBe(false);
    expect(twilioEmailSender.info().unavailableReason).toContain(
      "TWILIO_EMAIL_API_KEY",
    );

    withEnv({ TWILIO_EMAIL_API_KEY: "SG.x", EMAIL_FROM: "hi@trivetbox.com" });
    expect(twilioEmailSender.info().available).toBe(true);
  });

  /*
   * The key is not the Twilio auth token, and reaching for the one already in
   * the environment is the obvious mistake. Nothing here can stop that, but
   * the variable is named so the two cannot be confused by accident.
   */
  it("reads its own key, not the one the texting uses", () => {
    withEnv({
      TWILIO_AUTH_TOKEN: "the-sms-one",
      TWILIO_EMAIL_API_KEY: undefined,
      EMAIL_FROM: "hi@trivetbox.com",
    });
    expect(twilioEmailSender.info().available).toBe(false);
  });

  it("falls back to the log in development, and says it is not available", () => {
    withEnv({ TWILIO_EMAIL_API_KEY: undefined, EMAIL_FROM: undefined });
    expect(getEmailSender()).toBe(consoleEmailSender);
    expect(consoleEmailSender.info().available).toBe(false);
  });

  /*
   * The guard that matters. A shopping list that silently fails is an
   * inconvenience; a reset link that goes to a log file is somebody locked out
   * with no way to tell whether to keep waiting. The override exists for
   * development and must not reach production however the variable is set.
   */
  it("refuses the log-only override in production", () => {
    withEnv({
      TWILIO_EMAIL_API_KEY: undefined,
      EMAIL_FROM: undefined,
      EMAIL_LOG_ONLY: "true",
      NODE_ENV: "development",
    });
    expect(emailAvailable()).toBe(true);

    vi.stubEnv("NODE_ENV", "production");
    expect(emailAvailable()).toBe(false);
  });

  it("is available in production only with real credentials", () => {
    withEnv({
      TWILIO_EMAIL_API_KEY: "SG.x",
      EMAIL_FROM: "hi@trivetbox.com",
      NODE_ENV: "production",
    });
    expect(emailAvailable()).toBe(true);
  });
});
