import { useSyncExternalStore } from "react";

import type { RecipeFactsData } from "@/components/RecipeFacts";

/**
 * The recipe a card was just tapped for, so the recipe page's outline can
 * show it before the page arrives.
 *
 * The outline and the photo morph used to compete. A generic outline has no
 * photo in it, so the card's photo had nowhere to travel and the morph never
 * ran; leaving the outline out kept the morph but left a tap with nothing to
 * show for itself. The card already knows what sits at the top of the
 * recipe - its name, its photo and the facts between them - so it hands
 * them over on tap, and the outline draws them: the photo morphs into it at
 * once, in the place the page will put it, and only the ingredients and
 * method wait. Drawn as option C on the board
 * https://claude.ai/artifact/Wpwicc6HehoAybuWdmbhgk.
 *
 * Kept in memory on the page, not in storage: it only has to live from the
 * tap to the outline. Arriving any other way (a hard load, the Plan, a
 * search result) finds nothing for that address and draws the plain outline.
 */
export type OpeningRecipe = {
  /** The address the card links to, which the outline checks it is on. */
  path: string;
  id: string;
  title: string;
  imageUrl: string | null;
  /**
   * The card's own `sizes`, so the outline asks for the file the card already
   * downloaded: drawn at once from cache rather than fetched while the photo
   * is meant to be moving. The recipe page then swaps in the sharp one.
   */
  sizes: string;
  /** What the page says between the title and the photo; see `RecipeFacts`. */
  facts: RecipeFactsData;
  /** How often this household has made it; the library looks it up. */
  madeLine: string | null;
};

let current: OpeningRecipe | null = null;
const listeners = new Set<() => void>();

export function setOpeningRecipe(recipe: OpeningRecipe) {
  current = recipe;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** What was tapped, or null; always null on the server. */
export function useOpeningRecipe(): OpeningRecipe | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}
