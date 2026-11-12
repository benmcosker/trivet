import { AppShell } from "@/components/AppShell";
import { PageOutline } from "@/components/PageOutline";

/** Shown at once while the page loads. See `PageOutline`. */
export default function Loading() {
  return (
    <AppShell>
      <PageOutline kind="list" title={"Pantry"} />
    </AppShell>
  );
}
