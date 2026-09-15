import { describe, expect, it } from "vitest";

import { formatAmount, formatQuantity, parseQuantity } from "@/lib/quantity";

const read = (input: string) => {
  const result = parseQuantity(input);
  return result.ok ? result.value : `REJECTED: ${result.reason}`;
};

describe("parseQuantity", () => {
  it.each([
    ["2", 2],
    ["2.5", 2.5],
    [".5", 0.5],
    ["  3  ", 3],
  ])("reads the plain number %j", (input, expected) => {
    expect(read(input)).toBe(expected);
  });

  it.each([
    ["1/2", 0.5],
    ["3/4", 0.75],
    ["1 1/2", 1.5],
    ["2 3/4", 2.75],
  ])("reads the fraction %j, which Number() calls NaN", (input, expected) => {
    expect(read(input)).toBe(expected);
  });

  it.each([
    ["½", 0.5],
    ["1½", 1.5],
    ["1 ½", 1.5],
    ["¾", 0.75],
    ["⅓", 1 / 3],
  ])(
    "reads the glyph %j that a PDF or a keyboard produces",
    (input, expected) => {
      expect(read(input)).toBe(expected);
    },
  );

  describe("ranges", () => {
    it.each([
      ["2-3", 3],
      ["2 - 3", 3],
      ["2 to 3", 3],
    ])("takes the top of %j", (input, expected) => {
      // Coming home with two when the recipe wanted three costs a second trip.
      // The other way costs a spare clove of garlic.
      expect(read(input)).toBe(expected);
    });

    it("does not mistake a written mixed number for a range", () => {
      // "1-1/2" is how a great many recipe cards write one and a half. Read as
      // a range it would come out as 0.5, and the shopping would be short.
      expect(read("1-1/2")).toBe(1.5);
    });
  });

  it("treats blank as no quantity rather than an error", () => {
    // "salt to taste" has no number, and the column is nullable for that.
    expect(read("")).toBeNull();
    expect(read("   ")).toBeNull();
  });

  it.each(["pinch", "a few", "some", "2x", "abc", "1,5"])(
    "refuses %j rather than guessing",
    (input) => {
      expect(String(read(input))).toContain("not a quantity");
    },
  );

  it("refuses zero and negatives, which the column will not hold", () => {
    expect(String(read("0"))).toContain("more than zero");
    expect(String(read("-1"))).toContain("not a quantity");
  });

  it("refuses a division by zero rather than storing Infinity", () => {
    expect(String(read("1/0"))).toContain("cannot be divided");
  });

  it("refuses a quantity beyond what the column allows", () => {
    expect(String(read("100001"))).toContain("too large");
  });

  it("says what is acceptable, not just that it failed", () => {
    const result = parseQuantity("a pinch");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain("1/2");
  });
});

describe("formatQuantity", () => {
  it.each([
    [0.5, "1/2"],
    [1.5, "1 1/2"],
    [0.75, "3/4"],
    [2.25, "2 1/4"],
    [2, "2"],
    [2.5, "2 1/2"],
  ])("shows %j as %j", (value, expected) => {
    expect(formatQuantity(value)).toBe(expected);
  });

  it("shows a number with no cook's fraction as a decimal", () => {
    // 1.2 is exactly 1 1/5, and showing it that way would be arithmetically
    // perfect and useless: nobody measures a fifth of a cup.
    expect(formatQuantity(1.2)).toBe("1.2");
    expect(formatQuantity(1 / 7)).toBe("0.1429");
  });

  it("keeps the fractions a cook does use", () => {
    expect(formatQuantity(1 / 3)).toBe("1/3");
    expect(formatQuantity(0.125)).toBe("1/8");
  });

  it("shows nothing for no quantity", () => {
    expect(formatQuantity(null)).toBe("");
  });

  it("round-trips, so editing a recipe does not rewrite what was typed", () => {
    // The failure this guards: open a recipe to fix a typo, and every "1/2"
    // silently becomes "0.5" on save.
    for (const typed of ["1/2", "1 1/2", "3/4", "2", "2.5"]) {
      const parsed = parseQuantity(typed);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) continue;
      const shown = formatQuantity(parsed.value);
      expect(parseQuantity(shown)).toEqual(parsed);
    }
  });
});

describe("an ingredient's amount as one phrase", () => {
  it("joins a quantity to its unit", () => {
    expect(formatAmount(2, "cups")).toBe("2 cups");
  });

  /* The whole reason it is not `String(quantity)`. */
  it("keeps a half a half", () => {
    expect(formatAmount(0.5, "cup")).toBe("1/2 cup");
    expect(formatAmount(1.5, "tsp")).toBe("1 1/2 tsp");
  });

  it("gives the bare number when there is no unit", () => {
    expect(formatAmount(3, null)).toBe("3");
  });

  /* "a pinch", "to taste" - the unit field carrying the whole answer. */
  it("gives the bare unit when there is no number", () => {
    expect(formatAmount(null, "to taste")).toBe("to taste");
  });

  it("gives nothing when there is neither", () => {
    expect(formatAmount(null, null)).toBe("");
  });
});
