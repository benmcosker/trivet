import { afterEach, describe, expect, it, vi } from "vitest";

import {
  consoleEmailSender,
  emailAvailable,
  getEmailSender,
} from "@/lib/email";
import { resendSender } from "@/lib/email/resend";
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
    withEnv({ RESEND_API_KEY: "re_x", EMAIL_FROM: undefined });
    expect(resendSender.info().available).toBe(false);
    expect(resendSender.info().unavailableReason).toContain("EMAIL_FROM");

    withEnv({ RESEND_API_KEY: undefined, EMAIL_FROM: "hi@trivetbox.com" });
    expect(resendSender.info().available).toBe(false);
    expect(resendSender.info().unavailableReason).toContain("RESEND_API_KEY");

    withEnv({ RESEND_API_KEY: "re_x", EMAIL_FROM: "hi@trivetbox.com" });
    expect(resendSender.info().available).toBe(true);
  });

  /*
   * The mail vendor is not the texting vendor, and the environment holds
   * credentials for both. A Twilio account in full working order must not
   * make this one look configured.
   */
  it("is not satisfied by the texting credentials", () => {
    withEnv({
      TWILIO_ACCOUNT_SID: "AC.x",
      TWILIO_AUTH_TOKEN: "the-sms-one",
      RESEND_API_KEY: undefined,
      EMAIL_FROM: "hi@trivetbox.com",
    });
    expect(resendSender.info().available).toBe(false);
    expect(emailAvailable()).toBe(false);
  });

  it("falls back to the log in development, and says it is not available", () => {
    withEnv({ RESEND_API_KEY: undefined, EMAIL_FROM: undefined });
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
      RESEND_API_KEY: undefined,
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
      RESEND_API_KEY: "re_x",
      EMAIL_FROM: "hi@trivetbox.com",
      NODE_ENV: "production",
    });
    expect(emailAvailable()).toBe(true);
  });
});
