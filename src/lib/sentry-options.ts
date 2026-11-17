import type * as Sentry from "@sentry/nextjs";

type DataCollection = NonNullable<
  NonNullable<Parameters<typeof Sentry.init>[0]>["dataCollection"]
>;

/**
 * What Sentry may know, shared by the server, edge and browser setups.
 *
 * Errors are the point; the people are not. A report carries the stack, the
 * route, the browser, and the signed-in person's id (`setUser` in
 * `session.ts`) - enough to find the failure and ask who saw it, nothing that
 * says what anyone cooks. Sentry 11 collects much more by default: request
 * and response bodies (recipe text, an assistant's requests), cookies (the
 * sign-in session), every header, database query data, the arguments and
 * results of MCP tool calls, and local variables from each stack frame. All
 * of that is off here, each named, so turning one back on is a decision.
 */
export const dataCollection: DataCollection = {
  // Only the id we set ourselves; not the IP address or anything inferred.
  userInfo: false,
  cookies: false,
  httpHeaders: {
    request: { allow: ["user-agent", "content-type", "accept", "referer"] },
    response: false,
  },
  httpBodies: [],
  // A search for "cod" is fine to see. A sign-in callback's code is not.
  urlQueryParams: { deny: ["code", "state", "token", "error_description"] },
  genAI: { inputs: false, outputs: false },
  mcp: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
};

/**
 * "production" or "preview" on Vercel, "development" anywhere else, so preview
 * deploys never land among the real errors.
 */
export function sentryEnvironment(
  env: Record<string, string | undefined> = process.env,
): string {
  return (
    env.VERCEL_ENV ??
    env.NEXT_PUBLIC_VERCEL_ENV ??
    (env.NODE_ENV === "production" ? "production" : "development")
  );
}

/**
 * One request in ten is traced: enough to see which pages are slow at this
 * size without spending the free allowance on the same page loads.
 */
export const TRACES_SAMPLE_RATE = 0.1;

/** The only request headers a report keeps. */
const KEPT_HEADERS = new Set([
  "user-agent",
  "content-type",
  "accept",
  "referer",
]);

type WithRequest = {
  request?: {
    headers?: Record<string, string>;
    cookies?: unknown;
    data?: unknown;
  };
};

/**
 * The last word on what leaves an error report.
 *
 * `dataCollection` should already have done this, but measured against a
 * production build it did not narrow the headers on server errors: every
 * request header was sent. An assistant's request carries its access token
 * in `Authorization`, so this does not rely on it: only the four headers
 * above survive, and cookies and bodies go whatever else let them through.
 */
export function scrubEvent<T extends WithRequest>(event: T): T {
  const request = event.request;
  if (!request) return event;
  if (request.headers) {
    request.headers = Object.fromEntries(
      Object.entries(request.headers).filter(([name]) =>
        KEPT_HEADERS.has(name.toLowerCase()),
      ),
    );
  }
  delete request.cookies;
  delete request.data;
  return event;
}

/**
 * The same rule for timing data.
 *
 * Sentry 11 streams spans rather than sending whole transactions, and a
 * streamed span skips `beforeSendTransaction` (Sentry says so in the logs on
 * every cold start). What a span knows about its request is in attributes
 * named `http.request.header.<name>`, `http.request.cookies` and the like, so
 * this keeps the same four headers and drops cookies and bodies there too.
 */
export function scrubSpanAttributes(
  attributes: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(attributes)
      .filter(([key]) => {
        const name = key.toLowerCase();
        const header = /^http\.(request|response)\.header\.(.+)$/.exec(name);
        if (header) {
          return header[1] === "request" && KEPT_HEADERS.has(header[2]);
        }
        // The query string can carry a sign-in code on the assistant
        // connection pages; the path and route say enough about a slow page.
        if (name === "url.query" || name === "http.query") return false;
        return !/cookie|\.body\b|request\.data/.test(name);
      })
      .map(([key, value]) =>
        key === "url.full" && typeof value === "string"
          ? [key, value.split(/[?#]/)[0]]
          : [key, value],
      ),
  );
}
