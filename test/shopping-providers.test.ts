import { afterEach, describe, expect, it } from "vitest";

import {
  formatAmount,
  formatAsPlainText,
  getProvider,
  listProviders,
  listUsableProviders,
} from "@/lib/shopping";
import type { GroceryLine } from "@/lib/grocery";

const lines: GroceryLine[] = [
  {
    name: "chicken breast",
    quantity: 2,
    unit: "lb",
    fromRecipes: ["Piccata"],
    recipeId: "r1",
  },
  {
    name: "salt",
    quantity: null,
    unit: null,
    fromRecipes: ["Piccata"],
    recipeId: "r1",
  },
];

describe("listProviders", () => {
  const originalEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("lists Instacart and nothing else", () => {
    // Amazon Fresh and Whole Foods were search links per ingredient, not a
    // basket, and were removed. Their ids stay in the enum for old records.
    expect(listProviders().map((p) => p.id)).toEqual(["INSTACART"]);
    expect(getProvider("AMAZON_FRESH")).toBeUndefined();
    expect(getProvider("WHOLE_FOODS")).toBeUndefined();
  });

  it("marks Instacart unavailable and explains that no key can be had", () => {
    delete process.env.INSTACART_API_KEY;
    const instacart = listProviders().find((p) => p.id === "INSTACART")!;
    expect(instacart.available).toBe(false);
    expect(instacart.unavailableReason).toMatch(
      /closed new developer applications/i,
    );
    // Says the integration survives, so nobody assumes it needs rebuilding.
    expect(instacart.unavailableReason).toMatch(/built/i);
  });

  it("marks Instacart available once a key is configured", () => {
    process.env.INSTACART_API_KEY = "k";
    expect(listProviders().find((p) => p.id === "INSTACART")!.available).toBe(
      true,
    );
  });
});

describe("what the planner is offered", () => {
  it("leaves Instacart out entirely while no key exists", () => {
    // Not hidden because it is Instacart - hidden because it cannot do
    // anything. A greyed-out button above a sentence explaining that it will
    // never work is a notice, not an option, and it would sit on the page
    // every week saying the same thing.
    delete process.env.INSTACART_API_KEY;
    expect(listUsableProviders()).toEqual([]);
  });

  it("brings it back on its own the day a key is set", () => {
    // The point of filtering on `available` rather than naming Instacart: no
    // code change is needed when applications reopen.
    process.env.INSTACART_API_KEY = "k";
    expect(listUsableProviders().map((p) => p.id)).toContain("INSTACART");
  });

  it("keeps the registry complete either way", () => {
    // Hiding it from the UI must not unregister it, or the handoff route
    // would fail to find the adapter for a provider it was asked to use.
    delete process.env.INSTACART_API_KEY;
    expect(listProviders().map((p) => p.id)).toContain("INSTACART");
    expect(getProvider("INSTACART")).toBeDefined();
  });

  it("offers every provider it lists as usable", () => {
    delete process.env.INSTACART_API_KEY;
    expect(listUsableProviders().every((p) => p.available)).toBe(true);
  });
});

describe("formatting", () => {
  it("renders amounts with and without units", () => {
    expect(formatAmount(lines[0])).toBe("2 lb");
    expect(formatAmount(lines[1])).toBe("");
    expect(formatAmount({ ...lines[0], unit: null, quantity: 3 })).toBe("3");
  });

  it("renders one item per line, under an aisle heading", () => {
    const text = formatAsPlainText(lines);
    expect(text).toContain("Meat & fish:\n2 lb chicken breast");
    expect(text).toContain("Spices & seasoning:\nsalt");
  });

  it("separates aisles with a blank line", () => {
    // Every notes app renders that as a break, and no list importer treats it
    // as an item.
    expect(formatAsPlainText(lines)).toContain("\n\n");
  });

  it("keeps every item when grouping the text", () => {
    const text = formatAsPlainText(lines);
    for (const line of lines) expect(text).toContain(line.name);
  });
});
