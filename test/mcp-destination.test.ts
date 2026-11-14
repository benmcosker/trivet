import { describe, expect, it } from "vitest";

import {
  claimedAssistant,
  destinationOf,
  looksLikeImpersonation,
} from "@/lib/mcp/destination";

/**
 * What the consent screen can vouch for: where approving sends the person,
 * rather than the name a registrant typed (MCP security review, November).
 */
describe("destinationOf", () => {
  it.each([
    ["https://claude.ai/api/mcp/auth_callback", "Claude"],
    ["https://chatgpt.com/connector_platform_oauth_redirect", "ChatGPT"],
    ["https://gemini.google.com/oauth/callback", "Gemini"],
    // What Gemini actually used when Ben connected it, 14 November.
    ["https://oauth-redirect.googleusercontent.com/r/gemini-app", "Gemini"],
  ])("recognises %s as %s", (uri, assistant) => {
    expect(destinationOf(uri)).toMatchObject({ kind: "known", assistant });
  });

  it("treats a callback on this computer as a local tool", () => {
    expect(destinationOf("http://localhost:6274/oauth/callback")).toEqual({
      kind: "local",
    });
    expect(destinationOf("http://127.0.0.1:33418/callback")).toEqual({
      kind: "local",
    });
  });

  it("does not mistake a look-alike for the real address", () => {
    expect(destinationOf("https://claude.ai.evil.example/cb")).toEqual({
      kind: "other",
      host: "claude.ai.evil.example",
    });
    expect(destinationOf("https://notclaude.ai/cb")).toMatchObject({
      kind: "other",
    });
    expect(destinationOf("http://claude.ai/cb")).toMatchObject({
      kind: "other",
    });
  });

  it("trusts Google's callback host exactly, not its neighbours", () => {
    expect(
      destinationOf("https://someone.googleusercontent.com/cb"),
    ).toMatchObject({ kind: "other" });
    expect(
      destinationOf("https://x.oauth-redirect.googleusercontent.com/cb"),
    ).toMatchObject({ kind: "other" });
  });

  it("has nothing to show without a usable address", () => {
    expect(destinationOf(undefined)).toEqual({ kind: "missing" });
    expect(destinationOf("not a url")).toEqual({ kind: "missing" });
  });
});

describe("looksLikeImpersonation", () => {
  it("flags a name claiming Claude that goes somewhere else", () => {
    expect(
      looksLikeImpersonation(
        "Claude",
        destinationOf("https://evil.example/cb"),
      ),
    ).toBe(true);
    expect(
      looksLikeImpersonation(
        "ChatGPT",
        destinationOf("https://claude.ai/api/mcp/auth_callback"),
      ),
    ).toBe(true);
  });

  it("accepts Gemini as it really connects, and refuses a fake Google", () => {
    expect(
      looksLikeImpersonation(
        "Google",
        destinationOf("https://oauth-redirect.googleusercontent.com/r/x"),
      ),
    ).toBe(false);
    expect(
      looksLikeImpersonation(
        "Google",
        destinationOf("https://evil.example/cb"),
      ),
    ).toBe(true);
  });

  it("accepts the real thing, local tools, and names that claim nothing", () => {
    expect(
      looksLikeImpersonation(
        "Claude",
        destinationOf("https://claude.ai/api/mcp/auth_callback"),
      ),
    ).toBe(false);
    expect(
      looksLikeImpersonation(
        "Claude Code",
        destinationOf("http://localhost:33418/callback"),
      ),
    ).toBe(false);
    expect(
      looksLikeImpersonation(
        "Family meal bot",
        destinationOf("https://bot.example/cb"),
      ),
    ).toBe(false);
  });

  it("reads the claim from the name loosely", () => {
    expect(claimedAssistant("ChatGPT for Trivet")).toBe("ChatGPT");
    expect(claimedAssistant("chat gpt")).toBe("ChatGPT");
    expect(claimedAssistant("gemini")).toBe("Gemini");
    expect(claimedAssistant("Google")).toBe("Gemini");
    expect(claimedAssistant("Claudette's Kitchen")).toBeNull();
  });
});
