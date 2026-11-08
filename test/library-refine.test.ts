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
