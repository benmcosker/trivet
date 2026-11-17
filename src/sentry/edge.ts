import * as Sentry from "@sentry/nextjs";

import {
  TRACES_SAMPLE_RATE,
  dataCollection,
  scrubEvent,
  sentryEnvironment,
} from "@/lib/sentry-options";

/** Sentry on the edge runtime, for anything that runs there. See `server.ts`. */
const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: sentryEnvironment(),
  tracesSampleRate: TRACES_SAMPLE_RATE,
  dataCollection,
  beforeSend: scrubEvent,
  beforeSendTransaction: scrubEvent,
});
