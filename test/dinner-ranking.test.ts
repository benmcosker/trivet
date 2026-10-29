import { describe, expect, it } from "vitest";

import { rankForEvening, type RankableRecipe } from "@/lib/dinner-ranking";

// 3 November 2026 is a Tuesday; 8 November a Sunday.
const TUESDAY = "2026-11-03";
const SUNDAY = "2026-11-08";

function dish(
  over: Partial<RankableRecipe> & { title: string },
): RankableRecipe {
  return {
    id: over.title,
    course: "DINNER",
    totalMinutes: 30,
    restMinutes: null,
    timesPlanned: 2,
    lastPlannedIso: "2026-09-01",
    vetoed: false,
    averageStars: null,
    tagSlugs: [],
    ...over,
  };
}

const order = (ranked: { recipe: RankableRecipe }[]) =>
  ranked.map((r) => r.recipe.title);

const tuesday = { dateIso: TUESDAY, slot: "DINNER", plannedThisWeek: [] };

describe("rankForEvening", () => {
  it("offers dinners only - pancakes are never on the list", () => {
    const ranked = rankForEvening(
      [
        dish({ title: "Ragu" }),
        dish({ title: "Pancakes", course: "BREAKFAST" }),
        dish({ title: "Mystery", course: null }),
      ],
      tuesday,
    );
    expect(order(ranked)).toEqual(["Ragu"]);
  });

  it("puts what has not been had in a while ahead of last week's", () => {
    const ranked = rankForEvening(
      [
        dish({ title: "Had last week", lastPlannedIso: "2026-10-27" }),
        dish({ title: "Had in summer", lastPlannedIso: "2026-08-01" }),
      ],
      tuesday,
    );
    expect(order(ranked)).toEqual(["Had in summer", "Had last week"]);
  });

  it("favours quick food on a Tuesday and not on a Sunday", () => {
    const quick = dish({ title: "Quick", totalMinutes: 25 });
    const long = dish({ title: "Long braise", totalMinutes: 240 });

    expect(order(rankForEvening([long, quick], tuesday))[0]).toBe("Quick");
    // At the weekend both fit, so neither is pushed down for its time.
    const sunday = rankForEvening([long, quick], {
      dateIso: SUNDAY,
      slot: "DINNER",
      plannedThisWeek: [],
    });
    expect(order(sunday)).toEqual(["Long braise", "Quick"]); // tie -> title
  });

  it("treats an unknown time as neither quick nor slow", () => {
    const ranked = rankForEvening(
      [
        dish({ title: "Long", totalMinutes: 200 }),
        dish({ title: "Unknown", totalMinutes: null }),
        dish({ title: "Quick", totalMinutes: 20 }),
      ],
      tuesday,
    );
    expect(order(ranked)).toEqual(["Quick", "Unknown", "Long"]);
  });

  it("sends what the household rated down to the bottom, and says why", () => {
    const ranked = rankForEvening(
      [
        dish({ title: "Disliked", vetoed: true, lastPlannedIso: "2025-01-01" }),
        dish({ title: "Fine", lastPlannedIso: "2026-10-20" }),
      ],
      tuesday,
    );
    expect(order(ranked)).toEqual(["Fine", "Disliked"]);
    expect(ranked[1].reason).toBe("Rated low at home");
  });

  it("puts a dish already planned this week below the rest", () => {
    const ranked = rankForEvening(
      [
        dish({ title: "On Monday", lastPlannedIso: "2025-01-01" }),
        dish({ title: "Free", lastPlannedIso: "2026-10-20" }),
      ],
      {
        dateIso: TUESDAY,
        slot: "DINNER",
        plannedThisWeek: [
          { dateIso: "2026-11-02", slot: "DINNER", recipeId: "On Monday" },
        ],
      },
    );
    expect(order(ranked)).toEqual(["Free", "On Monday"]);
    // Which evening, not just "this week" - shorter, and more useful.
    expect(ranked[1].reason).toBe("Already on Monday");
  });

  it("nudges a second pasta away from the night after the first", () => {
    const ranked = rankForEvening(
      [
        dish({ title: "Monday's pasta", tagSlugs: ["pasta"] }),
        dish({ title: "Cacio", tagSlugs: ["pasta", "weeknight"] }),
        dish({ title: "Tacos", tagSlugs: ["mexican", "weeknight"] }),
      ],
      {
        dateIso: TUESDAY,
        slot: "DINNER",
        plannedThisWeek: [
          { dateIso: "2026-11-02", slot: "DINNER", recipeId: "Monday's pasta" },
        ],
      },
    );
    // Tacos ahead of Cacio despite the identical history: pasta clashes,
    // and "weeknight", shared by both, does not count as a clash.
    const ranks = order(ranked);
    expect(ranks.indexOf("Tacos")).toBeLessThan(ranks.indexOf("Cacio"));
  });

  it("levels a regular off, so a favourite cannot crowd everything out", () => {
    const ranked = rankForEvening(
      [
        dish({
          title: "Planned 50 times",
          timesPlanned: 50,
          lastPlannedIso: "2026-10-27",
        }),
        dish({
          title: "Missed for months",
          timesPlanned: 3,
          lastPlannedIso: "2026-06-01",
        }),
      ],
      tuesday,
    );
    expect(order(ranked)[0]).toBe("Missed for months");
  });

  it("gives one reason, in words a person would use", () => {
    const [weeks] = rankForEvening(
      [dish({ title: "A", lastPlannedIso: "2026-09-15", totalMinutes: 200 })],
      tuesday,
    );
    expect(weeks.reason).toBe("Last planned seven weeks ago");

    const [quick] = rankForEvening(
      [dish({ title: "B", lastPlannedIso: "2026-10-30", totalMinutes: 25 })],
      tuesday,
    );
    expect(quick.reason).toBe("25 min, for a Tuesday");

    const [regular] = rankForEvening(
      [
        dish({
          title: "C",
          timesPlanned: 9,
          lastPlannedIso: "2026-10-27",
          totalMinutes: 200,
        }),
      ],
      tuesday,
    );
    expect(regular.reason).toBe("A regular, planned nine times");
  });

  it("flags the evening's own first dinner when picking a second", () => {
    // "What else are we eating on Tuesday?" with Cacio already the first
    // dinner: Cacio is a duplicate, not a suggestion.
    const ranked = rankForEvening(
      [dish({ title: "Cacio" }), dish({ title: "Tacos" })],
      {
        dateIso: TUESDAY,
        slot: "DINNER_2",
        plannedThisWeek: [
          { dateIso: TUESDAY, slot: "DINNER", recipeId: "Cacio" },
        ],
      },
    );
    expect(order(ranked)).toEqual(["Tacos", "Cacio"]);
    expect(ranked[1].reason).toBe("Already on Tuesday");
  });

  it("does not flag the dish in the slot being replaced", () => {
    const [only] = rankForEvening([dish({ title: "Cacio" })], {
      dateIso: TUESDAY,
      slot: "DINNER",
      plannedThisWeek: [
        { dateIso: TUESDAY, slot: "DINNER", recipeId: "Cacio" },
      ],
    });
    expect(only.reason ?? "").not.toMatch(/Already/);
  });

  it("keeps a dish that cannot be made tonight off the top of a Tuesday", () => {
    // Zuni: ninety minutes of cooking and a day of salting. Missed since
    // July is not enough to put it above a quick dish had recently.
    const ranked = rankForEvening(
      [
        dish({
          title: "Zuni",
          totalMinutes: 1530,
          restMinutes: 1440,
          lastPlannedIso: "2026-07-26",
        }),
        dish({
          title: "Cacio",
          totalMinutes: 20,
          lastPlannedIso: "2026-10-22",
        }),
      ],
      tuesday,
    );
    expect(order(ranked)).toEqual(["Cacio", "Zuni"]);
  });

  it("says an overnight rest as starting the day before", () => {
    const [zuni] = rankForEvening(
      [
        dish({
          title: "Zuni",
          totalMinutes: 1530,
          restMinutes: 1440,
          lastPlannedIso: null,
        }),
      ],
      { dateIso: "2026-11-07", slot: "DINNER", plannedThisWeek: [] },
    );
    expect(zuni.reason).toBe("Start it the day before");
  });

  it("switches from weeks to the month at the twelve-week cap", () => {
    // 85 days before Tuesday 3 November.
    const [late] = rankForEvening(
      [dish({ title: "E", lastPlannedIso: "2026-08-10", totalMinutes: 200 })],
      tuesday,
    );
    expect(late.reason).toBe("Last planned in August");
  });

  it("names the year once a month alone would read as this one", () => {
    const [old] = rankForEvening(
      [dish({ title: "F", lastPlannedIso: "2025-11-20", totalMinutes: 200 })],
      tuesday,
    );
    expect(old.reason).toBe("Last planned in November 2025");
  });

  it("leaves a high star average to the stars, not a reason line", () => {
    const [starred] = rankForEvening(
      [
        dish({
          title: "G",
          averageStars: 4.6,
          lastPlannedIso: "2026-10-30",
          totalMinutes: 200,
        }),
      ],
      tuesday,
    );
    expect(starred.reason).toBeNull();
  });

  it("says nothing rather than something empty", () => {
    const [plain] = rankForEvening(
      [dish({ title: "D", lastPlannedIso: null, totalMinutes: null })],
      tuesday,
    );
    expect(plain.reason).toBeNull();
  });
});
