import { NextResponse } from "next/server";

import { findSimilarlyTitled } from "@/lib/duplicates";
import { extractRecipeFromText } from "@/lib/extract-recipe";
import { PASTED_TEXT_REFUSAL, readPastedText } from "@/lib/pasted-text";
import { getCurrentHousehold } from "@/lib/session";
import { claimUploadSlot } from "@/lib/upload-quota";

/**
 * Text somebody pasted or shared, read as a recipe.
 *
 * The cheapest of the imports: no page to fetch and no file to store, one
 * model call on a few hundred words. It is where a caption ends up, since
 * neither Instagram nor TikTok will hand one to a server (`social-links.ts`),
 * and where a recipe sent in a message or kept in a note comes in.
 *
 * Same ceiling as the other imports, for the same reason: the model call is
 * most of the time, and without one the platform's default would cut it off.
 */
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    return await handle(request);
  } catch (error) {
    // An unhandled throw would be Next's HTML error page, which the client
    // cannot parse and would report as a timeout.
    console.error("[trivet] text import failed", error);
    return NextResponse.json(
      { error: "Something went wrong reading that text. Nothing was saved." },
      { status: 500 },
    );
  }
}

async function handle(request: Request) {
  const user = await getCurrentHousehold();
  if (!user) {
    return NextResponse.json({ error: "Sign in to upload." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const pasted = readPastedText(
    typeof body?.text === "string" ? body.text : null,
  );
  if (!pasted.ok) {
    return NextResponse.json(
      { error: PASTED_TEXT_REFUSAL[pasted.reason] },
      { status: 400 },
    );
  }

  // Metered after the checks above, so an empty paste costs no allowance.
  const slot = await claimUploadSlot(user.id);
  if (!slot.ok) {
    return NextResponse.json(
      {
        error:
          `That is ${slot.limit} recipes read today, which is the daily ` +
          `limit. It resets at midnight UTC; recipes can still be typed in.`,
      },
      {
        status: 429,
        headers: { "Retry-After": String(slot.retryAfterSeconds) },
      },
    );
  }

  // Text the share sheet read off screenshots, rather than text somebody
  // copied. Only changes what the model is told to expect.
  const extraction = await extractRecipeFromText({
    text: pasted.text,
    link: pasted.link,
    fromScreenshots: body?.origin === "screenshots",
  });
  if (!extraction.ok) {
    return NextResponse.json({ error: extraction.error }, { status: 422 });
  }

  // As with a pasted link, a second paste of the same text makes a second
  // recipe; the title match is what says "you may already have this".
  const similar = await findSimilarlyTitled(
    extraction.recipe.title,
    user.householdId,
  );

  return NextResponse.json({
    recipe: extraction.recipe,
    source: "TEXT",
    sourceFileUrl: null,
    sourceFileName: null,
    sourceFileType: null,
    sourceFileSha256: null,
    imageUrl: null,
    similar,
  });
}
