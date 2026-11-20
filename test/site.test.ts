import { afterEach, describe, expect, it, vi } from "vitest";

import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import {
  PUBLIC_PATHS,
  isProductionSite,
  isTrivetApp,
  siteUrl,
} from "@/lib/site";

describe("the site's public face", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("tells the iPhone app from a browser by its marker", () => {
    expect(
      isTrivetApp(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 TrivetApp",
      ),
    ).toBe(true);
    expect(
      isTrivetApp(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
      ),
    ).toBe(false);
    expect(isTrivetApp("NotTrivetAppAtAll")).toBe(false);
    expect(isTrivetApp(null)).toBe(false);
  });

  it("knows its own address, without a trailing slash", () => {
    expect(siteUrl({ BETTER_AUTH_URL: "https://trivetbox.com/" })).toBe(
      "https://trivetbox.com",
    );
    expect(siteUrl({})).toBe("https://trivetbox.com");
  });

  it("is indexed only in production", () => {
    expect(isProductionSite({ VERCEL_ENV: "production" })).toBe(true);
    expect(isProductionSite({ VERCEL_ENV: "preview" })).toBe(false);
    expect(isProductionSite({})).toBe(false);

    vi.stubEnv("VERCEL_ENV", "preview");
    expect(robots().rules).toEqual({ userAgent: "*", disallow: "/" });

    vi.stubEnv("VERCEL_ENV", "production");
    const prod = robots();
    expect(prod.sitemap).toMatch(/\/sitemap\.xml$/);
    expect(JSON.stringify(prod.rules)).toContain('"/recipes"');
  });

  it("lists only the pages anyone can read", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://trivetbox.com");
    expect(sitemap().map((e) => e.url)).toEqual(
      PUBLIC_PATHS.map((p) => `https://trivetbox.com${p === "/" ? "" : p}`),
    );
  });
});
