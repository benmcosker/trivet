import * as Sentry from "@sentry/nextjs";

import {
  TRACES_SAMPLE_RATE,
  dataCollection,
  scrubEvent,
  scrubSpanAttributes,
  sentryEnvironment,
} from "@/lib/sentry-options";

/**
 * Sentry in the browser, and so in the iPhone app's web view.
 *
 * The DSN is the public one: it is built into the page, which is how a
 * browser knows where to report, and it can only send reports, never read
 * them. Without it this is off. Reports go through `/monitoring` on Trivet's
 * own address (`tunnelRoute` in next.config.ts), so an ad blocker that knows
 * Sentry's address does not swallow them.
 *
 * No session replay: it records what people do on screen, which here means
 * their recipes and lists.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: sentryEnvironment({
    NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
    NODE_ENV: process.env.NODE_ENV,
  }),
  tracesSampleRate: TRACES_SAMPLE_RATE,
  dataCollection,
  beforeSend: scrubEvent,
  beforeSendSpan: (span) => ({
    ...span,
    attributes: scrubSpanAttributes(span.attributes),
  }),
});

/** Times each navigation, so a slow page shows as a slow page. */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
