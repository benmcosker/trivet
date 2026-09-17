# Deploying Trivet

Target: Vercel for hosting, Neon for Postgres, Vercel Blob for uploaded PDFs and
photos. Everything below needs accounts you control; nothing here can be done
on your behalf.

Budget about half an hour, most of it waiting for DNS and a first build.

## 1. Database (Neon)

Create a project at [neon.tech](https://neon.tech). From the connection details
panel, copy **both** connection strings:

| Neon calls it     | Goes in               | Used by         |
| ----------------- | --------------------- | --------------- |
| Pooled connection | `DATABASE_URL`        | the running app |
| Direct connection | `DIRECT_DATABASE_URL` | migrations only |

Both are needed, and they are not interchangeable. Neon's pooled endpoint runs
PgBouncer in transaction mode, which does not support the session-level locks
Prisma Migrate takes out — migrations against it hang or fail with errors that
do not mention pooling. The app wants the pooled URL, because serverless
functions open far more connections than Postgres will accept directly.

## 2. Blob storage (Vercel)

In the Vercel dashboard: **Storage → Create → Blob**, then connect it to the
project. Connecting the store seeds `BLOB_READ_WRITE_TOKEN` on the project for
you, so there is nothing to copy on the first setup.

**It is an ordinary stored variable from that moment on, and this is the part
that catches people.** Rotating the token in the Blob store does not update the
project's copy — the store issues a new one and the project keeps serving the
old, which fails as `403` on the next upload and nowhere else. A rotation is
three steps, all of them by hand:

1. Rotate in **Storage → your Blob store → Tokens**.
2. Paste the new value over the project's `BLOB_READ_WRITE_TOKEN` in
   **Settings → Environment Variables**.
3. **Redeploy.** Environment variables are read into the build, so a running
   deployment goes on using the value it was built with however many times you
   save the new one.

Record the date in `lifecycle.json` when you do; the weekly health check reads
it, and no API can tell it when a token was last rotated.

Skipping this step is worse than it looks. Uploads fall back to
`./public/uploads`, which on serverless hosting is a fresh empty directory on
every deploy: every photo silently disappears the next time you push.

## 3. Project (Vercel)

Import the GitHub repo. The defaults are correct — the build command does not
need changing, because `package.json` defines a `vercel-build` script that
Vercel prefers automatically:

```
node scripts/migrate-on-deploy.mjs && next build
```

That runs pending migrations against `DIRECT_DATABASE_URL` before building, so
a deploy that changes the schema applies it rather than booting against the old
one — but **only for production deployments**.

### Why previews do not migrate

Preview deployments share the production database unless you have given them
one of their own. That is a worse arrangement than it sounds. A preview builds
from a branch, so it applies whatever a migration looks like _at that moment_,
and Prisma records a migration by name: if the migration is then rewritten
before it merges, the corrected version never runs. Production is left carrying
a schema that no commit in the repository describes.

This is not hypothetical. It happened here — a preview applied the households
migration twenty-two minutes before its pull request merged, the migration
having been rewritten in between. The column it added was missing in
production, the household page still rendered because listing invites does not
select that column, and creating one failed with a bare Next.js error digest.

So previews skip migrations, and the build says so in its log rather than
leaving you to infer it.

### Giving previews their own database

The better arrangement, and the one that lets previews test their own
migrations. In the Neon integration on Vercel, enable a database branch per
preview deployment; Neon branches copy schema and data, and are disposable.

Once previews have their own database, let them migrate it: set

```
PREVIEW_DATABASE_IS_DISPOSABLE=true
```

on the **Preview** environment only. It is a variable rather than a code change
because it is a fact about how the databases are wired, and it belongs in the
same place as the connection strings — set by whoever knows which database a
preview is actually pointed at.

## 3b. The production domain

`trivetbox.com`, bought through Vercel so the DNS is configured by Vercel and
there is nothing to maintain elsewhere.

**The bare apex is the production domain; `www` redirects into it.** Vercel sets
this up the other way round by default, and it was deliberately flipped. Do not
flip it back without also changing `BETTER_AUTH_URL` in the same breath: if the
canonical host and that variable disagree, signing in appears to work and then
immediately does not, because the visitor is redirected to one host while the
callback and the session cookie belong to the other. `www` is kept as a redirect
rather than deleted so that typing it still arrives somewhere.

**Do not leave a second live hostname serving the app, and redirect it rather
than deleting it.** Renaming the Vercel project did not re-alias
`mcmullen-meal-magic.vercel.app`, so for a while the app answered on it
directly - a second copy, under the old brand, which sign-in then refuses:
Better Auth trusts only the origin `BETTER_AUTH_URL` names, so a request from
any other host comes back `Invalid origin`. That is correct behaviour and a good
reason to have exactly one way in.

The fix is a 308 to the canonical host, not removal. A rename almost always
happens to an app somebody is already using, and the people using it have the
old address saved - on a phone home screen, in a bookmark bar, in a text message
somebody sent months ago. Deleting the hostname turns all of that into a bare
404 with no clue where the app went, and the person who has to explain it is
you. A redirect lands them in the right place and quietly updates what they have
saved. Deleting is only the right call when nothing points at the old name.

Do not reach for `trustedOrigins` here. Accepting requests from the old host
would stop the error while keeping the retired brand serving the app, which is
preserving the problem rather than fixing it. `trustedOrigins` is for hostnames
the app genuinely intends to answer on.

Changing the domain means changing `BETTER_AUTH_URL` to match and redeploying -
Vercel snapshots environment variables at build time, so editing the value alone
changes nothing about the running deployment.

## 4. Environment variables

Set these in **Settings → Environment Variables**, for Production and Preview:

| Variable                | Required | Value                                                                                                                                                                              |
| ----------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`          | yes      | Neon **pooled** string                                                                                                                                                             |
| `DIRECT_DATABASE_URL`   | yes      | Neon **direct** string                                                                                                                                                             |
| `BETTER_AUTH_SECRET`    | yes      | `openssl rand -base64 32` — a fresh one, not the dev value                                                                                                                         |
| `BETTER_AUTH_URL`       | yes†     | The production origin, scheme and no trailing slash: `https://trivetbox.com`                                                                                                       |
| `ANTHROPIC_API_KEY`     | no       | Enables PDF extraction                                                                                                                                                             |
| `INSTACART_API_KEY`     | no       | **Not obtainable.** Instacart has closed new developer applications with no waitlist. Leave unset; the provider is hidden until a key exists.                                      |
| `INSTACART_API_BASE`    | no       | Only meaningful once a key exists: `https://connect.dev.instacart.tools` for development, `https://connect.instacart.com` for production                                           |
| `TWILIO_EMAIL_API_KEY`  | no       | Enables password resets. Twilio Email → Settings → API Keys, needs only Mail Send. **Not** the auth token above. Without it `/forgot-password` says so rather than sending nothing |
| `EMAIL_FROM`            | no       | The sender address — `info@trivetbox.com`. Its domain must be authenticated under Twilio Email → Domains; an unauthenticated sender is accepted by the API and then not delivered  |
| `BLOB_READ_WRITE_TOKEN` | —        | Seeded by Vercel when the Blob store is connected, then stored like any other — a rotation is pasted in by hand and needs a redeploy (§2)                                          |

Authenticating the sender domain means adding the CNAME records Twilio hands
you — DKIM signing keys and a mail subdomain, three of them in the usual case.
They go in **Vercel**, under the domain's DNS records: trivetbox.com was bought
through Vercel, so there is no registrar to visit.

Two things to watch there. Vercel's `Name` field takes the subdomain part only,
not the whole hostname — Twilio prints `s1._domainkey.trivetbox.com` and what
goes in the box is `s1._domainkey`. And until the records resolve, Twilio
accepts mail from `info@trivetbox.com` and quietly fails to deliver it, which
is the same shape of silent failure as unregistered A2P traffic: nothing
bounces, nothing errors, nothing arrives.

`BETTER_AUTH_URL` earns its dagger twice over now: reset links are built from
it, so a wrong value produces links pointing at an origin nobody is serving,
and the only symptom is people reporting that the link is broken.

The app refuses to start if a required variable is missing, and names all of
them at once rather than failing on the first. Optional ones are logged at boot
with what each costs.

**† `BETTER_AUTH_URL` is the exception, and it is worth knowing why.** It is
required for sign-in to work, but it is _not_ in `REQUIRED` in `src/lib/env.ts`

- only `DATABASE_URL` and `BETTER_AUTH_SECRET` are. So if it is missing, stale
  or wrong, the app boots cleanly, every page renders, and **sign-in fails with
  no startup error and nothing in the logs**. Better Auth uses it to build
  callback URLs and to scope the session cookie, so the symptoms are a redirect
  to the wrong origin, or a cookie that will not stick. If authentication ever
  breaks after a domain change, check this first: it is the cause almost every
  time.

**Previews cannot authenticate**, because they get a different origin per
branch and this is set to the production one. That is accepted rather than
worked around - previews are switched off for this project (Ignored Build Step),
so nothing is waiting on it.

## 5. Check the deploy

```bash
curl https://trivetbox.com/api/health
```

Healthy:

```json
{
  "status": "ok",
  "database": { "reachable": true, "migrated": true, "users": 0 }
}
```

It runs a real query rather than returning a bare 200, because the failures
worth catching all look like a healthy app until something touches the
database. The three states it distinguishes:

| Response                                                | Meaning                             | Fix                                                                                                                                                                           |
| ------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reachable: false`                                      | Wrong or unreachable `DATABASE_URL` | Check the pooled string and Neon's IP rules                                                                                                                                   |
| `reachable: true, migrated: false`                      | Connected, schema never created     | The `vercel-build` script did not run — check the build log                                                                                                                   |
| `disabledFeatures` contains `Texting the shopping list` | No SMS provider configured          | Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM_NUMBER`. US numbers also need A2P 10DLC registration, or carriers drop the messages without reporting anything |
| `status: "read-only"`                                   | Reads work, every write is refused  | `reason` says which: a read replica means `DATABASE_URL` points at the wrong endpoint; read-only mode is usually the provider, over a limit or mid-maintenance                |
| `status: ok`                                            | Working                             | —                                                                                                                                                                             |

`disabledFeatures` lists any optional integration that is off, so you can tell
a deliberate omission from a typo in a key name.

## 6. Create the first account

Signup is invite-only and there is no bootstrap screen, so the first account is
made by hand. Against the **direct** connection:

```sql
INSERT INTO "user"(id, name, email, "emailVerified", "createdAt", "updatedAt")
VALUES ('bootstrap', 'Your Name', 'you@example.com', true, now(), now());

INSERT INTO invite(id, code, "expiresAt", "createdAt", "createdById")
VALUES ('bootstrap-invite', 'PICKSOMETHINGRANDOM',
        now() + interval '7 days', now(), 'bootstrap');
```

Then open `https://trivetbox.com/sign-up?code=PICKSOMETHINGRANDOM`.

That row is a placeholder, not a login — it has no password and cannot sign in.
Delete it once your real account exists:

```sql
DELETE FROM "user" WHERE id = 'bootstrap';
```

The invite survives on its own; deleting the placeholder does not revoke the
account it created.

Everyone after the first is invited from inside the app.

## Rolling back

Vercel's instant rollback reverts the code but **not** the database. A deploy
that ran a destructive migration is not undone by rolling back the deploy — the
old code then runs against the new schema, which usually fails in a less
obvious way than the deploy did. Migrations in this repo are written to be
additive for that reason; keep them that way, or take a Neon branch before
deploying anything that drops a column.
