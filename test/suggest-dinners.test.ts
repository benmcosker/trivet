import { describe, expect, it } from "vitest";

import type { RankableRecipe } from "@/lib/dinner-ranking";
import {
  alternativesFor,
  another,
  suggestDinners,
} from "@/lib/suggest-dinners";

// 2 November 2026 is a Monday.
const WEEK = [
  "2026-11-02",
  "2026-11-03",
  "2026-11-04",
  "2026-11-05",
  "2026-11-06",
];

function dish(
  over: Partial<RankableRecipe> & { title: string },
): RankableRecipe {
  return {
    id: over.title,
    course: "DINNER",
    totalMinutes: 30,
    restMinutes: null,
    timesPlanned: 2,
    lastPlannedIso: "2026-08-01",
    vetoed: false,
    averageStars: null,
    tagSlugs: [],
    ...over,
  };
}

const library = [
  "Ragu",
  "Cacio e Pepe",
  "Skirt Steak",
  "Shrimp Tacos",
  "Tomato Soup",
  "Sheet Pan Chicken",
  "Dal",
].map((title) => dish({ title }));

const titles = (rows: { pick: { recipe: RankableRecipe } | null }[]) =>
  rows.map((r) => r.pick?.recipe.title ?? null);

/** Always the first of the top three, so the ranking alone decides. */
const first = () => 0;

describe("suggestDinners", () => {
  it("gives every evening a different dish", () => {
    const rows = suggestDinners(library, {
      evenings: WEEK,
      plannedThisWeek: [],
      random: Math.random,
    });
    const picked = titles(rows);
    expect(picked).not.toContain(null);
    expect(new Set(picked).size).toBe(WEEK.length);
  });

  it("never proposes what is already on the week", () => {
    const rows = suggestDinners(library, {
      evenings: WEEK.slice(1),
      plannedThisWeek: [
        { dateIso: WEEK[0], slot: "DINNER", recipeId: "Ragu" },
        { dateIso: WEEK[0], slot: "DINNER_2", recipeId: "Dal" },
      ],
      random: first,
    });
    expect(titles(rows)).not.toContain("Ragu");
    expect(titles(rows)).not.toContain("Dal");
  });

  it("proposes dinners only, and nothing rated low at home", () => {
    const rows = suggestDinners(
      [
        dish({ title: "Pancakes", course: "BREAKFAST" }),
        dish({ title: "Mystery", course: null }),
        dish({ title: "Disliked", vetoed: true, lastPlannedIso: null }),
        dish({ title: "Ragu" }),
      ],
      { evenings: WEEK.slice(0, 2), plannedThisWeek: [], random: first },
    );
    expect(titles(rows)).toEqual(["Ragu", null]);
  });

  it("leaves an evening open when the library runs out", () => {
    const rows = suggestDinners(library.slice(0, 2), {
      evenings: WEEK,
      plannedThisWeek: [],
      random: first,
    });
    expect(titles(rows).filter(Boolean)).toHaveLength(2);
    expect(
      rows.slice(2).every((r) => r.pick === null && r.seen.length === 0),
    ).toBe(true);
  });

  it("leaves every evening open with nothing sorted as a dinner", () => {
    const rows = suggestDinners([dish({ title: "Mystery", course: null })], {
      evenings: WEEK,
      plannedThisWeek: [],
    });
    expect(titles(rows)).toEqual(WEEK.map(() => null));
  });

  it("only ever picks from the top three", () => {
    // Ranked by recency: A was missed longest, F most recently.
    const ranked = ["A", "B", "C", "D", "E", "F"].map((title, i) =>
      dish({ title, lastPlannedIso: `2026-0${3 + i}-01` }),
    );
    for (const roll of [0, 0.4, 0.7, 0.99]) {
      const [row] = suggestDinners(ranked, {
        evenings: [WEEK[0]],
        plannedThisWeek: [],
        random: () => roll,
      });
      expect(["A", "B", "C"]).toContain(row.pick?.recipe.title);
    }
  });

  it("keeps a dish's tag off the night after it", () => {
    // Without the pasta on Monday, Cacio e Pepe would lead on Tuesday: it
    // has been missed longest. Next to Ragu it drops below the tacos.
    const rows = suggestDinners(
      [
        dish({ title: "Ragu", tagSlugs: ["pasta"], timesPlanned: 6 }),
        dish({ title: "Cacio e Pepe", tagSlugs: ["pasta"] }),
        dish({
          title: "Tacos",
          tagSlugs: ["mexican"],
          lastPlannedIso: "2026-09-15",
        }),
      ],
      { evenings: WEEK.slice(0, 2), plannedThisWeek: [], random: first },
    );
    expect(titles(rows)).toEqual(["Ragu", "Tacos"]);
  });
});

describe("another", () => {
  const start = () =>
    suggestDinners(library.slice(0, 4), {
      evenings: WEEK.slice(0, 2),
      plannedThisWeek: [],
      random: first,
    });

  it("never gives one evening what another evening already has", () => {
    let rows = start();
    for (let i = 0; i < 6; i++) {
      rows = another(library.slice(0, 4), rows, 0, []);
      expect(rows[0].pick?.recipe.id).not.toBe(rows[1].pick?.recipe.id);
    }
  });

  it("walks the list before going back to the start", () => {
    let rows = start();
    const shown = [rows[0].pick!.recipe.id];
    // Four dishes, one on the other evening: three to see on this one.
    for (let i = 0; i < 2; i++) {
      rows = another(library.slice(0, 4), rows, 0, []);
      shown.push(rows[0].pick!.recipe.id);
    }
    expect(new Set(shown).size).toBe(3);
  });

  it("has nothing to offer when there is nothing else", () => {
    const rows = suggestDinners(library.slice(0, 2), {
      evenings: WEEK.slice(0, 2),
      plannedThisWeek: [],
      random: first,
    });
    expect(alternativesFor(library.slice(0, 2), rows, 0, [])).toEqual([]);
    expect(another(library.slice(0, 2), rows, 0, [])).toBe(rows);
  });
});
