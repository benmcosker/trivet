"use server";

import { revalidatePath } from "next/cache";

import { createInvite, revokeInvite } from "@/lib/invites";
import {
  renameHousehold,
  saveOwnPhone,
  setDefaultServings,
} from "@/lib/household";
import { requireHousehold } from "@/lib/session";

export type InviteKind = "family" | "outside";

/**
 * As much of a failure as is safe to put on the screen.
 *
 * A database error's text can name columns, constraints and values, so it does
 * not belong in a browser. Its *code* names nothing - P2003 is a foreign key,
 * P2002 a duplicate - and it is the difference between somebody reporting
 * "it broke" and reporting something anyone can act on. This household runs on
 * two accounts and the person hitting the error is the person who has to fix
 * it; making them go and find a serverless log first is a poor trade.
 */
function hint(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code)
      : null;

  return code ? `Please try again, and mention ${code}.` : "Please try again.";
}

export type CreatedInvite = {
  code: string;
  expiresAt: string;
  kind: InviteKind;
  /** The name the new household will take, when the sender chose one. */
  householdName: string | null;
};

export type InviteResult =
  { ok: true; invite: CreatedInvite } | { ok: false; error: string };

/**
 * Mint a code for someone.
 *
 * The two kinds differ in one thing, and it is the thing worth being careful
 * about: a family invite hands over everything this household can see, and an
 * outside one hands over nothing at all. The kind is decided here from the
 * sender's own household rather than taken from the client, so a tampered form
 * post cannot add someone to a family they were never invited to.
 */
export async function createInviteAction(
  kind: InviteKind,
  email?: string,
  householdName?: string,
): Promise<InviteResult> {
  const user = await requireHousehold();

  const trimmed = email?.trim() ?? "";
  if (trimmed && !trimmed.includes("@")) {
    return { ok: false, error: "That does not look like an email address." };
  }

  let invite;
  try {
    invite = await createInvite({
      createdById: user.id,
      householdId: kind === "family" ? user.householdId : null,
      householdName: kind === "outside" ? householdName : null,
      email: trimmed || null,
    });
  } catch (error) {
    // An unhandled throw here reaches the browser as a bare Next.js error
    // digest - a number, with the message stripped out because it is a server
    // error. That is the right thing to show a stranger and useless to
    // everyone, including whoever has to work out what went wrong.
    console.error("[invite] could not create", error);
    return {
      ok: false,
      error: `That code could not be created. ${hint(error)}`,
    };
  }

  revalidatePath("/household");
  return {
    ok: true,
    invite: {
      code: invite.code,
      expiresAt: invite.expiresAt.toISOString(),
      kind,
      householdName: kind === "outside" ? householdName?.trim() || null : null,
    },
  };
}

export type RenameResult =
  { ok: true; name: string } | { ok: false; error: string };

export async function renameHouseholdAction(
  name: string,
): Promise<RenameResult> {
  const user = await requireHousehold();

  let saved: string | null;
  try {
    saved = await renameHousehold(user.householdId, name);
  } catch (error) {
    console.error("[household] could not rename", error);
    return { ok: false, error: "That name could not be saved. Try again." };
  }
  if (!saved) return { ok: false, error: "Give the household a name." };

  revalidatePath("/household");
  return { ok: true, name: saved };
}

/**
 * How many this household cooks for.
 *
 * Saved without a confirmation because there is nothing to confirm: it
 * changes what the next dinner is planned for and nothing that already
 * exists. A week already on the planner keeps the numbers it was given -
 * changing them from here would rewrite a plan somebody made on purpose.
 */
export async function setDefaultServingsAction(
  servings: number | null,
): Promise<void> {
  const user = await requireHousehold();

  try {
    await setDefaultServings(user.householdId, servings);
  } catch (error) {
    console.error("[household] could not save the serving default", error);
    return;
  }

  revalidatePath("/household");
  revalidatePath("/plan");
}

/** Withdraw a code before anyone uses it. */
export async function revokeInviteAction(id: string): Promise<void> {
  const user = await requireHousehold();
  try {
    await revokeInvite(id, user.id);
  } catch (error) {
    // Nothing useful to say on the page - the code is either gone or it is
    // not, and the list refreshes either way - but the reason belongs in the
    // log rather than nowhere.
    console.error("[invite] could not revoke", error);
  }
  revalidatePath("/household");
}

export type PhoneResult =
  | { ok: true; phone: string | null; consented: boolean }
  | { ok: false; error: string };

/**
 * Set or clear your own number, and whether you agree to be texted.
 *
 * Never anybody else's - see saveOwnPhone. The agreement travels with the
 * number in one call because they are set by one form: a number saved without
 * the box ticked is an address the app holds and will not use.
 */
export async function saveMyPhoneAction(
  phone: string,
  consent: boolean,
): Promise<PhoneResult> {
  const user = await requireHousehold();

  try {
    const result = await saveOwnPhone(user.id, phone, consent);
    revalidatePath("/household");
    revalidatePath("/plan");
    return result;
  } catch (error) {
    console.error("[household] could not save phone", error);
    return { ok: false, error: "That number could not be saved. Try again." };
  }
}
