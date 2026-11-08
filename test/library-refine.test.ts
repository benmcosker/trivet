import { describe, expect, it } from "vitest";

import {
  checkRewrites,
  planApply,
  planRevert,
  type CurrentRecipe,
  type ExportedRecipe,
  type Rewrite,
} from "@/lib/library-refine";

const T0 = "2026-11-01T12:00:00.000Z";
const T1 = "2026-11-02T09:30:00.000Z";

const EMPTY = { caloriesKcal: null, proteinG: null, carbsG: null, fatG: null };
const CARD = { caloriesKcal: 650, proteinG: 40, carbsG: 50, fatG: 30 };

const exported = (over: Partial<ExportedRecipe> = {}): ExportedRecipe => ({
  id: "r1",
  publicId: "abc123",
  householdName: "The McMullens",
  title: "Zesty Lemon Chicken Bonanza",
  description: "The card's own blurb.",
  notes: "The card's own tip.",
  instructions: ["Card step one.", "Card step two."],
  sourceName: "Meal Kit Co",
  sourceUrl: null,
  sourceFileName: "card.pdf",
  updatedAt: T0,
  nutrition: EMPTY,
  nutritionEstimated: false,
  ...over,
});

const rewrite = (over: Partial<Rewrite> = {}): Rewrite => ({
  id: "r1",
  title: "Lemon Chicken",
  description: "Bright, quick chicken. Adapted from Meal Kit Co.",
  notes: "Our own tip.",
  instructions: ["Our step one.", "Our step two."],
  ...over,
});

const current = (over: Partial<CurrentRecipe> = {}): CurrentRecipe => {
  const e = exported();
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    notes: e.notes,
    instructions: e.instructions,
    isShared: true,
    updatedAt: T0,
    nutrition: EMPTY,
    nutritionEstimated: false,
    ...over,
  };
};

describe("checkRewrites", () => {
  it("passes a complete rewrite", () => {
    expect(checkRewrites([exported()], [rewrite()])).toEqual([]);
  });

  it("requires the Adapted from credit", () => {
    const problems = checkRewrites(
      [exported()],
      [rewrite({ description: "Bright, quick chicken." })],
    );
    expect(problems).toEqual([
      'Zesty Lemon Chicken Bonanza: description has no "Adapted from"',
    ]);
  });

  it("leaves Marley Spoon uncredited, and refuses a rewrite that names it", () => {
    const card = exported({ sourceName: "Marley Spoon" });
    expect(
      checkRewrites(
        [card],
        [rewrite({ description: "Bright, quick chicken." })],
      ),
    ).toEqual([]);
    expect(
      checkRewrites(
        [card],
        [rewrite({ description: "Bright. Adapted from Marley Spoon." })],
      ),
    ).toEqual(["Zesty Lemon Chicken Bonanza: still names Marley Spoon"]);
  });

  it("refuses to drop steps or notes the original had", () => {
    const problems = checkRewrites(
      [exported()],
      [rewrite({ instructions: [], notes: null })],
    );
    expect(problems).toContain(
      "Zesty Lemon Chicken Bonanza: instructions dropped",
    );
    expect(problems).toContain("Zesty Lemon Chicken Bonanza: notes dropped");
  });

  it("catches a recipe that is not in the export, or rewritten twice", () => {
    expect(checkRewrites([exported()], [rewrite({ id: "nope" })])).toEqual([
      "nope: not in the export",
    ]);
    expect(checkRewrites([exported()], [rewrite(), rewrite()])).toEqual([
      "Zesty Lemon Chicken Bonanza: rewritten twice",
    ]);
  });
});

describe("planApply", () => {
  it("writes the rewrite, conditional on the exported updatedAt", () => {
    const plan = planApply([exported()], [current()], [rewrite()]);
    expect(plan.skipped).toEqual([]);
    expect(plan.changes).toEqual([
      {
        id: "r1",
        title: "Zesty Lemon Chicken Bonanza",
        expectedUpdatedAt: T0,
        data: {
          title: "Lemon Chicken",
          description: "Bright, quick chicken. Adapted from Meal Kit Co.",
          notes: "Our own tip.",
          instructions: ["Our step one.", "Our step two."],
        },
      },
    ]);
  });

  it("only ever writes the four word fields", () => {
    const sneaky = { ...rewrite(), servings: 99, isShared: false } as Rewrite;
    const [change] = planApply([exported()], [current()], [sneaky]).changes;
    expect(Object.keys(change.data).sort()).toEqual([
      "description",
      "instructions",
      "notes",
      "title",
    ]);
  });

  it("never overwrites a recipe edited since the export", () => {
    const plan = planApply(
      [exported()],
      [current({ updatedAt: T1, title: "Mum's Lemon Chicken" })],
      [rewrite()],
    );
    expect(plan.changes).toEqual([]);
    expect(plan.skipped).toEqual([
      {
        id: "r1",
        title: "Zesty Lemon Chicken Bonanza",
        reason: "edited since the export",
      },
    ]);
  });

  it("skips recipes deleted or unshared since, and ones already done", () => {
    expect(planApply([exported()], [], [rewrite()]).skipped[0].reason).toBe(
      "deleted since",
    );
    expect(
      planApply([exported()], [current({ isShared: false })], [rewrite()])
        .skipped[0].reason,
    ).toBe("no longer shared");
    const applied = current({ ...rewrite(), updatedAt: T1 });
    expect(
      planApply([exported()], [applied], [rewrite()]).skipped[0].reason,
    ).toBe("already applied");
  });
});

describe("planRevert", () => {
  it("puts the exported words back on a recipe still holding the rewrite", () => {
    const applied = current({ ...rewrite(), updatedAt: T1 });
    const plan = planRevert([exported()], [applied], [rewrite()]);
    expect(plan.changes).toEqual([
      {
        id: "r1",
        title: "Zesty Lemon Chicken Bonanza",
        expectedUpdatedAt: T1,
        data: {
          title: "Zesty Lemon Chicken Bonanza",
          description: "The card's own blurb.",
          notes: "The card's own tip.",
          instructions: ["Card step one.", "Card step two."],
        },
      },
    ]);
  });

  it("leaves alone a recipe edited by hand after the rewrite", () => {
    const edited = current({
      ...rewrite(),
      title: "Lemon Chicken (ours)",
      updatedAt: T1,
    });
    const plan = planRevert([exported()], [edited], [rewrite()]);
    expect(plan.changes).toEqual([]);
    expect(plan.skipped[0].reason).toMatch(/not holding the rewrite/);
  });
});

describe("nutrition", () => {
  const withCard = rewrite({ nutrition: { ...CARD, estimated: false } });

  it("fills an empty box, and says whether it is an estimate", () => {
    expect(checkRewrites([exported()], [withCard])).toEqual([]);
    const [change] = planApply(
      [exported()],
      [current()],
      [rewrite({ nutrition: { ...CARD, estimated: true } })],
    ).changes;
    expect(change.data).toMatchObject({ ...CARD, nutritionEstimated: true });
  });

  it("never replaces figures the recipe already has", () => {
    expect(
      checkRewrites(
        [exported({ nutrition: { ...EMPTY, caloriesKcal: 500 } })],
        [withCard],
      ),
    ).toEqual(["Zesty Lemon Chicken Bonanza: nutrition is already filled in"]);
  });

  it("refuses an export made before nutrition was exported", () => {
    const old = exported();
    delete old.nutrition;
    expect(checkRewrites([old], [withCard])).toEqual([
      "Zesty Lemon Chicken Bonanza: the export has no nutrition; export again",
    ]);
  });

  it("lets a household's own words through unchanged, with no credit", () => {
    const own = exported({ sourceName: null });
    const sameWords = rewrite({
      title: own.title,
      description: own.description,
      notes: own.notes,
      instructions: own.instructions,
      nutrition: { ...CARD, estimated: true },
    });
    expect(checkRewrites([own], [sameWords])).toEqual([]);
  });

  it("refuses figures outside the recipe form's limits", () => {
    expect(
      checkRewrites(
        [exported()],
        [
          rewrite({
            nutrition: { ...CARD, caloriesKcal: 9000, estimated: true },
          }),
        ],
      ),
    ).toEqual(["Zesty Lemon Chicken Bonanza: Calories out of range"]);
  });

  it("counts the nutrition when deciding a rewrite is already applied", () => {
    const wordsOnly = current({ ...rewrite(), updatedAt: T0 });
    expect(
      planApply([exported()], [wordsOnly], [withCard]).changes,
    ).toHaveLength(1);
    const both = current({ ...rewrite(), nutrition: CARD, updatedAt: T1 });
    expect(planApply([exported()], [both], [withCard]).skipped[0].reason).toBe(
      "already applied",
    );
  });

  it("empties the box again on revert", () => {
    const applied = current({ ...rewrite(), nutrition: CARD, updatedAt: T1 });
    const [change] = planRevert([exported()], [applied], [withCard]).changes;
    expect(change.data).toMatchObject({ ...EMPTY, nutritionEstimated: false });
  });
});
