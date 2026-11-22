import { describe, expect, it } from "vitest";

import {
  MAX_TIMERS,
  findDurations,
  formatCountdown,
  parseTimers,
  spokenCountdown,
} from "@/lib/cooking-timers";

const secs = (step: string) => findDurations(step).map((d) => d.seconds);

describe("findDurations", () => {
  it("finds a plain duration and the word that leads into it", () => {
    expect(
      findDurations("Simmer for 20 minutes, stirring now and then."),
    ).toEqual([{ display: "20 min", seconds: 1200, label: "simmer" }]);
  });

  it("starts a range at its low end and shows it whole", () => {
    for (const text of [
      "Cook 5-8 minutes",
      "Cook 5–8 minutes",
      "Cook 5 to 8 minutes",
    ]) {
      expect(findDurations(text)).toEqual([
        { display: "5–8 min", seconds: 300, label: "cook" },
      ]);
    }
  });

  it("reads the usual unit spellings", () => {
    expect(secs("Rest 5 mins")).toEqual([300]);
    expect(secs("Rest 5min")).toEqual([300]);
    expect(secs("Bake 1 hour")).toEqual([3600]);
    expect(secs("Bake 2 hrs")).toEqual([7200]);
    expect(secs("Blanch 30 seconds")).toEqual([30]);
    expect(secs("Blanch 30 secs")).toEqual([30]);
  });

  it("reads fractions", () => {
    expect(secs("Roast 1½ hours")).toEqual([5400]);
    expect(secs("Rest ½ hour")).toEqual([1800]);
    expect(secs("Cook 2.5 minutes")).toEqual([150]);
  });

  it("makes one timer of an hour and a few minutes", () => {
    expect(findDurations("Bake 1 hour 30 minutes")).toEqual([
      { display: "1 hr 30 min", seconds: 5400, label: "bake" },
    ]);
    expect(secs("Bake 1 hour and 15 minutes")).toEqual([4500]);
  });

  it("gives one button for each duration in a step", () => {
    const found = findDurations(
      "Sear 3 minutes per side, then rest 5 minutes.",
    );
    expect(found.map((d) => [d.seconds, d.label])).toEqual([
      [180, "sear"],
      [300, "rest"],
    ]);
  });

  it("does not take an adjective for an instruction", () => {
    expect(findDurations("Go for a 15-minute walk while it cools.")).toEqual(
      [],
    );
    expect(findDurations("Use a 20-minute marinade")).toEqual([]);
  });

  it("ignores words with no number, and a number with no unit", () => {
    expect(findDurations("Leave overnight.")).toEqual([]);
    expect(findDurations("Add 2 cups of milk.")).toEqual([]);
    expect(findDurations("Wait a minute.")).toEqual([]);
    expect(findDurations("")).toEqual([]);
  });

  it("does not make a timer of zero", () => {
    expect(findDurations("Cook 0 minutes")).toEqual([]);
  });
});

describe("formatCountdown", () => {
  it("is m:ss under an hour and h:mm:ss over it", () => {
    expect(formatCountdown(200_000)).toBe("3:20");
    expect(formatCountdown(5_000)).toBe("0:05");
    expect(formatCountdown(3_729_000)).toBe("1:02:09");
  });

  it("rounds up, so a running timer never reads 0:00", () => {
    expect(formatCountdown(400)).toBe("0:01");
    expect(formatCountdown(0)).toBe("0:00");
    expect(formatCountdown(-5)).toBe("0:00");
  });

  it("is said in words for a screen reader", () => {
    expect(spokenCountdown(200_000)).toBe("3 minutes 20 seconds");
    expect(spokenCountdown(61_000)).toBe("1 minute 1 second");
    expect(spokenCountdown(3_600_000)).toBe("1 hour");
  });
});

describe("parseTimers", () => {
  const now = 1_000_000_000_000;
  const good = {
    id: "a",
    step: 2,
    label: "simmer",
    endsAt: now + 60_000,
    display: "1 min",
  };

  it("reads what was written", () => {
    expect(parseTimers(JSON.stringify([good]), now)).toEqual([good]);
  });

  it("returns nothing for nothing, junk or the wrong shape", () => {
    expect(parseTimers(null, now)).toEqual([]);
    expect(parseTimers("{not json", now)).toEqual([]);
    expect(parseTimers('{"a":1}', now)).toEqual([]);
  });

  it("skips an entry that is missing a field, and keeps the rest", () => {
    const bad = { id: "b", step: "two", label: "", endsAt: 1, display: "" };
    expect(parseTimers(JSON.stringify([bad, good, null, 7]), now)).toEqual([
      good,
    ]);
  });

  it("forgets one that ended more than an hour ago, keeps a recent one", () => {
    const old = { ...good, id: "old", endsAt: now - 61 * 60 * 1000 };
    const recent = { ...good, id: "recent", endsAt: now - 5 * 60 * 1000 };
    expect(
      parseTimers(JSON.stringify([old, recent]), now).map((t) => t.id),
    ).toEqual(["recent"]);
  });

  it("never returns more than the cap", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      ...good,
      id: `t${i}`,
    }));
    expect(parseTimers(JSON.stringify(many), now)).toHaveLength(MAX_TIMERS);
  });
});
