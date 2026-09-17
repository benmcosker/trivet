/**
 * Drive the running app in a real browser.
 *
 * Every browser check in this project used to be a Playwright script written
 * from scratch in a temp directory and thrown away, which meant the sign-in
 * dance was rewritten each time and no two checks looked for the same things.
 * This is that script, kept.
 *
 * It exists because `npm run build` cannot see the failure mode this codebase
 * hits most: a function crossing from a server component into MUI's client
 * code typechecks, builds, serves 200, and dies when React hydrates. Only a
 * browser catches it, and only if somebody is watching for page errors rather
 * than looking at a screenshot.
 *
 *   node scripts/browse.mjs /plan
 *   node scripts/browse.mjs /recipes --mobile
 *   node scripts/browse.mjs /plan --dark --shot=/tmp/plan.png
 *
 * Credentials come from the environment so nothing is committed:
 *   BROWSE_EMAIL, BROWSE_PASSWORD, BROWSE_BASE_URL (default localhost:3000)
 *   BROWSE_CHROME - a browser binary, when the default cannot be found
 */
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { chromium } from "playwright";

/**
 * Find a Chromium this Playwright can actually start.
 *
 * On a normal machine `chromium.launch()` just works. In a container whose
 * browsers were baked in against a different Playwright build it does not:
 * Playwright asks for `chromium_headless_shell-<its own build>` and finds only
 * the build the image shipped, then tells you to run `npx playwright install`
 * - which is the wrong advice when a perfectly good browser is sitting there.
 *
 * So: honour an explicit override, else let Playwright try, else go and look.
 */
async function launch() {
  const override = process.env.BROWSE_CHROME;
  if (override) return chromium.launch({ executablePath: override });

  try {
    return await chromium.launch();
  } catch (error) {
    const root =
      process.env.PLAYWRIGHT_BROWSERS_PATH ||
      join(homedir(), ".cache", "ms-playwright");

    const found = existsSync(root)
      ? readdirSync(root)
          .filter((d) => d.startsWith("chromium-"))
          .map((d) => join(root, d, "chrome-linux", "chrome"))
          .find(existsSync)
      : undefined;

    if (!found) {
      console.error(
        `Could not start Chromium, and none found under ${root}.\n` +
          `Set BROWSE_CHROME to a browser binary, or run: npx playwright install chromium\n` +
          `Playwright said: ${error.message.split("\n")[0]}`,
      );
      process.exit(2);
    }
    return chromium.launch({ executablePath: found });
  }
}

const args = process.argv.slice(2);
const path = args.find((a) => !a.startsWith("-")) ?? "/recipes";
const mobile = args.includes("--mobile");
/*
 * The theme resolves light and dark from the system preference rather than
 * from a class, so asking for the dark scheme means telling the browser what
 * the system prefers - there is no toggle in the app to click.
 */
const dark = args.includes("--dark");
const shot = args.find((a) => a.startsWith("--shot="))?.slice("--shot=".length);

const base = process.env.BROWSE_BASE_URL ?? "http://localhost:3000";
const email = process.env.BROWSE_EMAIL;
const password = process.env.BROWSE_PASSWORD;

// iPhone 16 portrait, which is the phone this app is actually read on.
const viewport = mobile
  ? { width: 393, height: 852 }
  : { width: 1280, height: 900 };

const browser = await launch();
const context = await browser.newContext({
  viewport,
  deviceScaleFactor: 2,
  isMobile: mobile,
  hasTouch: mobile,
  colorScheme: dark ? "dark" : "light",
});
const page = await context.newPage();

/*
 * The whole point. A hydration failure shows up here and nowhere else - not in
 * the status code, not in the screenshot, not in the build.
 */
const pageErrors = [];
const consoleErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200));
});

if (email && password) {
  await page.goto(`${base}/sign-in`, { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page
    .getByRole("button", { name: /sign in/i })
    .first()
    .click();
  await page.waitForURL(/recipes/, { timeout: 30_000 });
} else {
  console.log(
    "! BROWSE_EMAIL / BROWSE_PASSWORD unset - visiting signed out.\n" +
      "  Most pages will redirect to /sign-in.",
  );
}

const response = await page.goto(`${base}${path}`, {
  waitUntil: "networkidle",
});
// Client-side work after load is where hydration errors surface.
await page.waitForTimeout(1200);

const sideways = await page.evaluate(
  () =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth,
);
const heading = await page.evaluate(
  () => document.querySelector("main h1")?.textContent?.trim() ?? "(no h1)",
);

if (shot) await page.screenshot({ path: shot, fullPage: true });

console.log(
  `${path}  ${mobile ? "393x852" : "1280x900"}  ${dark ? "dark" : "light"}`,
);
console.log(`  status         ${response?.status() ?? "?"}`);
console.log(`  landed on      ${page.url()}`);
console.log(`  heading        ${heading}`);
console.log(`  scrolls sideways ${sideways}`);
console.log(`  page errors    ${pageErrors.length ? pageErrors : "none"}`);
console.log(
  `  console errors ${consoleErrors.length ? consoleErrors : "none"}`,
);
if (shot) console.log(`  screenshot     ${shot}`);

await browser.close();

// A page error is a failure even when the status was 200 - that is the whole
// class of bug this exists to catch, so make it fail a script that chains.
process.exit(pageErrors.length > 0 ? 1 : 0);
