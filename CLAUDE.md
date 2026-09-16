<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project notes

`README.md` is the long form, and its **Notes and limitations** section carries
what this file should point at rather than copy: how recipe visibility works and
the three things that follow from it, why the SMS consent machinery looks the
way it does, what the upload quota is for, and what has never been verified.
Read it before proposing work on sharing, admin access, or texting.

### Traps that have actually cost time here

- **Recipe visibility lives in one file.** `src/lib/recipe-visibility.ts` is
  the only place that decides who may read a recipe, and search needs it twice
  - once as a Prisma filter, once as SQL. A new read that does not go through
    it is how another family's dinner gets shown.

- **A function cannot cross from a server component into MUI's client code.**
  `component={Link}`, an `sx` callback, an `onChange` handed down from a server
  page: each one typechecks, builds cleanly and serves `200`, then dies at
  hydration. A green `npm run build` proves nothing about this — open the page
  in a browser before believing it works.
- **Restart the dev server after a schema change.** `src/lib/db.ts` caches the
  Prisma client on `globalThis` and that cache survives HMR. The symptom is
  `Cannot read properties of undefined (reading 'findMany')` on a model plainly
  in the schema, while `npm test` and `npm run typecheck` pass.
- **The app is Trivet; `BRAND` is not.** `src/lib/legal.ts` still reads
  "McMullen Meal Magic" on purpose — it is the name on the approved A2P
  campaign and appears in every SMS body. Changing it before the campaign is
  re-registered gets messages silently dropped, not merely mislabelled.
  `test/sms-consent.test.ts` and `test/sms-message.test.ts` pin it; those
  failing is the tripwire.
- **The legal wording is load-bearing.** It lives in `src/lib/legal.ts` so the
  consent checkbox, the public pages and the A2P campaign submission cannot
  drift apart, and carrier vetting pattern-matches phrasing rather than reading
  it. Two rejections are written up in the README. Don't reword it casually.
- **Nobody types anybody else's phone number.** `saveOwnPhone` writes the
  caller's own row and nothing else.
- **Do not mirror state into `sessionStorage` with an effect.** The tidy shape
  - state, plus an effect writing it on every change - fires on mount with the
    initial value and overwrites what was stored before the restoring effect
    can read it. React's development double-mount then reads the overwritten
    value back, so it fails every time rather than occasionally. Read the
    stored value during render (`useSyncExternalStore`, with a server snapshot,
    since the server has no storage) and write only from the handler that moved
    something. `CookingView` does both.

### Things checked, so they need not be checked again

Each carries a date, because what they record can change and a confident
undated note is one nobody thinks to re-test.

- **Instacart: applications closed** (re-checked September 2026, unchanged
  since August). The Developer Platform opened to everyone in March 2024 and
  has since stopped taking new applicants, with no waitlist - "check back in
  the future" is the whole of it. The provider in `src/lib/shopping/instacart.ts`
  is written and tested and stays hidden behind the missing key. Note for
  whenever it reopens: a key is not the end of it, their own docs describe an
  access request, then a demo, then a production key, averaging 30-40 days. So
  this is a date to re-check, not a switch to flip.

### Three dinners and a side on one evening

Built. A day holds up to three dinners and one side. What was decided, so it
does not get relitigated:

- **`DINNER_2` and `DINNER_3` are enum values**, not a `position` column.
  Adding a value is `ALTER TYPE ... ADD VALUE` - no table rewrite, no backfill,
  and the `(householdId, date, slot)` unique key stays, which
  `acceptSideAction`'s upsert and every planner query lean on. A fourth dinner
  is now a two-line migration and nothing else.
- **Sides belong to the day, not to a dinner.** One set of sides for the
  evening whichever mains are on it. `suggestSidesAction` anchors on
  `FIRST_DINNER` for that reason, and it says so at the call site. Sides per
  dinner is what would have forced the position column.
- **`SIDE_2`/`SIDE_3` still deferred.** Two more enum values and no UI work
  when they are missed. `SIDE_SLOTS` already exists to hold them.

`src/lib/meal-slots.ts` is the list, and it is deliberately import-free so both
server and client can read it - `grocery.ts` imports Prisma on line one, so a
client component importing a value from it would bundle the database client.
`grocery.ts` re-exports the slots for the server callers that already import
from there. Order matters: `DINNER_SLOTS[0]` is the dinner with the photo, the
rest are the "and Lamb Tagine" lines under it.

The tile is slot-driven now rather than four hardcoded `"DINNER"` strings:
`picking` carries the slot it is filling, `ExtraDinners` lists what is planned,
`AddMore` owns both add buttons. A fourth dinner needs no component work.

What the phone actually turned out to need: the half-width tile holds three
dinners and a side fine - the extra mains are one compact line each, not a
second photo - so day tiles did **not** need to become full-width rows. The one
thing that did need changing was the buttons. Two small plus-icon buttons
stacked with no labels to tell them apart is a guess; a tile is never wide
enough to put them side by side (about 180px at `xs`, still only about 200px on
a desktop where seven share the row), so the labels carry it: "Dinner" and
"Side", a pair of named alternatives. "Another dish" did not work and is gone.

### Agents

`.claude/agents/` holds four, split by discipline: **backend** (server actions,
`src/lib`, API routes), **frontend** (components and pages, and the RSC boundary
that keeps biting), **data** (schema, migrations, the constraints other code
leans on), **design** (theme, type scale, how it reads on a phone). Each carries
the traps for its own layer, so dispatch by what the change touches.

`scripts/browse.mjs` drives the running app in a real browser and reports page
and console errors. It is the only thing that catches a hydration failure, and
it exits non-zero on one.

### Branches

One branch per change, named for what the change does:
`claude/<kebab-case-description>` - `claude/sms-consent`, `claude/heic-upload`,
`claude/upload-rate-limit`. Never reuse a branch for unrelated work, and never
reuse one whose pull request has already merged; start a fresh one off `main`.

### Before pushing

`npm run typecheck`, `npm test`, `npm run format:check`. The tests share one
database and empty it, so don't point them at anything you care about.
