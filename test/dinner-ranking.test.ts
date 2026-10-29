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

const tuesday = { dateIso: TUESDAY, plannedThisWeek: [] };

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
    expect(ranked[1].reason).toBe("Rated down at home");
  });

  it("puts a dish already planned this week below the rest", () => {
    const ranked = rankForEvening(
      [
        dish({ title: "On Monday", lastPlannedIso: "2025-01-01" }),
        dish({ title: "Free", lastPlannedIso: "2026-10-20" }),
      ],
      {
        dateIso: TUESDAY,
        plannedThisWeek: [{ dateIso: "2026-11-02", recipeId: "On Monday" }],
      },
    );
    expect(order(ranked)).toEqual(["Free", "On Monday"]);
    expect(ranked[1].reason).toBe("Already planned this week");
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
        plannedThisWeek: [
          { dateIso: "2026-11-02", recipeId: "Monday's pasta" },
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

  it("says nothing rather than something empty", () => {
    const [plain] = rankForEvening(
      [dish({ title: "D", lastPlannedIso: null, totalMinutes: null })],
      tuesday,
    );
    expect(plain.reason).toBeNull();
  });
});
