import { describe, expect, it } from "vitest";

import { photoTransitionName } from "@/lib/photo-transition";

/*
 * A morph is a pair, and a pair that disagrees is not an error - it is just a
 * transition that quietly never happens. The point of the helper is that the
 * card, the hero and the recipe page cannot drift apart, so that is what these
 * check.
 */
describe("photoTransitionName", () => {
  it("gives one recipe the same name wherever it is asked", () => {
    expect(photoTransitionName("abc123")).toBe(photoTransitionName("abc123"));
  });

  it("gives two recipes different names", () => {
    // Two elements claiming one name is how the whole transition stops
    // working, so this is the property the library grid depends on.
    expect(photoTransitionName("abc123")).not.toBe(
      photoTransitionName("def456"),
    );
  });

  it("is a valid CSS custom-ident, not something that needs quoting", () => {
    // cuid()s are alphanumeric, so the only risk is the prefix. A name that
    // starts with a digit or carries punctuation is silently ignored.
    expect(photoTransitionName("cmuguwdst0002097d6tx86xf7")).toMatch(
      /^[a-zA-Z_][a-zA-Z0-9_-]*$/,
    );
  });
});
