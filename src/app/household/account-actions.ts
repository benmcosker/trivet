"use server";

import { redirect } from "next/navigation";

import { deleteAccount } from "@/lib/account-deletion";
import { requireUser } from "@/lib/session";

export type DeleteAccountResult = { ok: false; error: string };

/**
 * Delete the signed-in account. The person types their email address to
 * confirm, so a stray tap cannot do it. Their sign-ins go with the account, so
 * the next page load finds nobody signed in.
 */
export async function deleteAccountAction(
  confirmEmail: string,
): Promise<DeleteAccountResult> {
  const user = await requireUser();
  if (confirmEmail.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
    return {
      ok: false,
      error: "That isn't the email address on this account.",
    };
  }

  await deleteAccount(user.id);
  redirect("/sign-in?deleted=1");
}
