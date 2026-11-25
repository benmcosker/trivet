import { useSyncExternalStore } from "react";

/**
 * The way back from a recipe to the recipe list it was opened from, with the
 * search, filters, sort and page that list had.
 *
 * The iPhone app has no Back button, and its swipe-back gesture is invisible,
 * so a recipe opened from search results left no visible way back to them: the
 * Recipes tab goes to the whole library, and has to, as a tab. So a card in the
 * list notes the list's address as it is tapped (`RecipeLink`), and the recipe
 * page offers a link back to exactly that (`BackToRecipes`).
 *
 * Kept in memory on the page, like `opening-recipe.ts`: it only has to last
 * while somebody moves between the list and the recipes they open from it. A
 * recipe reached any other way - a shared link, the Plan, a reload - has
 * nothing noted for it and shows no link.
 */
export type WayBack = {
  /** The recipe the list was left for, so only that page offers the way back. */
  recipePath: string;
  /** The list as it was: `/recipes?q=soup&sort=title`. */
  listHref: string;
};

let current: WayBack | null = null;
const listeners = new Set<() => void>();

/** The list is `/recipes`; nowhere else is a list to go back to. */
export const LIBRARY_PATH = "/recipes";

/** Note the list being left, when a card in it is tapped. */
export function rememberWayBack(recipePath: string) {
  if (typeof window === "undefined") return;
  const { pathname, search } = window.location;
  if (pathname !== LIBRARY_PATH) return;
  current = { recipePath, listHref: `${pathname}${search}` };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The way back, or null; always null on the server. */
export function useWayBack(): WayBack | null {
  return useSyncExternalStore(subscribe, currentWayBack, () => null);
}

/** "Back to results" when the list was a search, else "Back to recipes". */
export function wayBackLabel(listHref: string): string {
  const params = new URL(listHref, "https://trivetbox.com").searchParams;
  return params.get("q")?.trim() ? "Back to results" : "Back to recipes";
}

/** What is noted now, outside React. */
export function currentWayBack(): WayBack | null {
  return current;
}

/** Only for tests. */
export function forgetWayBack() {
  current = null;
}
