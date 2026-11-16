"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * Tells the browser's Sentry who is signed in, by id only, so an error in
 * the page or the iPhone app's web view says whose it was. Renders nothing;
 * a no-op without a DSN. See `sentry-options.ts`.
 */
export function SentryUser({ id }: { id: string | null }) {
  useEffect(() => {
    Sentry.setUser(id ? { id } : null);
  }, [id]);
  return null;
}
