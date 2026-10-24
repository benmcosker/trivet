import { describe, expect, it } from "vitest";

import {
  displayAddress,
  hostLabel,
  normaliseAddress,
} from "@/lib/recipe-address";

describe("normaliseAddress", () => {
  it("keeps an address that is already one", () => {
    expect(normaliseAddress("https://example.com/soup")).toBe(
      "https://example.com/soup",
    );
  });

  it("supplies the scheme somebody did not paste", () => {
    // People paste `smittenkitchen.com/...` constantly, and refusing that
    // would be the app being pedantic about a detail it can supply itself.
    expect(normaliseAddress("smittenkitchen.example/2024/soup")).toBe(
      "https://smittenkitchen.example/2024/soup",
    );
  });

  it("trims what came with the paste", () => {
    expect(normaliseAddress("  https://example.com/soup  ")).toBe(
      "https://example.com/soup",
    );
  });

  it("leaves http alone rather than upgrading it", () => {
    expect(normaliseAddress("http://example.com")).toBe("http://example.com/");
  });

  it.each([
    ["", "nothing at all"],
    ["   ", "whitespace"],
    ["chicken soup", "a search"],
    ["pancakes", "a single word"],
    ["mailto:cook@example.com", "a deliberate non-web scheme"],
    ["javascript:alert(1)", "a script"],
    ["file:///etc/passwd", "a local file"],
  ])("refuses %j, which is %s", (input) => {
    expect(normaliseAddress(input)).toBeNull();
  });
});

describe("hostLabel", () => {
  it("names the site the way the copy does", () => {
    expect(hostLabel("https://www.halfbakedharvest.example/soup")).toBe(
      "halfbakedharvest.example",
    );
  });

  it("gives back what it was handed if that was not an address", () => {
    expect(hostLabel("not an address")).toBe("not an address");
  });
});

describe("displayAddress", () => {
  it("drops the scheme and keeps the path, which is the part usually wrong", () => {
    expect(displayAddress("https://www.halfbakedharvest.example/soup")).toBe(
      "halfbakedharvest.example/soup",
    );
  });

  it("leaves no trailing slash dangling at the end of a sentence", () => {
    expect(displayAddress("https://example.com/")).toBe("example.com");
  });
});
