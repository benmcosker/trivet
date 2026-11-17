import { describe, expect, it } from "vitest";

import {
  scrubEvent,
  scrubSpanAttributes,
  sentryEnvironment,
} from "@/lib/sentry-options";

describe("scrubEvent", () => {
  it("keeps only the allowed headers, and never a token or a cookie", () => {
    const event = scrubEvent({
      request: {
        headers: {
          "User-Agent": "Safari",
          accept: "text/html",
          authorization: "Bearer secret",
          cookie: "session=secret",
          "x-forwarded-for": "203.0.113.7",
        },
        cookies: { session: "secret" },
        data: '{"title":"Grandma\'s ragu"}',
      },
    });
    expect(event.request?.headers).toEqual({
      "User-Agent": "Safari",
      accept: "text/html",
    });
    expect(event.request).not.toHaveProperty("cookies");
    expect(event.request).not.toHaveProperty("data");
  });

  it("leaves an event without a request alone", () => {
    const event: { message: string; request?: undefined } = { message: "boot" };
    expect(scrubEvent(event)).toEqual({ message: "boot" });
  });
});

describe("sentryEnvironment", () => {
  it("names Vercel's environment, so previews stay apart", () => {
    expect(sentryEnvironment({ VERCEL_ENV: "preview" })).toBe("preview");
    expect(sentryEnvironment({ NEXT_PUBLIC_VERCEL_ENV: "production" })).toBe(
      "production",
    );
  });

  it("calls anything else development unless it is a production build", () => {
    expect(sentryEnvironment({})).toBe("development");
    expect(sentryEnvironment({ NODE_ENV: "production" })).toBe("production");
  });
});

describe("scrubSpanAttributes", () => {
  it("keeps timing and the allowed headers, drops tokens, cookies and bodies", () => {
    expect(
      scrubSpanAttributes({
        "http.route": "/recipes/[id]",
        "http.response.status_code": 200,
        "http.request.header.user_agent": "x",
        "http.request.header.user-agent": "Safari",
        "http.request.header.authorization": "Bearer secret",
        "http.request.header.cookie": "session=secret",
        "http.response.header.set-cookie": "session=secret",
        "http.request.cookies": "session=secret",
        "http.request.body": "{}",
        "url.full": "https://trivetbox.com/consent?code=abc&state=xyz",
        "url.query": "code=abc&state=xyz",
      }),
    ).toEqual({
      "url.full": "https://trivetbox.com/consent",
      "http.route": "/recipes/[id]",
      "http.response.status_code": 200,
      "http.request.header.user-agent": "Safari",
    });
  });
});
