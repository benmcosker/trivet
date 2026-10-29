import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createShoppingListPage,
  instacartConfigured,
} from "@/lib/shopping/instacart";

const payload = {
  title: "Week of 2026-08-17",
  link_type: "shopping_list" as const,
  line_items: [{ name: "butter" }],
};

describe("createShoppingListPage", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.INSTACART_API_KEY = "test-key";
    process.env.INSTACART_API_BASE = "https://connect.dev.instacart.tools";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  it("explains that no key can be obtained, not merely that one is unset", async () => {
    delete process.env.INSTACART_API_KEY;
    const result = await createShoppingListPage(payload);
    expect(result.ok).toBe(false);
    const error = result.ok === false ? result.error : "";
    // "set INSTACART_API_KEY" would send someone off to find a key that
    // Instacart is not currently issuing to anyone.
    expect(error).toMatch(/not accepting new developer applications/i);
  });

  it("posts to the products_link endpoint with bearer auth and JSON", async () => {
    // Typed parameters so mock.calls is a real tuple rather than [].
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      Response.json({ products_link_url: "https://instacart.com/cart/abc" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createShoppingListPage(payload);

    expect(result).toEqual({ ok: true, url: "https://instacart.com/cart/abc" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://connect.dev.instacart.tools/idp/v1/products/products_link",
    );
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer test-key",
    );
    expect(JSON.parse(init.body as string)).toEqual(payload);
  });

  it("honours a configured base URL, so production can be switched on", async () => {
    process.env.INSTACART_API_BASE = "https://connect.instacart.com";
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      Response.json({ products_link_url: "https://x" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await createShoppingListPage(payload);
    expect(fetchMock.mock.calls[0][0]).toContain("connect.instacart.com");
  });

  it("returns the status when Instacart rejects the request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("bad line item", { status: 422 })),
    );
    const result = await createShoppingListPage(payload);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("422");
  });

  it("does not throw when the network is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    const result = await createShoppingListPage(payload);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("Could not reach");
  });

  it("treats a success response with no link as a failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({})),
    );
    const result = await createShoppingListPage(payload);
    expect(result.ok).toBe(false);
  });

  it("does not throw on a success response that is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>")),
    );
    const result = await createShoppingListPage(payload);
    expect(result.ok).toBe(false);
  });
});

describe("instacartConfigured", () => {
  const originalEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("is false without a key and true with one", () => {
    delete process.env.INSTACART_API_KEY;
    expect(instacartConfigured()).toBe(false);
    process.env.INSTACART_API_KEY = "k";
    expect(instacartConfigured()).toBe(true);
  });
});
