import { describe, expect, it } from "vitest";

import {
  DINNER_SLOTS,
  FIRST_DINNER,
  SHOPPING_SLOTS,
  SIDE_SLOTS,
} from "@/lib/meal-slots";

describe("what an evening holds", () => {
  it("leads with the dinner that gets the photo", () => {
    expect(FIRST_DINNER).toBe("DINNER");
    expect(DINNER_SLOTS[0]).toBe(FIRST_DINNER);
  });

  it("shops from every slot it plans", () => {
    // The failure this guards: a slot the planner offers but the shopping
    // list never queries, so a dish is planned and quietly missing from the
    // list you walk round the shop with.
    for (const slot of [...DINNER_SLOTS, ...SIDE_SLOTS]) {
      expect(SHOPPING_SLOTS).toContain(slot);
    }
    expect(SHOPPING_SLOTS).toHaveLength(
      DINNER_SLOTS.length + SIDE_SLOTS.length,
    );
  });

  it("has no duplicates, which would double an evening's ingredients", () => {
    expect(new Set(SHOPPING_SLOTS).size).toBe(SHOPPING_SLOTS.length);
  });
});
