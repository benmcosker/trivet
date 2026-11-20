import { NextResponse } from "next/server";

import { prisma } from "./db";

/**
 * Permission to send what somebody imports to Anthropic to be read.
 *
 * App Store guideline 5.1.2(i): personal data may go to a third-party AI only
 * once the person has been told who it goes to and has said yes. Trivet asks
 * once, on the Add a recipe page, before the first import, and the Household
 * page can take it back.
 *
 * The page asking is not what protects anybody: every import route checks
 * here as well, before it fetches a page, stores a file or spends any of the
 * day's allowance. A stale tab, the iPhone share sheet or a script calling the
 * API all meet the same refusal.
 */

/** The code the import routes answer with, so the page can tell it apart. */
export const AI_CONSENT_REQUIRED = "ai_consent_required";

/** When this person agreed, or null if they have not. */
export async function aiConsentDate(userId: string): Promise<Date | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { aiConsentAt: true },
  });
  return user?.aiConsentAt ?? null;
}

export async function hasAiConsent(userId: string): Promise<boolean> {
  return (await aiConsentDate(userId)) !== null;
}

/**
 * Record the agreement. Agreeing again keeps the first date: the date says
 * when they were first told, and a second tap tells them nothing new.
 */
export async function recordAiConsent(userId: string, now = new Date()) {
  await prisma.user.updateMany({
    where: { id: userId, aiConsentAt: null },
    data: { aiConsentAt: now },
  });
}

/** Take it back. The next import asks again. */
export async function withdrawAiConsent(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { aiConsentAt: null },
  });
}

/**
 * The import routes' check: null to carry on, else the refusal to return.
 * 403 rather than 401: the person is signed in, they have just not agreed.
 */
export async function refuseWithoutAiConsent(
  userId: string,
): Promise<NextResponse | null> {
  if (await hasAiConsent(userId)) return null;
  return aiConsentRefusal();
}

/** What a route answers somebody who has not agreed. */
export function aiConsentRefusal(): NextResponse {
  return NextResponse.json(
    {
      error:
        "Trivet needs your permission before it sends a recipe to Anthropic " +
        "to be read. Reload this page to give it, or type the recipe in.",
      code: AI_CONSENT_REQUIRED,
    },
    { status: 403 },
  );
}
