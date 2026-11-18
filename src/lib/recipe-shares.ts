import { randomUUID } from "node:crypto";

import { prisma } from "./db";

/**
 * Sharing a recipe with one household, by the email of someone in it.
 *
 * By address rather than from a list, because a list of households to pick
 * from would either be every household on Trivet - names nobody else needs
 * to see - or only the ones linked by an invite, which leaves out the two
 * friends who were both invited by somebody else. An address is something
 * you only have for people you know.
 *
 * The cost of that is that the box answers whether an address is on Trivet.
 * Signup is by invitation and only a signed-in household can ask, and each
 * household gets `LOOKUPS_PER_HOUR` tries, so it cannot be used to sweep a
 * list of addresses.
 */

export const LOOKUPS_PER_HOUR = 20;
const HOUR_MS = 60 * 60 * 1000;

export type ShareTarget = { householdId: string; name: string };

export type ShareResult =
  { ok: true; household: ShareTarget } | { ok: false; error: string };

/**
 * Count one lookup against this household's hour, in one statement so two at
 * once cannot both slip under the limit. The same table Better Auth keeps its
 * sign-in counts in, under a key of our own.
 */
async function claimLookup(householdId: string, now = Date.now()) {
  const key = `recipe-share:${householdId}`;
  const windowStart = BigInt(now - HOUR_MS);
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "rateLimit" ("id", "key", "count", "lastRequest")
    VALUES (${randomUUID()}, ${key}, 1, ${BigInt(now)})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "rateLimit"."lastRequest" < ${windowStart}
        THEN 1 ELSE "rateLimit"."count" + 1 END,
      "lastRequest" = CASE WHEN "rateLimit"."lastRequest" < ${windowStart}
        THEN ${BigInt(now)} ELSE "rateLimit"."lastRequest" END
    RETURNING "count"
  `;
  return Number(rows[0]?.count ?? 0) <= LOOKUPS_PER_HOUR;
}

/**
 * Share this household's recipe with the household of whoever has `email`.
 *
 * A household either side has hidden is answered as though the address were
 * not on Trivet: hiding a household is meant to end contact, and "they hid
 * you" is not news to deliver through a share box.
 */
export async function shareWithHousehold(
  recipeId: string,
  ownerHouseholdId: string,
  email: string,
): Promise<ShareResult> {
  const address = email.trim();
  if (!address.includes("@")) {
    return {
      ok: false,
      error: "Enter the email of someone in that household.",
    };
  }

  const recipe = await prisma.recipe.findFirst({
    where: { id: recipeId, householdId: ownerHouseholdId },
    select: { id: true },
  });
  if (!recipe) return { ok: false, error: "No such recipe." };

  if (!(await claimLookup(ownerHouseholdId))) {
    return {
      ok: false,
      error: "That is a lot of addresses in an hour. Try again later.",
    };
  }

  const user = await prisma.user.findFirst({
    where: { email: { equals: address, mode: "insensitive" } },
    select: {
      householdId: true,
      household: { select: { id: true, name: true } },
    },
  });
  const target = user?.household;
  if (!target) {
    return { ok: false, error: "Nobody on Trivet has that address." };
  }
  if (target.id === ownerHouseholdId) {
    return { ok: false, error: "That address is in your own household." };
  }
  const hidden = await prisma.householdBlock.count({
    where: {
      OR: [
        { blockerId: ownerHouseholdId, blockedId: target.id },
        { blockerId: target.id, blockedId: ownerHouseholdId },
      ],
    },
  });
  if (hidden > 0) {
    return { ok: false, error: "Nobody on Trivet has that address." };
  }

  await prisma.recipeShare.upsert({
    where: { recipeId_householdId: { recipeId, householdId: target.id } },
    create: { recipeId, householdId: target.id },
    update: {},
  });
  return { ok: true, household: { householdId: target.id, name: target.name } };
}

/** Stop sharing this household's recipe with one household. */
export async function stopSharingWith(
  recipeId: string,
  ownerHouseholdId: string,
  householdId: string,
): Promise<void> {
  await prisma.recipeShare.deleteMany({
    where: { recipeId, householdId, recipe: { householdId: ownerHouseholdId } },
  });
}

/**
 * Take a recipe someone shared out of this household's library.
 *
 * The recipient's side of the same row: the owner shared it, and the
 * household it was shared with can decline it without hiding the owner.
 */
export async function removeSharedWithUs(
  recipeId: string,
  householdId: string,
): Promise<void> {
  await prisma.recipeShare.deleteMany({ where: { recipeId, householdId } });
}

/** The households this household's recipe is shared with, by name. */
export async function listSharedWith(
  recipeId: string,
  ownerHouseholdId: string,
): Promise<ShareTarget[]> {
  const rows = await prisma.recipeShare.findMany({
    where: { recipeId, recipe: { householdId: ownerHouseholdId } },
    select: { household: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({
    householdId: r.household.id,
    name: r.household.name,
  }));
}

/** Whether this recipe reaches this household through a share of its own. */
export async function isSharedWith(
  recipeId: string,
  householdId: string,
): Promise<boolean> {
  const row = await prisma.recipeShare.findUnique({
    where: { recipeId_householdId: { recipeId, householdId } },
    select: { recipeId: true },
  });
  return row !== null;
}
