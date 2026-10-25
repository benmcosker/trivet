import { describe, expect, it } from "vitest";

import { cleanDisplayName, fromAddress, fromHeader } from "@/lib/email/from";

describe("fromAddress", () => {
  it("takes a bare EMAIL_FROM as the address", () => {
    expect(fromAddress("info@trivetbox.com")).toBe("info@trivetbox.com");
  });

  it("takes the address out of an EMAIL_FROM that already has a name", () => {
    // So setting a name in the environment later cannot override the name a
    // particular mail chose.
    expect(fromAddress("Trivet <info@trivetbox.com>")).toBe(
      "info@trivetbox.com",
    );
  });
});

describe("fromHeader", () => {
  it("puts a display name in front of the verified address", () => {
    // The bug this exists for: a bare address showed in Gmail as "info".
    expect(fromHeader("info@trivetbox.com", "Trivet")).toBe(
      '"Trivet" <info@trivetbox.com>',
    );
  });

  it("names the inviter on an invitation", () => {
    expect(fromHeader("info@trivetbox.com", "Ben McOsker via Trivet")).toBe(
      '"Ben McOsker via Trivet" <info@trivetbox.com>',
    );
  });

  it("never changes the address, whatever the name says", () => {
    // A display name is free; a different domain fails verification.
    expect(fromHeader("info@trivetbox.com", "Ben <ben@evil.example>")).toBe(
      '"Ben ben@evil.example" <info@trivetbox.com>',
    );
  });

  it("falls back to the bare address when no name survives cleaning", () => {
    expect(fromHeader("info@trivetbox.com", ' "<>" ')).toBe(
      "info@trivetbox.com",
    );
  });
});

describe("cleanDisplayName", () => {
  // The name can be whatever a member typed at sign-up, so it is untrusted
  // text on its way into an email header.

  it("removes line breaks, which is how a header injection starts", () => {
    expect(cleanDisplayName("Ben\r\nBcc: everyone@example.com")).toBe(
      "Ben Bcc: everyone@example.com",
    );
    expect(cleanDisplayName("Ben\r\nBcc: x")).not.toMatch(/[\r\n]/);
  });

  it("removes the From line's own syntax", () => {
    expect(cleanDisplayName('Ben "the cook" <McOsker>\\')).toBe(
      "Ben the cook McOsker",
    );
  });

  it("collapses whitespace and trims", () => {
    expect(cleanDisplayName("  Ben    McOsker  ")).toBe("Ben McOsker");
  });

  it("caps an absurdly long name rather than sending a sentence", () => {
    const cleaned = cleanDisplayName("A".repeat(200));
    expect(cleaned.length).toBeLessThanOrEqual(64);
  });

  it("leaves an ordinary name alone, accents and apostrophes included", () => {
    expect(cleanDisplayName("Siobhán O'Brien via Trivet")).toBe(
      "Siobhán O'Brien via Trivet",
    );
  });
});
