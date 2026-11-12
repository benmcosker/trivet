import { AppShell } from "@/components/AppShell";
import { PageOutline } from "@/components/PageOutline";

/**
 * A plain outline, so this page does not borrow the library's tiles from
 * `recipes/loading.tsx` above it.
 */
export default function Loading() {
  return (
    <AppShell>
      <PageOutline kind="list" />
    </AppShell>
  );
}
