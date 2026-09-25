import { describe, expect, it } from "vitest";

import { formatQuantity } from "@/lib/quantity";
import {
  MAX_SERVINGS,
  clampServings,
  roundForCooking,
  scaleFactor,
  scaleQuantity,
  servingChoices,
} from "@/lib/scale";

describe("servingChoices", () => {
  it("offers every whole number from what the recipe makes up to the cap", () => {
    expect(servingChoices(4)).toEqual([4, 5, 6, 7, 8]);
  });

  it("offers nothing to choose between at the cap", () => {
    expect(servingChoices(MAX_SERVINGS)).toEqual([8]);
  });

  it("never offers to cook a big recipe for fewer people", () => {
    // The cap is a ceiling on the offer, not a target to pull a dish down to.
    expect(servingChoices(12)).toEqual([12]);
  });

  it("treats a recipe that serves nobody as serving one", () => {
    expect(servingChoices(0)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe("clampServings", () => {
  it("keeps a number that was on offer", () => {
    expect(clampServings(6, 4)).toBe(6);
  });

  it("refuses to scale down", () => {
    expect(clampServings(2, 4)).toBe(4);
  });

  it("holds the cap against a number nobody could have clicked", () => {
    // The number arrives in a form post and in a URL. Neither is a promise.
    expect(clampServings(5000, 4)).toBe(MAX_SERVINGS);
  });

  it("lets a big recipe stay big", () => {
    expect(clampServings(6, 12)).toBe(12);
    expect(clampServings(20, 12)).toBe(12);
  });

  it.each([[NaN], [Infinity]])(
    "falls back to the recipe's own number for %j",
    (target) => {
      expect(clampServings(target, 4)).toBe(4);
    },
  );
});

describe("scaleFactor", () => {
  it.each([
    [4, 4, 1],
    [8, 4, 2],
    [6, 4, 1.5],
    [5, 4, 1.25],
  ])("cooks %i of a recipe for %i at %fx", (target, own, expected) => {
    expect(scaleFactor(target, own)).toBe(expected);
  });

  it("does not divide by a recipe that serves zero", () => {
    expect(scaleFactor(4, 0)).toBe(4);
  });

  it.each([[0], [-2], [NaN]])("leaves the recipe alone for %j", (target) => {
    expect(scaleFactor(target, 4)).toBe(1);
  });

  it("is not clamped, because the shopping list must follow the plan", () => {
    // clampServings guards what gets stored. If something else did get
    // stored, the list buys for that rather than quietly buying for eight.
    expect(scaleFactor(20, 4)).toBe(5);
  });
});

describe("scaleQuantity", () => {
  it("leaves an unquantified ingredient unquantified", () => {
    // "Salt, to taste" does not become twice as much taste.
    expect(scaleQuantity(null, 2)).toBeNull();
  });

  it("doubles a plain amount", () => {
    expect(scaleQuantity(2, 2)).toBe(4);
  });
});

/*
 * Asserted through formatQuantity rather than on the number, because agreeing
 * with it is the whole point: a scaled amount that lands a floating-point
 * hair away from two thirds is rendered "0.6667", and the rounding exists to
 * stop that reaching a page.
 */
describe("scaled amounts, as they are written out", () => {
  const scaled = (quantity: number, factor: number) =>
    formatQuantity(scaleQuantity(quantity, factor));

  it("doubles a third into two thirds rather than 0.6667", () => {
    expect(scaled(1 / 3, 2)).toBe("2/3");
  });

  it.each([
    [1 / 2, 2, "1"],
    [3 / 4, 2, "1 1/2"],
    [1 / 3, 1.5, "1/2"],
    [2.5, 1.25, "3 1/8"],
    [1.5, 1.75, "2 5/8"],
  ])("writes %f at %fx as %s", (quantity, factor, expected) => {
    expect(scaled(quantity, factor)).toBe(expected);
  });

  it("moves an unmeasurable third of a cup to the nearest eighth", () => {
    // 0.41666... is arithmetically perfect and nobody owns that cup.
    expect(scaled(1 / 3, 1.25)).toBe("3/8");
  });

  it("uses thirds when a third is the closer landing", () => {
    // A quarter at 1.25 is 0.3125: an eighth away from 3/8 or 1/4 either way,
    // and much nearer a third.
    expect(scaled(1 / 4, 1.25)).toBe("1/3");
  });
});

describe("roundForCooking", () => {
  it("does not offer eighths of a big number", () => {
    // "12 3/8 cups" is a precision nobody will measure.
    expect(roundForCooking(12.4)).toBe(12.5);
    expect(roundForCooking(18)).toBe(18);
  });

  it("leaves a pinch alone rather than snapping it to an eighth", () => {
    expect(roundForCooking(0.09)).toBe(0.09);
  });

  it("never rounds a real amount away to nothing", () => {
    // Two decimals would make this zero, and an ingredient listed as "0"
    // reads as a broken recipe rather than as a very small amount.
    expect(roundForCooking(0.001)).toBeGreaterThan(0);
  });

  it.each([[0], [-1], [NaN]])("has nothing to say about %j", (value) => {
    expect(roundForCooking(value)).toBe(0);
  });
});
