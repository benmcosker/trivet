import Typography from "@mui/material/Typography";
import * as Sentry from "@sentry/nextjs";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/AppShell";

import { DebugErrorPanel } from "./DebugErrorPanel";
import { debugAllowed } from "./gate";
import { TEST_PREFIX } from "./test-prefix";

/**
 * TEMPORARY: errors on demand, to check that Sentry receives them from
 * production. Delete `src/app/debug/` once it does. See `gate.ts`.
 */
/**
 * Decided on every request. Built without the flag, the page would otherwise
 * be saved once as a 404 and stay one after the flag was turned on.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Error test",
  robots: { index: false, follow: false },
};

export default async function DebugErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ throw?: string }>;
}) {
  if (!(await debugAllowed())) notFound();

  if ((await searchParams).throw === "server") {
    Sentry.setTag("debug", "true");
    throw new Error(`${TEST_PREFIX}: server crash`);
  }

  return (
    <AppShell>
      <Typography variant="h1" sx={{ mb: 2 }}>
        Error test
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 4, maxWidth: "55ch" }}>
        Each button makes Sentry receive one thing, labelled &ldquo;
        {TEST_PREFIX}&rdquo;. Turn SENTRY_TEST_ENABLED off when they have all
        arrived.
      </Typography>
      <DebugErrorPanel />
    </AppShell>
  );
}
