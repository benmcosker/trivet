import * as Sentry from "@sentry/nextjs";

import {
  TRACES_SAMPLE_RATE,
  dataCollection,
  scrubEvent,
  scrubSpanAttributes,
  sentryEnvironment,
} from "@/lib/sentry-options";

/**
 * Sentry on the Node server: pages, server actions, API routes, the MCP
 * endpoint. Loaded from `instrumentation.ts`. Off without a DSN, so local
 * runs and the tests report nothing.
 */
const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: sentryEnvironment(),
  tracesSampleRate: TRACES_SAMPLE_RATE,
  dataCollection,
  beforeSend: scrubEvent,
  beforeSendSpan: (span) => ({
    ...span,
    attributes: scrubSpanAttributes(span.attributes),
  }),
  /*
   * The app's own log lines - "[trivet] ...", "[mcp] ...", "[sms] ..." - go
   * to Sentry's Logs beside the errors they explain. Warnings and errors
   * only: the info lines are boot chatter.
   */
  integrations: [
    Sentry.consoleLoggingIntegration({ levels: ["warn", "error"] }),
  ],
});
