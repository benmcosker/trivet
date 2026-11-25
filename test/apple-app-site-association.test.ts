import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  APP_ID,
  GET,
  SITE_ASSOCIATION,
} from "@/app/.well-known/apple-app-site-association/route";

/**
 * Universal Links: which trivetbox.com links open in the iPhone app. A wrong
 * App ID or rule fails silently - links just keep opening in Safari - so the
 * file is pinned here, including against the Xcode project it must match.
 */
const project = readFileSync(
  join(__dirname, "../ios/TrivetBox/TrivetBox.xcodeproj/project.xcproj"),
  "utf8",
);
const entitlements = readFileSync(
  join(__dirname, "../ios/TrivetBox/TrivetBox/TrivetBox.entitlements"),
  "utf8",
);

type Component = { "/": string; exclude?: boolean };
const components = SITE_ASSOCIATION.applinks.details[0]
  .components as Component[];

/** What iOS does: the first rule whose pattern matches decides. */
function opensInApp(path: string): boolean {
  for (const rule of components) {
    const pattern = new RegExp(
      `^${rule["/"].replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`,
    );
    if (pattern.test(path)) return !rule.exclude;
  }
  return false;
}

describe("apple-app-site-association", () => {
  it("names the app the Xcode project builds", () => {
    const team = project.match(/"DEVELOPMENT_TEAM": "(\w+)"/)?.[1];
    expect(APP_ID).toBe(`${team}.com.trivetbox.app`);
    expect(project).toContain(
      '"PRODUCT_BUNDLE_IDENTIFIER": "com.trivetbox.app"',
    );
  });

  it("is claimed by the app's entitlements", () => {
    expect(entitlements).toContain("applinks:trivetbox.com");
    expect(entitlements).toContain("webcredentials:trivetbox.com");
  });

  it.each([
    "/sign-up",
    "/recipes/chicken-piccata-abc123",
    "/plan",
    "/",
    "/api/auth/reset-password/some-token",
  ])("opens %s in the app", (path) => {
    expect(opensInApp(path)).toBe(true);
  });

  it.each([
    "/api/export",
    "/api/mcp",
    "/api/auth/callback/google",
    "/consent",
    "/.well-known/apple-app-site-association",
  ])("leaves %s in the browser", (path) => {
    expect(opensInApp(path)).toBe(false);
  });

  it("is served as JSON", async () => {
    const response = GET();
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual(SITE_ASSOCIATION);
  });
});
