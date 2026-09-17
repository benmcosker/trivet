import { describe, expect, it, vi } from "vitest";

import { checkEnv, formatMissingRequired } from "@/lib/env";

const full = {
  DATABASE_URL: "postgresql://localhost/db",
  BETTER_AUTH_SECRET: "secret",
  ANTHROPIC_API_KEY: "k",
  TWILIO_ACCOUNT_SID: "k",
  RESEND_API_KEY: "k",
  BLOB_READ_WRITE_TOKEN: "k",
};

describe("checkEnv", () => {
  it("is satisfied when everything is set", () => {
    const report = checkEnv(full);
    expect(report.missingRequired).toEqual([]);
    expect(report.disabledFeatures).toEqual([]);
  });

  it("names every missing required variable, not just the first", () => {
    expect(checkEnv({}).missingRequired).toEqual([
      "DATABASE_URL",
      "BETTER_AUTH_SECRET",
    ]);
  });

  it("treats a blank value as missing", () => {
    // An env var set to "" in a dashboard is a common way to half-configure
    // something, and it fails later in a much less obvious place.
    expect(checkEnv({ ...full, DATABASE_URL: "   " }).missingRequired).toEqual([
      "DATABASE_URL",
    ]);
  });

  it("does not treat optional keys as required", () => {
    const report = checkEnv({
      DATABASE_URL: "x",
      BETTER_AUTH_SECRET: "y",
    });
    expect(report.missingRequired).toEqual([]);
    expect(report.disabledFeatures.map((f) => f.missing)).toEqual([
      "ANTHROPIC_API_KEY",
      "TWILIO_ACCOUNT_SID",
      "RESEND_API_KEY",
      "BLOB_READ_WRITE_TOKEN",
    ]);
  });

  it("says nothing about Instacart, however it is configured", () => {
    // No key can be obtained while Instacart is refusing new developer
    // applications, so a boot warning would be a permanent alarm about a
    // closed door - which is how people learn to read past startup warnings.
    // The provider still works the day a key appears; it just does not
    // announce its own absence.
    for (const env of [
      {},
      { DATABASE_URL: "x", BETTER_AUTH_SECRET: "y" },
      { ...full, INSTACART_API_KEY: "" },
      { ...full, INSTACART_API_KEY: "k" },
    ]) {
      expect(
        checkEnv(env).disabledFeatures.map((f) => f.missing),
      ).not.toContain("INSTACART_API_KEY");
    }
  });

  it("says what each missing optional key actually costs", () => {
    const [blob] = checkEnv({
      ...full,
      BLOB_READ_WRITE_TOKEN: "",
    }).disabledFeatures;
    expect(blob.feature).toBe("Cloud file storage");
    expect(blob.consequence).toMatch(/vanish between deploys/);

    const [reset] = checkEnv({
      ...full,
      RESEND_API_KEY: "",
    }).disabledFeatures;
    expect(reset.feature).toBe("Password resets");
    // The half-configuration that looks fine and is not: a key with no
    // verified sender address behind it.
    expect(reset.consequence).toMatch(/EMAIL_FROM/);

    const [sms] = checkEnv({
      ...full,
      TWILIO_ACCOUNT_SID: "",
    }).disabledFeatures;
    expect(sms.feature).toBe("Texting the shopping list");
    // The part nobody discovers on their own: unregistered US traffic is not
    // rejected, it is silently filtered, so the app looks like it worked.
    expect(sms.consequence).toMatch(/A2P 10DLC/);
  });
});

describe("formatMissingRequired", () => {
  it("lists each variable and points at where values come from", () => {
    const message = formatMissingRequired([
      "DATABASE_URL",
      "BETTER_AUTH_SECRET",
    ]);
    expect(message).toContain("2 required environment variables missing");
    expect(message).toContain("- DATABASE_URL");
    expect(message).toContain("- BETTER_AUTH_SECRET");
    expect(message).toContain(".env.example");
  });

  it("gets the singular right for one missing variable", () => {
    expect(formatMissingRequired(["DATABASE_URL"])).toContain(
      "1 required environment variable missing",
    );
  });
});

describe("the log-only SMS override", () => {
  it("is refused in production, whatever the variable says", async () => {
    // The failure this guards: somebody believing the week's shopping went out
    // when it only reached a log file.
    vi.stubEnv("SMS_LOG_ONLY", "true");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TWILIO_ACCOUNT_SID", "");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "");
    vi.stubEnv("TWILIO_FROM_NUMBER", "");

    const { smsAvailable } = await import("@/lib/sms");
    expect(smsAvailable()).toBe(false);
    vi.unstubAllEnvs();
  });

  it("makes the feature reachable in development, so it can be tried", async () => {
    vi.stubEnv("SMS_LOG_ONLY", "true");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("TWILIO_ACCOUNT_SID", "");

    const { smsAvailable } = await import("@/lib/sms");
    expect(smsAvailable()).toBe(true);
    vi.unstubAllEnvs();
  });

  it("stays off when nothing is configured at all", async () => {
    vi.stubEnv("SMS_LOG_ONLY", "");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("TWILIO_ACCOUNT_SID", "");

    const { smsAvailable } = await import("@/lib/sms");
    expect(smsAvailable()).toBe(false);
    vi.unstubAllEnvs();
  });
});
