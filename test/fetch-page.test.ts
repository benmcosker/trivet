import { describe, expect, it } from "vitest";

import {
  BROWSER_USER_AGENT,
  fetchImageBytes,
  fetchPage,
  isPublicHost,
  type PageFetcher,
} from "@/lib/fetch-page";

/**
 * Every test here drives the fetch through its seam.
 *
 * This container cannot reach the public internet and CI should not want to:
 * a test that fetched a real recipe site would be measuring somebody else's
 * uptime and bot policy, which is exactly the thing this module exists to
 * cope with rather than to depend on.
 */
function answering(
  body: string,
  init: ResponseInit & { url?: string } = {},
): PageFetcher {
  return async (url) => {
    const response = new Response(body, {
      status: init.status ?? 200,
      headers: init.headers ?? { "content-type": "text/html; charset=utf-8" },
    });
    // `Response.url` is read-only and empty on a constructed response, so a
    // redirect has to be simulated.
    Object.defineProperty(response, "url", { value: init.url ?? url });
    return response;
  };
}

function throwing(error: unknown): PageFetcher {
  return async () => {
    throw error;
  };
}

/**
 * A fetcher that redirects along a given chain, recording every address it
 * was actually asked for.
 *
 * The record is the point: the guard is only worth anything if a hop it
 * refuses is a request this code never makes, and a test that only checked
 * the return value would pass just as well if the request went out and the
 * answer was thrown away.
 */
function redirecting(
  chain: Record<string, string>,
  asked: string[],
): PageFetcher {
  return async (url) => {
    asked.push(url);
    const to = chain[url];
    if (to) {
      const response = new Response(null, {
        status: 302,
        headers: { location: to },
      });
      Object.defineProperty(response, "url", { value: url });
      return response;
    }
    const response = new Response("<html>arrived</html>", {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
    Object.defineProperty(response, "url", { value: url });
    return response;
  };
}

describe("fetchPage", () => {
  it("returns the page and the address that answered", async () => {
    const result = await fetchPage("https://example.com/soup", {
      fetchImpl: answering("<html>soup</html>"),
    });

    expect(result).toEqual({
      ok: true,
      html: "<html>soup</html>",
      finalUrl: "https://example.com/soup",
    });
  });

  it("reports the address a redirect landed on", async () => {
    // One of the six sites measured answers 301 before it answers anything
    // else, and the address worth saving as the recipe's source is the one
    // that finally answered.
    const result = await fetchPage("http://onceuponachef.example/x", {
      fetchImpl: answering("<html></html>", {
        url: "https://www.onceuponachef.example/x",
      }),
    });

    expect(result.ok && result.finalUrl).toBe(
      "https://www.onceuponachef.example/x",
    );
  });

  it("sends a browser-like User-Agent", async () => {
    let sent: HeadersInit | undefined;
    await fetchPage("https://example.com", {
      fetchImpl: async (url, init) => {
        sent = init.headers;
        return new Response("<html></html>", {
          headers: { "content-type": "text/html" },
        });
      },
    });

    expect((sent as Record<string, string>)["User-Agent"]).toBe(
      BROWSER_USER_AGENT,
    );
  });

  it.each([
    [403, "refused"],
    [401, "refused"],
    [429, "busy"],
    [503, "refused"],
    [521, "refused"],
    [404, "missing"],
    [410, "missing"],
    [500, "error"],
  ] as const)("reads %i as %s", async (status, failure) => {
    const result = await fetchPage("https://example.com", {
      fetchImpl: answering("nope", { status }),
    });

    expect(result).toEqual({ ok: false, failure, status });
  });

  it("treats a name that does not resolve as nothing being there", async () => {
    // The remedy differs from a refusal: there is no page to print.
    const error = new TypeError("fetch failed");
    (error as { cause?: unknown }).cause = { code: "ENOTFOUND" };

    const result = await fetchPage("https://nope.example", {
      fetchImpl: throwing(error),
    });

    expect(result).toEqual({ ok: false, failure: "missing" });
  });

  it("reads an abort as a timeout", async () => {
    const aborted = new Error("aborted");
    aborted.name = "AbortError";

    const result = await fetchPage("https://slow.example", {
      fetchImpl: throwing(aborted),
    });

    expect(result).toEqual({ ok: false, failure: "timeout" });
  });

  it("gives up on a site that does not answer in time", async () => {
    const result = await fetchPage("https://slow.example", {
      timeoutMs: 5,
      fetchImpl: (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        }),
    });

    expect(result).toEqual({ ok: false, failure: "timeout" });
  });

  it("refuses to read a PDF or an image as a page", async () => {
    const result = await fetchPage("https://example.com/menu.pdf", {
      fetchImpl: answering("%PDF-1.7", {
        headers: { "content-type": "application/pdf" },
      }),
    });

    expect(result).toEqual({ ok: false, failure: "error" });
  });

  it("stops reading at the byte ceiling", async () => {
    // A hostile or merely enormous page must not be able to decide how much
    // memory a serverless function spends.
    const result = await fetchPage("https://huge.example", {
      maxBytes: 500,
      fetchImpl: answering("x".repeat(200_000)),
    });

    expect(result.ok && result.html.length).toBe(500);
  });

  it("decodes using the charset the response declared", async () => {
    const bytes = new Uint8Array([0x63, 0x61, 0x66, 0xe9]); // café, latin-1
    const result = await fetchPage("https://old.example", {
      fetchImpl: async () =>
        new Response(bytes, {
          headers: { "content-type": "text/html; charset=windows-1252" },
        }),
    });

    expect(result.ok && result.html).toBe("café");
  });
});

describe("isPublicHost", () => {
  it.each([
    "localhost",
    "db.internal",
    "printer.local",
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.9",
    "192.168.1.1",
    "169.254.169.254",
    "::1",
  ])("keeps the server away from %s", (host) => {
    expect(isPublicHost(host)).toBe(false);
  });

  it.each(["example.com", "www.smittenkitchen.example", "8.8.8.8"])(
    "allows %s",
    (host) => {
      expect(isPublicHost(host)).toBe(true);
    },
  );
});

describe("fetchImageBytes", () => {
  it("brings back the bytes of a dish photo", async () => {
    const bytes = await fetchImageBytes("https://cdn.example.com/a.jpg", {
      fetchImpl: answering("JPEGish", {
        headers: { "content-type": "image/jpeg" },
      }),
    });

    expect(bytes && Buffer.from(bytes).toString()).toBe("JPEGish");
  });

  it("answers null rather than failing an import", async () => {
    // A missing photo is ten seconds of the cook's time after saving. It is
    // not worth losing a read recipe over.
    expect(
      await fetchImageBytes("https://cdn.example.com/a.jpg", {
        fetchImpl: throwing(new Error("connection reset")),
      }),
    ).toBeNull();

    expect(
      await fetchImageBytes("https://cdn.example.com/a.jpg", {
        fetchImpl: answering("", { status: 404 }),
      }),
    ).toBeNull();
  });

  it("will not fetch an image off the private network", async () => {
    expect(
      await fetchImageBytes("http://169.254.169.254/latest/meta-data/", {
        fetchImpl: answering("secrets"),
      }),
    ).toBeNull();
  });
});

describe("fetchPage redirects", () => {
  it("follows a redirect and reports where it ended up", async () => {
    const asked: string[] = [];
    const result = await fetchPage("https://example.com/soup", {
      fetchImpl: redirecting(
        { "https://example.com/soup": "https://example.com/recipes/soup" },
        asked,
      ),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.finalUrl).toBe("https://example.com/recipes/soup");
    }
    expect(asked).toEqual([
      "https://example.com/soup",
      "https://example.com/recipes/soup",
    ]);
  });

  it("resolves a relative Location against the hop that sent it", async () => {
    const asked: string[] = [];
    const result = await fetchPage("https://example.com/a/b", {
      fetchImpl: redirecting({ "https://example.com/a/b": "../soup" }, asked),
    });

    expect(result.ok).toBe(true);
    expect(asked[1]).toBe("https://example.com/soup");
  });

  it("never requests a redirect into the private range", async () => {
    const asked: string[] = [];
    const result = await fetchPage("https://example.com/soup", {
      fetchImpl: redirecting(
        {
          "https://example.com/soup":
            "http://169.254.169.254/latest/meta-data/",
        },
        asked,
      ),
    });

    expect(result).toEqual({ ok: false, failure: "error" });
    // The guard is worthless if the request went out anyway.
    expect(asked).toEqual(["https://example.com/soup"]);
  });

  it("never requests a redirect to the loopback", async () => {
    const asked: string[] = [];
    await fetchPage("https://example.com/soup", {
      fetchImpl: redirecting(
        { "https://example.com/soup": "http://localhost:3000/admin" },
        asked,
      ),
    });

    expect(asked).toEqual(["https://example.com/soup"]);
  });

  it("refuses a redirect off http into another scheme", async () => {
    const asked: string[] = [];
    const result = await fetchPage("https://example.com/soup", {
      fetchImpl: redirecting(
        { "https://example.com/soup": "file:///etc/passwd" },
        asked,
      ),
    });

    expect(result).toEqual({ ok: false, failure: "error" });
    expect(asked).toEqual(["https://example.com/soup"]);
  });

  it("gives up on a redirect loop rather than hanging", async () => {
    const asked: string[] = [];
    const result = await fetchPage("https://example.com/a", {
      fetchImpl: redirecting(
        {
          "https://example.com/a": "https://example.com/b",
          "https://example.com/b": "https://example.com/a",
        },
        asked,
      ),
    });

    expect(result).toEqual({ ok: false, failure: "error" });
    expect(asked.length).toBeLessThanOrEqual(6);
  });

  it("guards the image fetch's redirects too", async () => {
    const asked: string[] = [];
    const bytes = await fetchImageBytes("https://example.com/dish.jpg", {
      fetchImpl: redirecting(
        { "https://example.com/dish.jpg": "http://10.0.0.1/secret.jpg" },
        asked,
      ),
    });

    expect(bytes).toBeNull();
    expect(asked).toEqual(["https://example.com/dish.jpg"]);
  });
});

describe("a site that is only busy", () => {
  it("is not told to print a PDF", async () => {
    const result = await fetchPage("https://food52.com/recipes/soup", {
      fetchImpl: answering("", { status: 429 }),
    });

    // The distinction the copy rests on: a refusal is permanent for this
    // server and needs a browser, a 429 is the same site saying yes, later.
    expect(result).toEqual({ ok: false, failure: "busy", status: 429 });
  });

  it("keeps 503 with the refusals, because Cloudflare serves its wall as one", async () => {
    const result = await fetchPage("https://example.com/soup", {
      fetchImpl: answering("", { status: 503 }),
    });

    expect(result).toEqual({ ok: false, failure: "refused", status: 503 });
  });
});
