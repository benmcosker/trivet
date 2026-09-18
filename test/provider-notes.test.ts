import { describe, expect, it } from "vitest";

import { joinLabels, providerNotes } from "@/lib/provider-notes";

const AMAZON_SENTENCE =
  "Amazon has no public ordering API, so this opens a search per ingredient.";

const fresh = {
  id: "AMAZON_FRESH",
  label: "Amazon Fresh",
  description: AMAZON_SENTENCE,
  available: true,
};
const wholeFoods = {
  id: "WHOLE_FOODS",
  label: "Whole Foods",
  description: AMAZON_SENTENCE,
  available: true,
};
const instacart = {
  id: "INSTACART",
  label: "Instacart",
  description: "Builds a cart you can check out.",
  available: true,
};

describe("joining labels the way a sentence would", () => {
  it("handles one, two and three", () => {
    expect(joinLabels(["Amazon Fresh"])).toBe("Amazon Fresh");
    expect(joinLabels(["Amazon Fresh", "Whole Foods"])).toBe(
      "Amazon Fresh and Whole Foods",
    );
    expect(joinLabels(["A", "B", "C"])).toBe("A, B and C");
  });

  it("has nothing to say about nothing", () => {
    expect(joinLabels([])).toBe("");
  });
});

describe("collapsing notes that say the same thing", () => {
  /* The case this exists for: two Amazon storefronts, one constraint. */
  it("says it once, and names both", () => {
    const notes = providerNotes([fresh, wholeFoods]);
    expect(notes).toHaveLength(1);
    expect(notes[0].subject).toBe("Amazon Fresh and Whole Foods");
    expect(notes[0].body).toBe(AMAZON_SENTENCE);
  });

  it("leaves genuinely different notes alone", () => {
    const notes = providerNotes([fresh, wholeFoods, instacart]);
    expect(notes.map((n) => n.subject)).toEqual([
      "Amazon Fresh and Whole Foods",
      "Instacart",
    ]);
  });

  /*
   * Order follows the providers, so the notes stay in step with the row of
   * buttons above them rather than sorting themselves into a new arrangement.
   */
  it("keeps the order the providers came in", () => {
    const notes = providerNotes([instacart, fresh, wholeFoods]);
    expect(notes.map((n) => n.subject)).toEqual([
      "Instacart",
      "Amazon Fresh and Whole Foods",
    ]);
  });

  /*
   * Being unable to use a provider is part of what the note says. Two
   * providers are only saying the same thing if they are unusable for the
   * same reason - otherwise collapsing them would hide one of the reasons.
   */
  it("does not collapse providers that are unavailable differently", () => {
    const notes = providerNotes([
      { ...fresh, available: false, unavailableReason: "No key." },
      { ...wholeFoods, available: false, unavailableReason: "Not in the UK." },
    ]);
    expect(notes).toHaveLength(2);
    expect(notes[0].body).toMatch(/No key\./);
    expect(notes[1].body).toMatch(/Not in the UK\./);
  });

  it("collapses them when the reason matches too", () => {
    const notes = providerNotes([
      { ...fresh, available: false, unavailableReason: "No key." },
      { ...wholeFoods, available: false, unavailableReason: "No key." },
    ]);
    expect(notes).toHaveLength(1);
    expect(notes[0].subject).toBe("Amazon Fresh and Whole Foods");
  });

  it("has a stable key for a group", () => {
    expect(providerNotes([fresh, wholeFoods])[0].key).toBe(
      "AMAZON_FRESH+WHOLE_FOODS",
    );
  });
});
