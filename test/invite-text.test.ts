import { afterEach, describe, expect, it, vi } from "vitest";

import { inviteMessage, smsHref } from "@/lib/invite-text";
import { inviteLink } from "@/lib/invites";

describe("inviteLink", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is the sign-up page on the configured origin, carrying the code", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://trivetbox.com");

    expect(inviteLink("ABC123")).toBe(
      "https://trivetbox.com/sign-up?code=ABC123",
    );
  });

  it("ignores a trailing slash or a path on the configured origin", () => {
    // A base of `https://trivetbox.com/` must not produce `//sign-up`, and a
    // base somebody set with a path must not nest the sign-up page under it.
    vi.stubEnv("BETTER_AUTH_URL", "https://trivetbox.com/");
    expect(inviteLink("ABC123")).toBe(
      "https://trivetbox.com/sign-up?code=ABC123",
    );

    vi.stubEnv("BETTER_AUTH_URL", "https://trivetbox.com/recipes");
    expect(inviteLink("ABC123")).toBe(
      "https://trivetbox.com/sign-up?code=ABC123",
    );
  });

  it("follows the deployment rather than pointing at production", () => {
    // A code minted on a preview exists only in that preview's database.
    vi.stubEnv("BETTER_AUTH_URL", "https://trivet-git-branch.vercel.app");

    expect(inviteLink("ABC123")).toBe(
      "https://trivet-git-branch.vercel.app/sign-up?code=ABC123",
    );
  });

  it("refuses to build a link with nowhere to point", () => {
    vi.stubEnv("BETTER_AUTH_URL", "");

    expect(() => inviteLink("ABC123")).toThrow(/BETTER_AUTH_URL/);
  });
});

describe("the text itself", () => {
  const link = "https://trivetbox.com/sign-up?code=ABC123";

  it("says what joining means for each kind of invite", () => {
    expect(inviteMessage(link, "family")).toContain("Join our recipe box");
    expect(inviteMessage(link, "outside")).toContain("Start your own");
  });

  it("carries the link exactly once, and the code only inside it", () => {
    const message = inviteMessage(link, "family");

    expect(message.split(link)).toHaveLength(2);
    expect(message.match(/ABC123/g)).toHaveLength(1);
  });
});

describe("smsHref", () => {
  it("opens Messages with no recipient, so the inviter chooses", () => {
    expect(smsHref("hello")).toBe("sms:?&body=hello");
  });

  it("encodes the link so its ? and = survive inside the body", () => {
    // Unencoded, the link's own query string would be read as the sms:
    // link's, and the body would end at `code`.
    const href = smsHref("Join: https://trivetbox.com/sign-up?code=ABC123");

    expect(href).toBe(
      "sms:?&body=Join%3A%20https%3A%2F%2Ftrivetbox.com%2Fsign-up%3Fcode%3DABC123",
    );
    expect(decodeURIComponent(href.split("body=")[1])).toBe(
      "Join: https://trivetbox.com/sign-up?code=ABC123",
    );
  });
});
