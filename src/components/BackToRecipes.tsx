"use client";

import { usePathname } from "next/navigation";

import { useWayBack, wayBackLabel } from "@/lib/library-return";

import { LinkButton } from "./LinkButton";

/**
 * "← Back to results" above a recipe opened from the recipe list, back to the
 * list exactly as it was left: its search, filters, sort and page
 * (`library-return.ts`). Nothing for a recipe reached any other way.
 *
 * The recipe page shows it in the iPhone app only, which has no Back button;
 * in a browser, Back already does this.
 *
 * The same small text button as the cooking view's "← Back to the recipe",
 * and the same `nav-back` slide the Recipes tab uses to leave a recipe.
 */
export function BackToRecipes() {
  const wayBack = useWayBack();
  const pathname = usePathname();
  if (!wayBack || wayBack.recipePath !== pathname) return null;

  return (
    <LinkButton
      href={wayBack.listHref}
      transitionTypes={["nav-back"]}
      size="small"
      sx={{ ml: -1, mb: 0.5 }}
      data-print="hide"
    >
      ← {wayBackLabel(wayBack.listHref)}
    </LinkButton>
  );
}
