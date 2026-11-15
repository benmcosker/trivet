import { AppShell } from "@/components/AppShell";
import { PageTransition } from "@/components/PageTransition";
import { RecipeOutline } from "@/components/RecipeOutline";

/**
 * Shown at once while the recipe loads. Opened from a card, it already has
 * the recipe's photo and name, and the photo morphs into it; see
 * `RecipeOutline`.
 */
export default function Loading() {
  return (
    <AppShell>
      <PageTransition>
        <RecipeOutline />
      </PageTransition>
    </AppShell>
  );
}
