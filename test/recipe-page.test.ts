import { describe, expect, it } from "vitest";

import {
  PAGE_SIZE,
  PICKER_PAGE_SIZE,
  pageCount,
  pageRange,
  pageWindow,
  parsePage,
} from "@/lib/recipe-page";

describe("reading a page number off a URL", () => {
  it("takes a sensible one at its word", () => {
    expect(parsePage("3")).toBe(3);
    expect(parsePage("1")).toBe(1);
  });

  it("falls back to the first page rather than throwing", () => {
    // Every one of these is an ordinary thing to find in a URL.
    expect(parsePage(undefined)).toBe(1);
    expect(parsePage("")).toBe(1);
    expect(parsePage("banana")).toBe(1);
    expect(parsePage("2; DROP TABLE recipe")).toBe(1);
  });

  /*
   * Zero and negatives are a malformed URL rather than a page somebody was
   * reading, so they clamp in silence. A page past the end is a different
   * story, and the page tells it out loud.
   */
  it("clamps nonsense below one without comment", () => {
    expect(parsePage("0")).toBe(1);
    expect(parsePage("-4")).toBe(1);
  });

  it("truncates a fractional page rather than rounding past one", () => {
    expect(parsePage("2.9")).toBe(2);
  });

  /* Next repeats the parameter, and the first is the one the link set. */
  it("takes the first when the parameter is repeated", () => {
    expect(parsePage(["2", "5"])).toBe(2);
  });
});

describe("how many pages a library makes", () => {
  it("counts a partial last page as a page", () => {
    expect(pageCount(PAGE_SIZE + 1)).toBe(2);
    expect(pageCount(163)).toBe(7);
  });

  it("gives an exact multiple no trailing empty page", () => {
    expect(pageCount(PAGE_SIZE * 3)).toBe(3);
  });

  /* An empty library is on page one of one, not page one of zero. */
  it("is one page even with nothing in it", () => {
    expect(pageCount(0)).toBe(1);
  });
});

describe("which numbers the control draws", () => {
  /* The design's own example: seven pages, sitting on the second. */
  it("matches the design at page 2 of 7", () => {
    expect(pageWindow(2, 7)).toEqual([1, 2, 3, 4, "gap", 7]);
  });

  it("draws every number when they all fit", () => {
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("keeps the first and last reachable from the middle", () => {
    expect(pageWindow(10, 20)).toEqual([1, "gap", 8, 9, 10, 11, 12, "gap", 20]);
  });

  /*
   * An ellipsis standing in for a single page is the same width as the number
   * it hides, so it saves nothing and costs a destination.
   */
  it("draws the number rather than a gap standing for one page", () => {
    expect(pageWindow(5, 8)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(pageWindow(1, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("has one number when there is one page", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
  });
});

/*
 * The picker paginates the same library at a different size, so the two page
 * sizes share the arithmetic. A size-specific bug here would be invisible on
 * the library page and wrong in the dialog.
 */
describe("the picker's smaller pages", () => {
  it("counts pages at its own size", () => {
    expect(pageCount(70, PICKER_PAGE_SIZE)).toBe(6);
    expect(pageCount(PICKER_PAGE_SIZE, PICKER_PAGE_SIZE)).toBe(1);
    expect(pageCount(PICKER_PAGE_SIZE + 1, PICKER_PAGE_SIZE)).toBe(2);
  });

  it("ranges at its own size", () => {
    expect(pageRange(1, 70, PICKER_PAGE_SIZE)).toEqual({ first: 1, last: 12 });
    expect(pageRange(6, 70, PICKER_PAGE_SIZE)).toEqual({ first: 61, last: 70 });
  });

  it("leaves the library's own size alone", () => {
    expect(pageCount(70)).toBe(3);
    expect(pageRange(1, 70)).toEqual({ first: 1, last: 24 });
  });
});

describe("the range line", () => {
  it("counts from one, and stops at what is there", () => {
    expect(pageRange(1, 163)).toEqual({ first: 1, last: 24 });
    expect(pageRange(2, 163)).toEqual({ first: 25, last: 48 });
    // The last page is short, and says so rather than claiming a full 24.
    expect(pageRange(7, 163)).toEqual({ first: 145, last: 163 });
  });

  it("has nothing to report about an empty search", () => {
    expect(pageRange(1, 0)).toEqual({ first: 0, last: 0 });
  });
});
