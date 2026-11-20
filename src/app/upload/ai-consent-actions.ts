"use server";

import { revalidatePath } from "next/cache";

import { recordAiConsent, withdrawAiConsent } from "@/lib/ai-consent";
import { requireUser } from "@/lib/session";

/**
 * Agree, from the Add a recipe page, that imports are sent to Anthropic to be
 * read. Only ever the signed-in person's own: the id comes from the session.
 */
export async function agreeToAiAction() {
  const user = await requireUser();
  await recordAiConsent(user.id);
  forgetConsentPages();
}

/** Take the agreement back, from the Household page. */
export async function withdrawAiConsentAction() {
  const user = await requireUser();
  await withdrawAiConsent(user.id);
  forgetConsentPages();
}

/**
 * The browser keeps a page it has shown for 30 seconds (`staleTimes` in
 * next.config.ts) and every action that changes something clears that. Without
 * it, going back to Add a recipe after agreeing showed the copy from before,
 * and asked again; withdrawing left a copy that no longer asked.
 */
function forgetConsentPages() {
  revalidatePath("/upload");
  revalidatePath("/household");
}
