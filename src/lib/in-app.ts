import { headers } from "next/headers";

import { isTrivetApp } from "./site";

/**
 * Whether this request comes from the iPhone app.
 *
 * Inside the app the site never shows a price or a way to buy. Apple wants
 * its own in-app purchase for anything sold inside an app, and the plan is
 * sold on the web, so the pricing page and the links to it are left out of
 * the app rather than risking App Review (see `APP-STORE-AUDIT.md`). Reads the
 * request, so any page that calls it renders per request.
 */
export async function inTrivetApp(): Promise<boolean> {
  return isTrivetApp((await headers()).get("user-agent"));
}
