import { describe, expect, it } from "vitest";

import { formatWeekRange, weekName } from "@/lib/week-name";

const THIS_WEEK = "2026-10-26";

describe("weekName", () => {
  it("names this week and next", () => {
    expect(weekName(THIS_WEEK, THIS_WEEK)).toBe("This week");
    expect(weekName("2026-11-02", THIS_WEEK)).toBe("Next week");
  });

  it("knows next week across New Year", () => {
    expect(weekName("2027-01-04", "2026-12-28")).toBe("Next week");
  });
});

describe("formatWeekRange", () => {
  it("writes a week inside one month", () => {
    expect(formatWeekRange("2026-11-02")).toBe("2–8 November");
  });

  it("writes a week across two", () => {
    expect(formatWeekRange("2026-09-28")).toBe("28 September – 4 October");
  });
});
