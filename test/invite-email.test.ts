import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { consoleEmailSender } from "@/lib/email";
import { inviteEmail } from "@/lib/email/invite";
import { emailInvite } from "@/lib/invites";

const link = "https://trivetbox.com/sign-up?code=ABC123";

describe("inviteEmail", () => {
  it("leads with the inviter's name, not the product's", () => {
    // "Ben invited you" is a message; "You've been invited to Trivet" is a
    // newsletter, and the second is the one that gets filtered.
    const { subject, text } = inviteEmail({
      link,
      brand: "Trivet",
      inviterName: "Ben",
      kind: "family",
      expiresInDays: 14,
    });

    expect(subject).toBe("Ben invited you to Trivet");
    expect(text.startsWith("Ben has invited you")).toBe(true);
  });

  it("says what each kind of invite actually does", () => {
    // One hands over a household's whole library, the other starts an empty
    // one. Somebody deciding whether to click deserves to know which.
    const family = inviteEmail({
      link,
      brand: "Trivet",
      inviterName: "Ben",
      kind: "family",
      expiresInDays: 14,
    }).text;
    const outside = inviteEmail({
      link,
      brand: "Trivet",
      inviterName: "Ben",
      kind: "outside",
      householdName: "The Garcias",
      expiresInDays: 14,
    }).text;

    expect(family).toMatch(/join their household/);
    expect(outside).toMatch(/start your own/);
    expect(outside).toMatch(/as The Garcias/);
  });

  it("carries the link, the expiry and a way to ignore it", () => {
    const { text } = inviteEmail({
      link,
      brand: "Trivet",
      inviterName: "Ben",
      kind: "family",
      expiresInDays: 14,
    });

    expect(text).toContain(link);
    expect(text).toMatch(/14 days/);
    expect(text).toMatch(/ignore this email/);
  });

  it("does not sign a mail with an empty name", () => {
    const { subject, text } = inviteEmail({
      link,
      brand: "Trivet",
      inviterName: "  ",
      kind: "family",
      expiresInDays: 1,
    });

    expect(subject).toBe("Someone invited you to Trivet");
    expect(text).toMatch(/1 day\b/);
    expect(text).toMatch(/who sent this/);
  });
});

describe("emailInvite", () => {
  const params = {
    code: "ABC123",
    email: "sister@example.com",
    inviterName: "Ben",
    kind: "family" as const,
  };

  beforeEach(() => {
    vi.stubEnv("BETTER_AUTH_URL", "https://trivetbox.com");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_FROM", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("says email is unavailable rather than pretending it sent", async () => {
    vi.stubEnv("EMAIL_LOG_ONLY", "");

    expect(await emailInvite(params)).toBe("unavailable");
  });

  it("sends the invitation to the address it was made for", async () => {
    vi.stubEnv("EMAIL_LOG_ONLY", "true");
    const send = vi.spyOn(consoleEmailSender, "send");

    expect(await emailInvite(params)).toBe("sent");
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "sister@example.com",
        fromName: "Ben via Trivet",
        subject: "Ben invited you to Trivet",
        text: expect.stringContaining(
          "https://trivetbox.com/sign-up?code=ABC123",
        ),
      }),
    );
  });

  it("sends as plain Trivet, not 'via Trivet' from nobody, with no name", async () => {
    vi.stubEnv("EMAIL_LOG_ONLY", "true");
    const send = vi.spyOn(consoleEmailSender, "send");

    await emailInvite({ ...params, inviterName: "   " });

    expect(send.mock.calls[0][0].fromName).toBeUndefined();
  });

  it("reports a refused send instead of throwing", async () => {
    // The invite already exists by now. A provider having a bad minute must
    // come back as an answer beside a working code, not as an error that
    // makes the code look like it failed too.
    vi.stubEnv("EMAIL_LOG_ONLY", "true");
    vi.spyOn(consoleEmailSender, "send").mockResolvedValue({
      ok: false,
      error: "rate limited",
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await emailInvite(params)).toBe("failed");
  });

  it("reports a send that throws instead of throwing", async () => {
    vi.stubEnv("EMAIL_LOG_ONLY", "true");
    vi.spyOn(consoleEmailSender, "send").mockRejectedValue(
      new Error("network down"),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await emailInvite(params)).toBe("failed");
  });
});
