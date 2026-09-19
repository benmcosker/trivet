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
- **Name the role in the local database URL, and expect the CLI to disagree
  with the app.** `.env.example` ships
  `postgresql://postgres@127.0.0.1:5432/mealmagic`, which assumes the cluster
  trusts loopback. A container whose Postgres came back on `scram-sha-256`
  refuses that, and every database-backed test fails with `client password must
be a string`. The way through is the Unix socket and peer auth, with a role
  the OS user maps to (`create role root login superuser;` if none exists).
  Both of these work at runtime:

  ```
  postgresql://root@%2Fvar%2Frun%2Fpostgresql/mealmagic
  postgresql://root@/mealmagic?host=/var/run/postgresql
  ```

  **The `root@` is the load-bearing part, not the URL shape.** Drop it and both
  forms fail identically with "User was denied access on the database
  `(not available)`", which reads like a permissions problem and is really a
  missing username. That is the hour, and it is worth an hour twice because
  `psql -h /var/run/postgresql` succeeding tells you nothing - psql supplies
  your OS user, a connection string does not.

  Prisma's CLI parses the URL itself and accepts neither: `?host=` gives P1013
  "empty host", percent-encoding gives P1001 "can't reach
  `%2Fvar%2Frun%2Fpostgresql:5432`". So `migrate deploy` cannot use the socket
  at all. Verify migration SQL with `psql` in a `BEGIN`/`ROLLBACK` instead, and
  let CI apply it for real - `ci.yml` provisions its own Postgres over TCP.

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

- **Four of the weekly health check's eight advisories were false**
  (September 2026), and the check now knows it. `npm audit --omit=dev` keeps
  optional peer dependencies, so `prisma` — the CLI, a devDependency, an
  optional peer of both `@prisma/client` and `better-auth` — counted as
  production and dragged `@prisma/config` and `deepmerge-ts` with it. `mysql2`
  is the fourth: a MySQL driver on a Postgres app. None is reachable from a
  request. There is no cheap way to compute this, because npm's tree is
  flattened by the time it is printed and the peer edge that caused it is
  gone — so the corrections are written down in `lifecycle.json`'s
  `unreachable`, each with a reason and a date. **Add to that list rather than
  arguing with the report**, and keep the reason honest: a demoted advisory is
  still printed, which is what stops the list becoming a place findings go to
  die. Prisma 8's highs are all on this side of the line, so the release
  candidate is not worth taking; wait for stable.

- **vitest 5 is gated behind a better-auth schema migration** (19 September
  2026). `better-auth@1.7.1` declares `peerOptional vitest: "^2 || ^3 || ^4"`,
  so taking vitest 5 makes `npm ci` fail with ERESOLVE - which `npm install`
  and a passing test run will not tell you. **After changing any dependency,
  re-run `npm ci`, not just the tests**: it is the first thing CI does and the
  only one that checks peer resolution. `better-auth@1.7.4+` widens that peer
  to allow vitest 5, but 1.7.2-1.7.5 also add a required `issuer` column to
  the `account` model - a _patch_ release carrying a schema change. Until that
  migration is written, every `account.create()` throws
  "Argument `issuer` is missing" and signup breaks. So vitest 5 is not a test
  upgrade, it is an auth migration wearing one; it needs its own change with
  the migration, and no advisory is pushing it.

- **eslint 10 is blocked upstream, and the peer range lies about it**
  (19 September 2026). Tried it; `npm run lint` dies before linting anything:
  `TypeError: Error while loading rule 'react/display-name':
contextOrFilename.getFilename is not a function`. The whole lint config is
  `eslint-config-next`, which bundles `eslint-plugin-react`, and
  **7.37.5 - the latest published - declares `eslint: "^3 || ... || ^9.7"`.
  No release of it supports eslint 10 at all.** `eslint-config-next` has no
  stable release past 16.3.5 either; the only newer ones are 16.4.0 canaries,
  and every version of it declares `eslint: ">=9.0.0"` while depending on a
  plugin capped at `^9.7`. That range is wrong, which is why npm installs
  eslint 10 without a warning and it only fails when a rule loads - do not
  read a clean `npm install` as evidence here. Re-check when
  `eslint-plugin-react` publishes a version naming eslint 10 in its peers;
  until then being one major behind on a linter costs nothing. Forcing it
  with an override would half-upgrade the toolchain, which costs a lot.

- **The health check does not watch GitHub Action versions** (19 September
  2026). It covers npm dependencies, runtimes, credentials and schema drift -
  but the `uses:` lines in `.github/workflows` rot on a calendar like
  everything else, and nothing reports them. Found when the runner warned that
  `actions/checkout@v4`, `actions/setup-node@v4` and `actions/github-script@v7`
  target Node 20 and were being forced onto Node 24; the workflow was warning
  about itself while the report it generates said nothing. Now on v7, v7 and
  v9 respectively, all of which declare `using: node24`. Worth teaching the
  check to read `uses:` lines eventually - until then the runner's annotations
  are the only warning, and they are easy to miss because the job still passes.

- **A failed `npm audit` used to read as "no advisories"** (19 September
  2026). npm's quick-audit endpoint returned `400 Invalid package tree` and
  announced it is being retired; the report would have said the week was
  clear and closed its own issue. `summariseAudit` now distinguishes "did not
  answer" from "found nothing", and either one keeps the issue open. Do not
  "simplify" that back to `audit?.vulnerabilities ?? {}` - a test pinning the
  old behaviour is what let it survive the first time. The workflow's
  `|| true` is correct and must stay: a _successful_ audit also exits
  non-zero whenever it finds something, which is exactly why the failure has
  to be detected from the output rather than the exit code.

- **`@types/node` tracks the runtime, not the registry** (September 2026).
  Done, not just noticed: the range is `^22`, and `lifecycle.json`'s `pinned`
  makes the check measure it against the newest 22.x instead of the newest
  published. Types for Node 26 on a Node 22 runtime describe APIs that are not
  there when the code runs — it typechecks and then throws, which is worse than
  being behind. A pinned package that falls behind _inside_ its track still
  reports, so this is a correction rather than a mute.

### Not built yet: autocomplete when adding tags

Scoped, not started. Roughly half a session.

`slugifyTag` already collapses case, spacing and punctuation - "Sheet Pan",
"sheet pan" and "Sheet-Pan" are one row - so the duplicates that survive are
semantic: "Soup" beside "Soups", "Veggie" beside "Vegetarian". Only showing
somebody the existing vocabulary fixes that, which is what autocomplete is for.

Two things decided in advance:

- **The extractor is the bigger source, not the typing.** `extract-recipe.ts`
  asks the model for "3-6 short labels" per upload with no knowledge of what
  the library already uses, so every card mints fresh tags. Seeding that prompt
  with the existing vocabulary is the higher-leverage half; the `Autocomplete`
  in `RecipeForm` is the visible half.
- **Suggestions must come from `listTagsWithCounts`, not the `Tag` table.**
  Tags are global with no `householdId`, but that function deliberately counts
  over visible recipes and drops zero-count tags - a naive `findMany` would
  suggest tags that exist only on another household's private recipes, which is
  the existence-versus-visibility leak `REVIEW.md` asks reviewers to watch for.

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
