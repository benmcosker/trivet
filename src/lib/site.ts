/**
 * What the site says about itself to anything that is not signed in: search
 * engines, link previews, and the web filters workplaces put in front of
 * their staff.
 *
 * Those filters (Zscaler, Forcepoint and the like) decide what a site is from
 * what they can read on it, and until the front page existed that was a
 * redirect to a sign-in form - which is what a phishing page looks like too.
 * The words here and on the front page are what lets them file Trivet under
 * food.
 */

export const SITE_NAME = "Trivet";

export const SITE_TITLE = "Trivet: recipe box, meal planner and grocery list";

export const SITE_DESCRIPTION =
  "Trivet keeps a household's recipes in one place, plans the week's dinners and writes the shopping list. Bring in recipes from a photo of a card, a cookbook page, a link or a PDF.";

/**
 * The public origin. `BETTER_AUTH_URL` is the app's own origin in every
 * deployment; the fallback is production's, for anything built without it.
 */
export function siteUrl(env: Record<string, string | undefined> = process.env) {
  return (env.BETTER_AUTH_URL ?? "https://trivetbox.com").replace(/\/$/, "");
}

/**
 * Whether this deployment is the one people use. Preview deployments carry
 * their own addresses and are not for indexing.
 */
export function isProductionSite(
  env: Record<string, string | undefined> = process.env,
) {
  return env.VERCEL_ENV ? env.VERCEL_ENV === "production" : false;
}

/**
 * The marker the iPhone app adds to its user agent
 * (`applicationNameForUserAgent` in ios/TrivetBox/TrivetBox/ContentView.swift).
 *
 * Someone who opened the app has the app already, so the front page - which
 * exists to say what Trivet is - is skipped for them and they go straight to
 * signing in. Builds from before the marker show the front page, which has a
 * Sign in button of its own.
 */
export const APP_USER_AGENT_MARKER = "TrivetApp";

export function isTrivetApp(userAgent: string | null | undefined): boolean {
  return new RegExp(`\\b${APP_USER_AGENT_MARKER}\\b`).test(userAgent ?? "");
}

/** The pages anyone may read, and so the only ones offered to crawlers. */
export const PUBLIC_PATHS = [
  "/",
  "/privacy",
  "/pricing",
  "/terms",
  "/sms",
  "/assistants",
] as const;
