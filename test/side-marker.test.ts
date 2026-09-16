import { describe, expect, it } from "vitest";

import { SIDE_MARKER_PREFIX, sideMarker } from "@/lib/side-marker";

/*
 * This string is data, not a label: it is written into `recipe.sourceName` and
 * then matched on to decide whether a side has already been accepted. These
 * tests exist so that changing it is a deliberate act with a migration beside
 * it, rather than a rename somebody does while tidying.
 */
describe("the marker that identifies an accepted side", () => {
  it("is the prefix followed by the side's id", () => {
    expect(sideMarker("garlic-bread")).toBe("Trivet side: garlic-bread");
  });

  it("carries the current product name, not the old one", () => {
    expect(SIDE_MARKER_PREFIX).toBe("Trivet side: ");
    expect(sideMarker("anything")).not.toContain("Meal Magic");
  });

  /*
   * The prefix has to end in its separator. Without it "Trivet side:x" and
   * "Trivet side: x" are different markers, and a recipe accepted before the
   * slip would stop matching one accepted after it.
   */
  it("ends in a separator, so ids cannot run into the prefix", () => {
    expect(SIDE_MARKER_PREFIX.endsWith(": ")).toBe(true);
  });
});
