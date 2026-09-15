import { describe, expect, it } from "vitest";

import { clampStep } from "@/lib/cooking";

describe("where you are in a recipe", () => {
  it("keeps a position that is already valid", () => {
    expect(clampStep(0, 5)).toBe(0);
    expect(clampStep(3, 5)).toBe(3);
    expect(clampStep(4, 5)).toBe(4);
  });

  /*
   * The case this exists for: the position was saved against a longer version
   * of the recipe, which has since been edited. Landing at the end beats
   * rendering nothing, and beats being sent back to step one.
   */
  it("lands on the last step when the recipe got shorter", () => {
    expect(clampStep(7, 3)).toBe(2);
  });

  it("refuses to go before the beginning", () => {
    expect(clampStep(-1, 5)).toBe(0);
    expect(clampStep(-99, 5)).toBe(0);
  });

  /*
   * `Number(sessionStorage.getItem(...))` is NaN for anything that is not a
   * number, and NaN survives Math.min/Math.max - so it has to be caught before
   * it reaches them, or it reaches the array index instead.
   */
  it("treats unreadable storage as the beginning", () => {
    expect(clampStep(Number("banana"), 5)).toBe(0);
    expect(clampStep(Number(""), 5)).toBe(0);
    expect(clampStep(Infinity, 5)).toBe(0);
    expect(clampStep(-Infinity, 5)).toBe(0);
  });

  it("has nowhere to be in a recipe with no method", () => {
    expect(clampStep(0, 0)).toBe(0);
    expect(clampStep(4, 0)).toBe(0);
  });

  /* A stored "2.7" is not a step; truncating picks the one you were reading. */
  it("truncates a fractional position rather than rounding past a step", () => {
    expect(clampStep(2.7, 5)).toBe(2);
  });
});
