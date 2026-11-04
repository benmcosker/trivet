# Offline browsing: plan

## Context

The iOS app (`ios/TrivetBox`) is a thin WKWebView shell around
`https://trivetbox.com` — `ContentView.swift` loads the site full-screen and
does nothing else; every feature lives on the website. That means offline
support can't be built twice: whatever makes the website work without a
network connection is what the iOS app gets too, since it's loading the
same origin — with one native setting first, without which a service worker
never starts inside the app at all (see Phase 0).

The motivating case is the two places in this app where a flaky or absent
connection is routine rather than exceptional: `/recipes/<id>/cook` (a phone
propped up at the stove, often in a kitchen dead spot) and the week's grocery
list (read in a shop aisle, sometimes in a basement with no signal). Neither
works today if the network drops mid-session.

This repo has no offline/PWA scaffolding at all currently — confirmed by an
exhaustive search: no `manifest.json`/`manifest.ts`, no service worker, no
`serwist`/`workbox`/`next-pwa` dependency, no `indexedDB` or `caches` (Cache
Storage) usage, no `navigator.onLine` checks, no `.well-known` or universal
links setup between the web app and the iOS shell. This plan starts from a
clean slate, not an extension of something partial.

Two findings from reading the actual routes changed the shape of this plan
from a generic "add a service worker" sketch to something specific to how
this app is built:

- `/recipes/[id]` and `/recipes/[id]/cook` are **independent** Server
  Components. Each calls `requireHousehold()` then `getRecipe(id,
householdId)` itself — `/cook` is not a child render of the detail page, it
  re-fetches and re-authorizes on its own. Caching keys off the recipe id and
  feeds both routes from one cache entry; it does not key off "the page
  family."
- The grocery list's "Got it" button (`skipForWeekAction` in
  `src/app/plan/skip-actions.ts`) is **not a flag on a line item** — it
  inserts a `WeeklySkip` row, and the next render's `aggregateIngredients`/
  `buildExclusions` (`src/lib/grocery.ts`, `src/lib/week-list.ts`) recompute
  the list without that ingredient. There is no `GroceryLine.done` to toggle
  locally while offline. Replicating this offline would mean re-implementing
  exclusion logic client-side — `grocery.ts` imports Prisma, so it isn't
  client-safe as written. Not worth it for a first version; see "Explicitly
  out of scope" below.

## What this plan covers

Read-only offline access to recipes and the grocery list the household has
already viewed while online. No offline writes. If a write is attempted
offline, it fails visibly — never silently, and never by faking success.

**Order: the grocery list first, on its own.** Reading the list in a shop with
no signal is the case the family beta is most likely to hit, and it is the
smaller job: one page, no images. Recipes and cook mode follow once the list
has been used offline for real.

## Needs design first

Nothing below is built until these four states have been through a design
pass. The plan says they must exist; it does not say what they look like.

1. **Reading a saved copy.** How a page says it is the copy from the last
   visit rather than live, and how old it is ("Saved Tuesday, 6pm").
2. **An action that failed offline.** What "Got it" or "Always have" does
   when there is no signal: the visible "reconnect to update your list"
   message described below, and where it sits.
3. **Never viewed, offline.** The empty state for a page that was never
   opened while online, so nothing was saved.
4. **First launch with no connection.** The small native screen in the
   iPhone app (Phase 0), shown before the website has ever loaded.

## Phase 0 — native groundwork (iOS)

- **App-bound domains, or no service worker in the app.** WKWebView only
  exposes service workers to an app that declares its domains as app-bound.
  Without this, `navigator.serviceWorker` is missing inside the app and the
  whole of Phase 1 works in Safari but not in TrivetBox. Two changes:
  `WKAppBoundDomains` listing `trivetbox.com` in the app's Info.plist (an
  array, so it needs a small Info.plist file next to the generated keys), and
  `config.limitsNavigationsToAppBoundDomains = true` in `ContentView.swift`.
  The second keeps the web view on trivetbox.com, which the `Coordinator`
  already does by sending every other link to Safari.

- `ios/TrivetBox/TrivetBox/ContentView.swift` already sets
  `config.websiteDataStore = .default()` — a persistent store, so a Service
  Worker registration and its Cache Storage will survive the app being
  backgrounded, killed, and relaunched. Nothing to change here; this was the
  one setting that could have silently defeated everything below, and it's
  already right.
- Gap worth closing in the same pass: `Coordinator` has no
  `didFailProvisionalNavigation` handler. A cold launch with no connectivity
  and no Service Worker installed yet (first-ever open, before any successful
  visit) shows WebKit's bare error page instead of something explainable. Add
  the delegate method to show a small native "no connection yet" screen.
- Add `src/app/manifest.ts` (Next's typed metadata route — there's no
  `robots.ts`/`sitemap.ts` either yet, so this is the first of that family,
  not a bolt-on to something already there).

## Phase 1 — read-only offline cache

**Populating the cache — no new API route.** `getRecipe()` and
`/plan/page.tsx`'s `buildShoppingList()` already produce exactly the data
each page renders. Pass a narrow, serializable slice of that data as props
into a small client component rendered on the pages that already fetch it:

- `<OfflineRecipeCache recipe={...} />` on `/recipes/[id]/page.tsx` and
  `/recipes/[id]/cook/page.tsx`.
- `<OfflineGroceryCache list={...} weekStartIso={...} />` on
  `/plan/page.tsx`.

Each writes its data into IndexedDB on mount, and separately fetches the
recipe's raw `imageUrl` blob and stores it alongside. Storing the raw blob
rather than relying on the service worker to cache `next/image`'s rewritten
`/_next/image?url=...&w=...` requests matters: that URL varies by viewport
width, so a cache rule on it would multiply entries per breakpoint and could
still miss if the offline view's width wasn't one that got precached. The
offline render path uses a plain `<img>` against the stored blob instead of
going through `next/image` at all.

**Reusing the one real precedent in the codebase.** `CookingView.tsx`'s
`useSyncExternalStore(subscribeNever, ...)` pattern — read storage during
render with a `null` server snapshot, write only from a handler, never from
an effect that mirrors state — is exactly the shape needed for "is this
recipe cached, read it." Use it as written rather than inventing a second
pattern for the same problem.

**The auth implication.** Every route's session check
(`requireHousehold()` → Better Auth cookie → Prisma lookup of the household)
genuinely cannot run offline. The decision to serve cached content has to be
made client-side, and it must never imply the session was re-verified — only
that this is what was cached the last time this household had a live
session. The cache is cleared on sign-out.

**Service worker.** `@serwist/next` (maintained, App Router–aware) for
precaching the JS/CSS shell and giving navigation requests a cache fallback.
It does not need to touch recipe images at all, given the raw-blob approach
above.

## Explicitly out of scope for this version

- **Offline writes of any kind** — "Got it," "Always have," marking a recipe
  cooked. `CookingView.finish()`'s `markCookedAction` call already silently
  swallows a failure today (`// Offline, or signed out mid-recipe. Nothing to
tell anybody here.`) — acceptable for that one low-stakes action, but the
  grocery actions should surface a visible "you're offline — reconnect to
  update your list" message on failure rather than leaving the button look
  like it worked.
- **Recipe upload/creation** — needs the Claude call, which needs the
  network, by design.
- **Search** — server-side full-text/SQL ranking in `recipe-visibility.ts`;
  an offline index is a separate project.
- **Detecting offline via `navigator.onLine` alone** — it's unreliable
  (reports "online" when a captive portal or flaky connection would still
  fail a real request). Detect failure from the actual write attempt, not
  from that flag.

## Testing

`scripts/browse.mjs` is the right home — it already launches Chromium
directly, caches a signed-in session (`.browse-session.json`), and runs as
the "Browser check" CI step right after the production build. Nothing in the
repo currently simulates offline network conditions (`setOffline`,
`page.route()`, and `CDPSession` all have zero hits outside this plan).

Add a pass that: visits a recipe/cook/plan page once (warm cache), calls
`page.context().setOffline(true)`, reloads the same paths, and asserts cached
content renders. Also assert the explicit empty state for "never viewed
before, offline" — don't assume a cache hit. Wire the new step in directly
after today's "Browser check" step in `.github/workflows/ci.yml`, reusing the
already-running app and cached session rather than standing up new
infrastructure.

## Does this reach the web app too?

Yes, unchanged — the WKWebView only loads `trivetbox.com`, so the service
worker, IndexedDB, and both cache-recorder components are the same code
running in both places. The iOS-only pieces are both in Phase 0: the
app-bound domains setting that lets the service worker run in the app at all,
and the `didFailProvisionalNavigation` handler.
