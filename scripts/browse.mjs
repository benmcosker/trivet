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
 *   npm run browse -- /plan
 *   npm run browse -- /plan /recipes /pantry
 *   npm run browse -- /recipes --mobile
 *   npm run browse -- /plan --dark --shot=/tmp/plan.png
 *
 * Several paths in one run is the normal case, not a convenience. Signing in
 * is rate limited - three attempts per ten seconds, from better-auth's default
 * rules, enabled because `npm run start` is a production build - so a sweep
 * run as one process per page trips it around the fourth page and reports a
 * timeout that looks like a hydration failure and is not. One process signs in
 * once; the session is then cached in `.browse-session.json` and reused, so
 * the usual run signs in not at all.
 *
 * Credentials come from the environment so nothing is committed:
 *   BROWSE_EMAIL, BROWSE_PASSWORD, BROWSE_BASE_URL (default localhost:3000)
 *   BROWSE_CHROME - a browser binary, when the default cannot be found
 *
 * `npm run browse:seed` creates the account these name, and explains why that
 * needs a script rather than a signup form.
 */
import {
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
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
const paths = args.filter((a) => !a.startsWith("-"));
if (paths.length === 0) paths.push("/recipes");

const mobile = args.includes("--mobile");
/*
 * The theme resolves light and dark from the system preference rather than
 * from a class, so asking for the dark scheme means telling the browser what
 * the system prefers - there is no toggle in the app to click.
 */
const dark = args.includes("--dark");
const shot = args.find((a) => a.startsWith("--shot="))?.slice("--shot=".length);

if (shot && paths.length > 1) {
  console.error(
    "--shot takes one path, or every page would overwrite the last.",
  );
  process.exit(2);
}

const base = process.env.BROWSE_BASE_URL ?? "http://localhost:3000";
const email = process.env.BROWSE_EMAIL;
const password = process.env.BROWSE_PASSWORD;

/*
 * A signed-in session, kept between runs so the usual sweep never touches the
 * rate limiter. Gitignored: it holds a live cookie for the browse account.
 * Deleting it costs one sign-in, so anything that looks stale just deletes it.
 */
const SESSION_FILE = join(process.cwd(), ".browse-session.json");

// iPhone 16 portrait, which is the phone this app is actually read on.
const viewport = mobile
  ? { width: 393, height: 852 }
  : { width: 1280, height: 900 };

const browser = await launch();

function open(storageState) {
  return browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    isMobile: mobile,
    hasTouch: mobile,
    colorScheme: dark ? "dark" : "light",
    ...(storageState ? { storageState } : {}),
  });
}

let cached;
if (email && password && existsSync(SESSION_FILE)) {
  try {
    cached = JSON.parse(readFileSync(SESSION_FILE, "utf8"));
  } catch {
    // A half-written or hand-edited file is not worth diagnosing.
    rmSync(SESSION_FILE, { force: true });
  }
}

let context = await open(cached);
let page = await context.newPage();

/*
 * The whole point. A hydration failure shows up here and nowhere else - not in
 * the status code, not in the screenshot, not in the build.
 */
let pageErrors = [];
let consoleErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200));
});

/**
 * Sign in, and say something useful when it fails.
 *
 * Waiting only on the URL turns every failure into the same thirty-second
 * timeout, which is how a rate limit spent a while looking like a flaky
 * hydration bug. Read the response instead: it says which of the two it is.
 */
async function signIn() {
  await page.goto(`${base}/sign-in`, { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);

  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/sign-in/email"), {
      timeout: 30_000,
    }),
    page
      .getByRole("button", { name: /sign in/i })
      .first()
      .click(),
  ]);

  if (response.status() === 429) {
    console.error(
      "Sign-in was rate limited (429).\n" +
        "  better-auth allows three attempts per ten seconds on /sign-in, and it is\n" +
        "  on because `npm run start` is a production build. Pass every path to one\n" +
        "  run rather than running this once per page, and wait ten seconds.",
    );
    process.exit(2);
  }
  if (!response.ok()) {
    console.error(
      `Sign-in failed with ${response.status()}. Check BROWSE_EMAIL and ` +
        `BROWSE_PASSWORD, or run \`npm run browse:seed\`.`,
    );
    process.exit(2);
  }

  await page.waitForURL(/recipes/, { timeout: 30_000 });
  writeFileSync(SESSION_FILE, JSON.stringify(await context.storageState()));
}

if (email && password) {
  /*
   * Probe rather than trust. A cached session expires, and the app answers an
   * expired one by redirecting to /sign-in - so the cheapest way to ask whether
   * it is still good is to visit something that needs it and see where we land.
   */
  await page.goto(`${base}/recipes`, { waitUntil: "networkidle" });
  if (/\/sign-in/.test(page.url())) {
    if (cached) {
      // The cached session was refused. Start clean rather than layering.
      rmSync(SESSION_FILE, { force: true });
      await context.close();
      context = await open();
      page = await context.newPage();
      page.on("pageerror", (e) => pageErrors.push(e.message));
      page.on("console", (m) => {
        if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200));
      });
    }
    await signIn();
  }
} else {
  console.log(
    "! BROWSE_EMAIL / BROWSE_PASSWORD unset - visiting signed out.\n" +
      "  Most pages will redirect to /sign-in.",
  );
}

let failed = 0;

for (const path of paths) {
  // Per page, so the report names the page that broke rather than the run.
  pageErrors = [];
  consoleErrors = [];

  const response = await page.goto(`${base}${path}`, {
    waitUntil: "networkidle",
  });
  // Client-side work after load is where hydration errors surface.
  await page.waitForTimeout(1200);

  const sideways = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
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

  if (pageErrors.length > 0) failed += 1;
}

await browser.close();

// A page error is a failure even when the status was 200 - that is the whole
// class of bug this exists to catch, so make it fail a script that chains.
if (failed > 0) {
  console.error(`\n${failed} of ${paths.length} page(s) had page errors.`);
}
process.exit(failed > 0 ? 1 : 0);
