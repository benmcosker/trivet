/**
 * Create the account `npm run browse` signs in as.
 *
 * This needs a script rather than a signup form because signup is invite-only
 * and the first invite has nowhere to come from: `Invite.createdById` is not
 * nullable, so an invite needs a user, and a user needs an invite. The way in
 * is to write one row directly - an owner who exists only to have issued the
 * invite - and then let the app do the rest through its own signup endpoint,
 * so the password hash, the household and the redemption are all the real
 * ones rather than this script's idea of them.
 *
 *   npm run browse:seed
 *
 * Needs the app already running (it posts to the signup endpoint) and reads
 * the same variables the browser check does:
 *   BROWSE_EMAIL, BROWSE_PASSWORD, BROWSE_BASE_URL (default localhost:3000)
 *
 * Idempotent: if the account is already there it says so and stops. To start
 * over - after changing BROWSE_PASSWORD, say - delete the user and re-run.
 *
 * Only ever point this at a development or CI database. It writes rows.
 */
import { randomUUID } from "node:crypto";

import "dotenv/config";

import { prisma } from "@/lib/db";

const base = process.env.BROWSE_BASE_URL ?? "http://localhost:3000";
const email = process.env.BROWSE_EMAIL;
const password = process.env.BROWSE_PASSWORD;

if (!email || !password) {
  console.error(
    "BROWSE_EMAIL and BROWSE_PASSWORD must be set - they are the account to create.",
  );
  process.exit(2);
}

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed a production database.");
  process.exit(2);
}

/*
 * The owner exists to satisfy the foreign key and nothing else. It has no
 * account row, so there is no password and it cannot be signed in as; it is a
 * name on an invite. Kept at a `.invalid` address, which is reserved by
 * RFC 2606 and can never collide with a real one.
 */
const OWNER_EMAIL = "browse-seed@example.invalid";

async function main(): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`${email} already exists - nothing to do.`);
    return;
  }

  /*
   * `User.id` has no database default - better-auth mints ids itself, and the
   * schema follows it rather than adding one Prisma would have to agree with.
   * A row written from outside the app therefore has to bring its own.
   */
  const owner = await prisma.user.upsert({
    where: { email: OWNER_EMAIL },
    update: {},
    create: { id: randomUUID(), name: "Browse seed", email: OWNER_EMAIL },
  });

  const code = `BROWSE${Date.now().toString(36).toUpperCase()}`;
  await prisma.invite.create({
    data: {
      code,
      // Long enough to survive a slow CI step, short enough to be useless if
      // it somehow outlives this run.
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      createdById: owner.id,
      householdName: "The Browse Check Household",
    },
  });

  const response = await fetch(`${base}/api/auth/sign-up/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      /*
       * better-auth rejects a signup with no Origin, which is a CSRF check
       * working correctly - a browser always sends one. `fetch` from Node
       * does not, so state the origin we are actually posting to. It has to
       * match BETTER_AUTH_URL or better-auth will not trust it either.
       */
      Origin: base,
    },
    body: JSON.stringify({
      email,
      password,
      name: "Browse Check",
      inviteCode: code,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(
      `Signup failed with ${response.status}: ${body}\n` +
        `Is the app running at ${base}?`,
    );
    process.exit(1);
  }

  console.log(`Created ${email} in a new household, ready for npm run browse.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
