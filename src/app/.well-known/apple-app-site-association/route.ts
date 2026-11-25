/**
 * Which trivetbox.com links open in the iPhone app instead of Safari
 * (Universal Links), and which site the app's saved passwords belong to.
 *
 * iOS fetches this when the app is installed or updated, through Apple's CDN,
 * so a change here reaches phones within a day or so, not instantly. It has to
 * be served as JSON, over https, at exactly this path, with no redirect.
 *
 * The app's side is the Associated Domains entitlement
 * (`ios/TrivetBox/TrivetBox/TrivetBox.entitlements`) and `WebState.open` in
 * `ContentView.swift`, which loads the link in the web view.
 *
 * Rules are read top to bottom and the first match wins:
 * - Password-reset links open in the app. They go through `/api/auth/` first;
 *   reset in Safari instead, and the new password signs the app out.
 * - The rest of `/api/` stays in the browser: downloads, the assistant
 *   (MCP) endpoints and sign-in callbacks.
 * - `/consent` is where an AI assistant is approved, part of a flow that
 *   started in a browser and must finish there.
 * - Everything else - invites (`/sign-up?code=`), recipes, the plan - opens in
 *   the app.
 */
export const dynamic = "force-static";

/** Team ID and bundle ID, as in `project.xcproj`. */
export const APP_ID = "5HF5FS3MHN.com.trivetbox.app";

export const SITE_ASSOCIATION = {
  applinks: {
    details: [
      {
        appIDs: [APP_ID],
        components: [
          {
            "/": "/api/auth/reset-password/*",
            comment: "Password resets finish in the app",
          },
          { "/": "/api/*", exclude: true, comment: "Downloads, MCP, auth" },
          {
            "/": "/consent*",
            exclude: true,
            comment: "Assistant approval finishes in the browser it began in",
          },
          { "/": "/.well-known/*", exclude: true },
          { "/": "/*" },
        ],
      },
    ],
  },
  // Passwords saved in Safari for trivetbox.com are offered in the app too.
  webcredentials: { apps: [APP_ID] },
};

export function GET() {
  return Response.json(SITE_ASSOCIATION);
}
