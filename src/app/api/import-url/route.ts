import { NextResponse } from "next/server";

import { findSimilarlyTitled } from "@/lib/duplicates";
import { extractRecipeFromPage } from "@/lib/extract-recipe";
import {
  fetchImageBytes,
  fetchPage,
  isPublicHost,
  type PageFailure,
} from "@/lib/fetch-page";
import { inspectImage } from "@/lib/image-inspect";
import {
  displayAddress,
  hostLabel,
  normaliseAddress,
} from "@/lib/recipe-address";
import {
  findRecipeMarkup,
  markupImageUrl,
  readablePageText,
} from "@/lib/recipe-markup";
import { getCurrentHousehold } from "@/lib/session";
import { storeFile } from "@/lib/storage";
import { claimUploadSlot } from "@/lib/upload-quota";

/**
 * A fetch of somebody else's site plus a model call that reads it.
 *
 * Same ceiling and same reasoning as `/api/upload`: without it the route
 * inherits the platform's default timeout, which is far shorter than this
 * takes, and the failure arrives as a gateway error with nothing to say. The
 * page fetch spends at most 20s of this and the model has the rest.
 */
export const maxDuration = 60;

/**
 * Why the page did not come back, in a shape the client can turn into copy.
 *
 * The strings live in `UploadWorkflow`, not here. What crosses the wire is the
 * fact - which site, which address, what happened - because the wording is a
 * design decision that will be revised, and a server that ships wording turns
 * every copy change into a deployment of the API.
 */
type HandoffPayload = {
  kind: PageFailure;
  /** `halfbakedharvest.com`. */
  host: string;
  /** `halfbakedharvest.com/soup`. */
  address: string;
  /** The whole normalised address, so the note can link to it. */
  url: string;
};

export async function POST(request: Request) {
  try {
    return await handleImport(request);
  } catch (error) {
    // Same reasoning as the upload route: an unhandled throw here would be
    // Next's HTML error page, which the client cannot parse and would report
    // as a timeout.
    console.error("[trivet] url import failed", error);
    return NextResponse.json(
      { error: "Something went wrong reading that page. Nothing was saved." },
      { status: 500 },
    );
  }
}

async function handleImport(request: Request) {
  // The enforcement point. Hiding the field is not.
  const user = await getCurrentHousehold();
  if (!user) {
    return NextResponse.json({ error: "Sign in to upload." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const raw = typeof body?.url === "string" ? body.url : "";

  // The client checks this too, so that a typo costs nothing. This is the
  // check that counts.
  const address = normaliseAddress(raw);
  if (!address) {
    return NextResponse.json(
      { error: "That isn't a web address." },
      { status: 400 },
    );
  }

  if (!isPublicHost(new URL(address).hostname)) {
    return NextResponse.json(
      {
        error:
          "That address is not on the public web, so Trivet cannot read it.",
      },
      { status: 400 },
    );
  }

  const page = await fetchPage(address);
  if (!page.ok) {
    const handoff: HandoffPayload = {
      kind: page.failure,
      host: hostLabel(address),
      address: displayAddress(address),
      url: address,
    };
    return NextResponse.json(
      { error: refusalSummary(handoff), handoff },
      { status: 422 },
    );
  }

  const markup = findRecipeMarkup(page.html);

  // Metered here: everything above is a fetch of a public page, and a site
  // that refuses should not spend somebody's allowance. Everything below is
  // the billable half.
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

  const extraction = await extractRecipeFromPage({
    url: page.finalUrl,
    siteName: markup?.siteName ?? null,
    markup: markup ? JSON.stringify(markup.recipe, null, 2) : null,
    text: markup ? null : readablePageText(page.html),
  });
  if (!extraction.ok) {
    return NextResponse.json({ error: extraction.error }, { status: 422 });
  }

  const imageUrl = await storePageImage(markupImageUrl(markup, page.html));

  // A second paste of the same post makes a second recipe rather than being
  // refused - there is no file hash to recognise it by, and the title match
  // below is what says "you may already have this".
  const similar = await findSimilarlyTitled(
    extraction.recipe.title,
    user.householdId,
  );

  return NextResponse.json({
    recipe: extraction.recipe,
    source: "URL",
    sourceFileUrl: null,
    sourceFileName: null,
    sourceFileType: null,
    sourceFileSha256: null,
    imageUrl,
    similar,
  });
}

/**
 * Lift the page's own photo of the dish, if it has one.
 *
 * Copied into our own storage rather than hotlinked: a recipe in the library
 * outlives somebody else's CDN path, and a hotlink is a request to their
 * server every time the library is browsed. Every failure here is null, which
 * the review screen already has a sentence for.
 */
async function storePageImage(source: string | null): Promise<string | null> {
  if (!source) return null;

  try {
    const bytes = await fetchImageBytes(source);
    if (!bytes || bytes.length === 0) return null;

    // By the bytes, not by what the response claimed: an og:image that is
    // really an HTML error page would otherwise become a permanently broken
    // picture at the top of the recipe.
    const inspection = inspectImage(bytes);
    if (!inspection.ok) return null;

    const stored = await storeFile(
      bytes,
      `photo.${inspection.extension}`,
      inspection.contentType,
    );
    return stored.url;
  } catch (error) {
    console.error("[trivet] could not store the page's photo", error);
    return null;
  }
}

/**
 * A plain-text version of the handoff, for anything that cannot render one.
 *
 * The client builds the real note from `handoff`; this is what a curl, a log
 * line or a future caller gets, and it exists so the `error` field is never
 * empty on a failure.
 */
function refusalSummary(handoff: HandoffPayload): string {
  switch (handoff.kind) {
    case "missing":
      return `Nothing is at ${handoff.address}.`;
    case "timeout":
      return `${handoff.host} didn't answer in time.`;
    case "refused":
      return `${handoff.host} only answers a real browser.`;
    case "busy":
      return `${handoff.host} asked us to slow down.`;
    default:
      return `${handoff.host} didn't answer with a web page.`;
  }
}
