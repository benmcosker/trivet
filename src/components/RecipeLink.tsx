"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { type OpeningRecipe, setOpeningRecipe } from "@/lib/opening-recipe";

/**
 * A link into a recipe that hands the recipe's photo and name to the page's
 * outline as it is tapped (see `opening-recipe.ts`).
 *
 * A client component only for the click; the card inside it stays a server
 * component, passed through as children.
 */
export function RecipeLink({
  opening,
  style,
  children,
}: {
  opening: OpeningRecipe;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <Link
      href={opening.path}
      // Declares the direction for `PageTransition`. Untagged links move no
      // page at all, so this is opt-in rather than something every anchor in
      // the app inherits.
      transitionTypes={["nav-forward"]}
      onClick={() => setOpeningRecipe(opening)}
      style={style}
    >
      {children}
    </Link>
  );
}
