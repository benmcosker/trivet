"use server";

import * as Sentry from "@sentry/nextjs";

import { reportError } from "@/lib/report-error";

import { debugAllowed } from "./gate";
import { TEST_PREFIX } from "./test-prefix";

/** A failure caught and survived, reported the way the real ones are. */
export async function reportCaughtFailure(): Promise<string> {
  if (!(await debugAllowed())) return "Not available.";
  Sentry.setTag("debug", "true");
  reportError(
    "[debug] caught failure",
    new Error(`${TEST_PREFIX}: caught failure`),
  );
  return "Reported a caught failure. Look for it under Issues, tagged area: debug.";
}

/** A log line, the way the app's own `[trivet]` warnings are written. */
export async function writeLogLine(): Promise<string> {
  if (!(await debugAllowed())) return "Not available.";
  console.warn(`[debug] ${TEST_PREFIX}: log line`);
  return "Wrote a log line. Look for it under Logs.";
}
