"use server";

import { recordAiConsent, withdrawAiConsent } from "@/lib/ai-consent";
import { requireUser } from "@/lib/session";

/**
 * Agree, from the Add a recipe page, that imports are sent to Anthropic to be
 * read. Only ever the signed-in person's own: the id comes from the session.
 */
export async function agreeToAiAction() {
  const user = await requireUser();
  await recordAiConsent(user.id);
}

/** Take the agreement back, from the Household page. */
export async function withdrawAiConsentAction() {
  const user = await requireUser();
  await withdrawAiConsent(user.id);
}
