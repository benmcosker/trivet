import * as Sentry from "@sentry/nextjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "./auth";
import { prisma } from "./db";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
};

export type HouseholdUser = CurrentUser & {
  householdId: string;
  householdName: string;
};

/** The signed-in user, or null. Safe to call from any server component. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  // Who saw an error, by id only - see `sentry-options.ts`. Scoped to this
  // request; a no-op without a DSN.
  if (session?.user) Sentry.setUser({ id: session.user.id });
  return session?.user ?? null;
}

/**
 * The signed-in user, or a redirect to sign-in.
 *
 * Guards pages that need an account but no household data. Anything that reads
 * or writes recipes, plans, pantry or shopping wants `requireHousehold`
 * instead - the household is the scope those queries filter on.
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}

/**
 * The signed-in user together with the family they belong to.
 *
 * Every page that touches recipes, the plan, the pantry or the shopping list
 * goes through here, and passes the household id down into the query. That is
 * the whole isolation mechanism: a household id nobody can supply from the
 * outside, threaded into the where clause.
 *
 * The column is nullable because better-auth's adapter creates the user row
 * before the signup hook can place them, so a user with no household is either
 * mid-signup or the wreckage of a failed one. Neither can be shown a library,
 * so both are sent back to sign in.
 */
export async function requireHousehold(): Promise<HouseholdUser> {
  const user = await getCurrentHousehold();
  if (!user) redirect("/sign-in");
  return user;
}

/**
 * The same, but answering null instead of redirecting.
 *
 * For the API routes, which owe a caller a 401 rather than a page.
 */
export async function getCurrentHousehold(): Promise<HouseholdUser | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const record = await prisma.user.findUnique({
    where: { id: user.id },
    select: { household: { select: { id: true, name: true } } },
  });
  if (!record?.household) return null;

  return {
    ...user,
    householdId: record.household.id,
    householdName: record.household.name,
  };
}
