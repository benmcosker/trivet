import { randomBytes } from "node:crypto";

import { prisma } from "./db";
import { defaultHouseholdName, MAX_HOUSEHOLD_NAME } from "./household";

/** How long a freshly minted invite stays redeemable. */
export const INVITE_TTL_DAYS = 14;

export type InviteCheck =
  | {
      ok: true;
      inviteId: string;
      /**
       * The family the code joins, or null when it mints a household of its
       * own. The signup form uses this to say what the code is actually for -
       * "joining the McMullens" and "starting your own" are very different
       * things to be agreeing to.
       */
      householdName: string | null;
    }
  | { ok: false; reason: InviteRejection };

export type InviteRejection =
  "unknown" | "already_redeemed" | "expired" | "wrong_email";

export const inviteRejectionMessage: Record<InviteRejection, string> = {
  unknown: "That invite code is not valid.",
  already_redeemed: "That invite has already been used.",
  expired: "That invite has expired. Ask for a new one.",
  wrong_email: "That invite was issued for a different email address.",
};

/**
 * URL-safe, unambiguous invite code.
 *
 * 16 chars from a 32-symbol alphabet is 80 bits - far beyond guessing, while
 * still being something you can read down the phone. Excludes I/L/O/U and 0/1
 * to avoid the characters people most often transcribe wrongly.
 */
/**
 * The address an invite code is shared as: `/sign-up?code=ABC123` on this
 * deployment's own origin.
 *
 * Built from `BETTER_AUTH_URL`, the same variable password-reset links are
 * built from, rather than a hard-coded trivetbox.com. In production the two
 * are the same thing; on a preview deployment or a laptop this points at the
 * database the code was actually minted in, where a hard-coded production
 * address would send somebody to a sign-up page that has never heard of it.
 * And if the variable is ever wrong, invite links and reset links break
 * together - DEPLOYING.md already says how to fix it, once.
 *
 * Server-only: the client never sees the variable, so the link is built here
 * and handed over finished.
 */
export function inviteLink(code: string): string {
  const base = process.env.BETTER_AUTH_URL;
  if (!base) throw new Error("BETTER_AUTH_URL is not set");
  const url = new URL("/sign-up", base);
  url.searchParams.set("code", code);
  return url.toString();
}

export function generateInviteCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
  const bytes = randomBytes(16);
  let code = "";
  for (const byte of bytes) {
    code += alphabet[byte % alphabet.length];
  }
  return code;
}

/**
 * Mint an invite code.
 *
 * `householdId` is what separates the two kinds. Pass the sender's household to
 * invite someone into the family: they will see the same recipes, the same
 * plan, the same shopping list. Pass null to invite someone outside it, who
 * gets a household of their own and shares nothing.
 */
export async function createInvite(params: {
  createdById: string;
  householdId: string | null;
  /**
   * What to call the household this code will create. Only read when
   * `householdId` is null; ignored for a family invite, which joins a
   * household that already has a name.
   */
  householdName?: string | null;
  email?: string | null;
}): Promise<{ code: string; expiresAt: Date }> {
  const expiresAt = new Date(
    Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000,
  );

  const invite = await prisma.invite.create({
    data: {
      code: generateInviteCode(),
      email: normaliseEmail(params.email) || null,
      expiresAt,
      createdById: params.createdById,
      householdId: params.householdId,
      householdName: params.householdId
        ? null
        : params.householdName?.trim().slice(0, MAX_HOUSEHOLD_NAME) || null,
    },
  });

  return { code: invite.code, expiresAt: invite.expiresAt };
}

/**
 * Validate an invite without consuming it, so the signup form can reject a bad
 * code before asking for a password.
 */
export async function checkInvite(
  code: string,
  email?: string,
): Promise<InviteCheck> {
  const invite = await prisma.invite.findUnique({
    where: { code: code.trim().toUpperCase() },
    include: { household: { select: { name: true } } },
  });

  if (!invite) return { ok: false, reason: "unknown" };
  if (invite.redeemedAt) return { ok: false, reason: "already_redeemed" };
  if (invite.expiresAt.getTime() <= Date.now()) {
    return { ok: false, reason: "expired" };
  }
  if (
    invite.email &&
    email &&
    normaliseEmail(invite.email) !== normaliseEmail(email)
  ) {
    return { ok: false, reason: "wrong_email" };
  }

  return {
    ok: true,
    inviteId: invite.id,
    householdName: invite.household?.name ?? null,
  };
}

/**
 * Consume an invite for a newly created user, and put them in a household.
 *
 * The update is conditional on `redeemedAt` still being null, so two signups
 * racing on the same code cannot both succeed - the loser matches zero rows.
 * `redeemedById` is unique in the schema as a second line of defence.
 *
 * Claiming the code and placing the account are one transaction because an
 * account with no household can use nothing in the app: the pages all read
 * through `requireHousehold`. If the placement fails the claim rolls back with
 * it, leaving the code usable rather than spent on an account that cannot see
 * a recipe.
 */
export async function redeemInvite(
  code: string,
  userId: string,
): Promise<boolean> {
  const normalised = code.trim().toUpperCase();

  return prisma.$transaction(async (tx) => {
    const { count } = await tx.invite.updateMany({
      where: { code: normalised, redeemedAt: null },
      data: { redeemedAt: new Date(), redeemedById: userId },
    });
    if (count !== 1) return false;

    const invite = await tx.invite.findUnique({
      where: { code: normalised },
      select: { householdId: true, householdName: true },
    });

    let householdId = invite?.householdId ?? null;

    // No household on the invite means it was sent to someone outside the
    // family, so they start one of their own rather than joining the sender's.
    // The sender may have named it when they sent the code - they usually know
    // what the family calls itself better than the signup form does. Falling
    // back to the redeemer's own name when they did not.
    if (!householdId) {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { name: true },
      });
      const household = await tx.household.create({
        data: {
          name: invite?.householdName ?? defaultHouseholdName(user?.name ?? ""),
        },
      });
      householdId = household.id;
    }

    await tx.user.update({ where: { id: userId }, data: { householdId } });
    return true;
  });
}

export type PendingInvite = {
  id: string;
  code: string;
  email: string | null;
  expiresAt: Date;
  /** True when it joins the sender's own household rather than starting one. */
  joinsFamily: boolean;
};

/**
 * Codes this person has sent that nobody has used yet.
 *
 * Listed by sender rather than by household, because an invite to someone
 * outside the family belongs to no household - it is a code that will make one.
 * Expired codes are left out: they cannot be redeemed, so showing them would
 * only invite someone to read one down the phone to no effect.
 */
export async function listPendingInvites(
  createdById: string,
): Promise<PendingInvite[]> {
  const invites = await prisma.invite.findMany({
    where: {
      createdById,
      redeemedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      code: true,
      email: true,
      expiresAt: true,
      householdId: true,
    },
  });

  return invites.map((invite) => ({
    id: invite.id,
    code: invite.code,
    email: invite.email,
    expiresAt: invite.expiresAt,
    joinsFamily: invite.householdId !== null,
  }));
}

/** Withdraw a code you sent but nobody has used. */
export async function revokeInvite(
  id: string,
  createdById: string,
): Promise<boolean> {
  const { count } = await prisma.invite.deleteMany({
    where: { id, createdById, redeemedAt: null },
  });
  return count > 0;
}

function normaliseEmail(email?: string | null): string {
  return (email ?? "").trim().toLowerCase();
}
