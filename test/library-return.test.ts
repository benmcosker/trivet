import { afterEach, describe, expect, it, vi } from "vitest";

import {
  currentWayBack,
  forgetWayBack,
  rememberWayBack,
  wayBackLabel,
} from "@/lib/library-return";

/**
 * The way back from a recipe to the list it was opened from
 * (`library-return.ts`): only the list is noted, with its search.
 */
const at = (pathname: string, search = "") =>
  vi.stubGlobal("window", { location: { pathname, search } });

describe("the way back to the recipe list", () => {
  afterEach(() => {
    forgetWayBack();
    vi.unstubAllGlobals();
  });

  it("says results for a search, recipes otherwise", () => {
    expect(wayBackLabel("/recipes?q=soup&sort=title")).toBe("Back to results");
    expect(wayBackLabel("/recipes?sort=title")).toBe("Back to recipes");
    expect(wayBackLabel("/recipes?q=%20")).toBe("Back to recipes");
    expect(wayBackLabel("/recipes")).toBe("Back to recipes");
  });

  it("notes the list with its search, filters and page when a card is tapped", () => {
    at("/recipes", "?q=soup&course=DINNER&page=2");
    rememberWayBack("/recipes/soup-abc");
    expect(currentWayBack()).toEqual({
      recipePath: "/recipes/soup-abc",
      listHref: "/recipes?q=soup&course=DINNER&page=2",
    });
  });

  it("ignores taps anywhere but the list", () => {
    at("/plan");
    rememberWayBack("/recipes/soup-abc");
    expect(currentWayBack()).toBeNull();
  });

  it("keeps the latest tap", () => {
    at("/recipes", "?q=soup");
    rememberWayBack("/recipes/soup-abc");
    at("/recipes", "?q=stew");
    rememberWayBack("/recipes/stew-def");
    expect(currentWayBack()?.listHref).toBe("/recipes?q=stew");
  });
});
