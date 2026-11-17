import * as Sentry from "@sentry/nextjs";

import { checkEnv, formatMissingRequired } from "@/lib/env";

/**
 * Runs once when the server boots, before it handles a request.
 *
 * Missing required configuration fails here, loudly, rather than surfacing as
 * a 500 on whichever page a family member happened to open first. Optional
 * keys only log what they cost, since the features they gate degrade on
 * purpose.
 */
export async function register() {
  // Sentry first, so a server that refuses to start is reported too.
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./sentry/server");
  if (process.env.NEXT_RUNTIME === "edge") await import("./sentry/edge");

  const { missingRequired, disabledFeatures } = checkEnv();

  if (missingRequired.length > 0) {
    throw new Error(formatMissingRequired(missingRequired));
  }

  for (const { feature, missing, consequence } of disabledFeatures) {
    console.warn(
      `[trivet] ${feature} is off (${missing} unset). ${consequence}`,
    );
  }
}

/**
 * Every error a page, server action or route handler throws, with the route
 * it came from. Next calls this; without a DSN it does nothing.
 */
export const onRequestError = Sentry.captureRequestError;
