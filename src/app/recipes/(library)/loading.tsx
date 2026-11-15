import { AppShell } from "@/components/AppShell";
import { PageOutline } from "@/components/PageOutline";

/**
 * Shown at once while the library loads. See `PageOutline`.
 *
 * In the `(library)` group, which changes no address, so that it covers the
 * library page and nothing below it. At `recipes/loading.tsx` it also stood
 * between the library and every recipe, and a recipe opened through it lost
 * its photo morph: this outline has no photo for the card's to travel to.
 * The recipe has its own, which does (`RecipeOutline`).
 */
export default function Loading() {
  return (
    <AppShell>
      <PageOutline kind="library" title={"Recipes"} />
    </AppShell>
  );
}
