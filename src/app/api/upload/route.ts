import { BlobError } from "@vercel/blob";
import { NextResponse } from "next/server";

import {
  findRecipeBySourceHash,
  findSimilarlyTitled,
  hashBytes,
} from "@/lib/duplicates";
import {
  extractRecipeFromImage,
  extractRecipeFromPdf,
  MAX_CARD_IMAGE_BYTES,
} from "@/lib/extract-recipe";
import { inspectImage, type SupportedImageType } from "@/lib/image-inspect";
import { claimUploadSlot } from "@/lib/upload-quota";
import { extractLargestJpeg } from "@/lib/pdf-images";
import { inspectPdf } from "@/lib/pdf-inspect";
import { blobStoreId, storeFile } from "@/lib/storage";
import { getCurrentHousehold } from "@/lib/session";

/**
 * Reading a PDF takes as long as it takes.
 *
 * Without this the route inherits the platform's default timeout, which is far
 * shorter than a model call that reads a document and reasons about it - so an
 * upload that works locally dies in production with a gateway error and no
 * explanation. 60s is the Hobby ceiling; Pro and Fluid compute allow 300, and
 * this can be raised to match.
 */
export const maxDuration = 60;

/** PDFs above this are refused outright; the API caps requests at 32 MB. */
const MAX_PDF_BYTES = 20 * 1024 * 1024;

/** The first bytes of every PDF, used only to pick which validator applies. */
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-

function looksLikePdf(bytes: Uint8Array): boolean {
  return (
    bytes.length >= PDF_MAGIC.length &&
    PDF_MAGIC.every((byte, i) => bytes[i] === byte)
  );
}

/**
 * Anything that gets past the checks below and still throws.
 *
 * Without this, an unexpected failure returns Next's HTML error page. The
 * client cannot parse that as JSON, falls back to a guessed message, and tells
 * the person their PDF took too long to read - which sent two of us hunting
 * timeouts while the real answer (a misconfigured blob store) sat in the logs.
 *
 * So: log the real error where an operator will find it, and answer with
 * something true. Storage failures are named specifically, because those are
 * configuration problems rather than anything the person uploading did wrong.
 */
export async function POST(request: Request) {
  try {
    return await handleUpload(request);
  } catch (error) {
    console.error("[trivet] upload failed", error);

    if (error instanceof BlobError) {
      // Name the store, so a token pasted from the wrong one is obvious. The
      // error text talks about the store's configuration, which sends you to
      // the store's settings when the mistake is actually in the variable.
      console.error(
        `[trivet] blob store in use: ${blobStoreId() ?? "unknown"}`,
      );
      return NextResponse.json(
        {
          error:
            "File storage rejected the upload. The recipe was not saved - " +
            "this is a configuration problem, not a problem with your file.",
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { error: "Something went wrong reading that card. Nothing was saved." },
      { status: 500 },
    );
  }
}

async function handleUpload(request: Request) {
  // Upload is restricted to signed-in users. This is the enforcement point;
  // hiding the nav link is not.
  const user = await getCurrentHousehold();
  if (!user) {
    return NextResponse.json({ error: "Sign in to upload." }, { status: 401 });
  }

  // A request with no multipart body at all makes formData() throw, which
  // would otherwise surface as a 500 rather than a bad request.
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected a file upload." },
      { status: 400 },
    );
  }

  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file received." }, { status: 400 });
  }

  // The largest thing either path accepts, checked before the body is read
  // into memory. The per-format ceilings below are tighter.
  if (file.size > MAX_PDF_BYTES) {
    return NextResponse.json(
      { error: "That file is larger than 20 MB." },
      { status: 413 },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  // Which validator applies is decided by the bytes, not by file.type - the
  // browser supplies that and anything else can forge it. Everything below
  // rejects damaged, encrypted, oversized and mislabelled files before they
  // cost a slow, billable model call that would fail anyway.
  const card = looksLikePdf(bytes)
    ? await inspectAsPdf(bytes)
    : inspectAsImage(bytes);
  if (!card.ok) {
    return NextResponse.json({ error: card.reason }, { status: card.status });
  }

  // Before extraction, not after: recognising a file we already have is the
  // difference between an instant answer and a slow, billable call whose
  // result gets thrown away.
  const sourceFileSha256 = hashBytes(bytes);
  const alreadyHave = await findRecipeBySourceHash(
    sourceFileSha256,
    user.householdId,
  );
  if (alreadyHave) {
    return NextResponse.json(
      {
        error: `That exact file is already saved as "${alreadyHave.title}".`,
        duplicateOf: alreadyHave,
      },
      { status: 409 },
    );
  }

  // Metered here and nowhere earlier: everything above this line is free, and
  // a duplicate or a damaged file should not spend somebody's allowance on a
  // call that never happens.
  const slot = await claimUploadSlot(user.id);
  if (!slot.ok) {
    return NextResponse.json(
      {
        error:
          `That is ${slot.limit} cards read today, which is the daily limit. ` +
          `It resets at midnight UTC; recipes can still be typed in.`,
      },
      {
        status: 429,
        headers: { "Retry-After": String(slot.retryAfterSeconds) },
      },
    );
  }

  // Extraction is the slow part and the part that can fail, so do it before
  // storing anything - a card we cannot read should not leave files behind.
  const extraction =
    card.kind === "PDF"
      ? await extractRecipeFromPdf(bytes, file.name)
      : await extractRecipeFromImage(bytes, card.contentType, file.name);
  if (!extraction.ok) {
    return NextResponse.json({ error: extraction.error }, { status: 422 });
  }

  const stored = await storeFile(bytes, file.name, card.contentType);

  // The dish photo, which is not the card.
  //
  // A PDF often carries a picture of the finished dish, and that is worth
  // lifting out. A photograph of a card is a picture of the card - using it as
  // the dish photo would put a snapshot of a piece of paper at the top of the
  // recipe - so the photo path leaves this empty and the cook adds one later.
  let imageUrl: string | null = null;
  if (card.kind === "PDF") {
    const image = await extractLargestJpeg(bytes);
    if (image) {
      const photo = await storeFile(image.data, "photo.jpg", image.contentType);
      imageUrl = photo.url;
    }
  }

  // A different file for a dish already in the library shares no bytes with it,
  // so only the title gives it away. Reported alongside the extraction as a
  // warning: the review screen can show it, and the person decides.
  const similar = await findSimilarlyTitled(
    extraction.recipe.title,
    user.householdId,
  );

  return NextResponse.json({
    recipe: extraction.recipe,
    source: card.kind,
    sourceFileUrl: stored.url,
    sourceFileName: file.name,
    sourceFileType: card.contentType,
    sourceFileSha256,
    imageUrl,
    similar,
  });
}

type CardCheck =
  | { ok: true; kind: "PDF"; contentType: "application/pdf" }
  | { ok: true; kind: "PHOTO"; contentType: SupportedImageType }
  | { ok: false; reason: string; status: number };

async function inspectAsPdf(bytes: Uint8Array): Promise<CardCheck> {
  const inspection = await inspectPdf(bytes);
  if (!inspection.ok) {
    return { ok: false, reason: inspection.reason, status: 400 };
  }
  return { ok: true, kind: "PDF", contentType: "application/pdf" };
}

function inspectAsImage(bytes: Uint8Array): CardCheck {
  // Ahead of the format check, because it is the more useful thing to say
  // about a 12 MP photo: the file is fine, there is just too much of it.
  if (bytes.length > MAX_CARD_IMAGE_BYTES) {
    const mb = Math.round(MAX_CARD_IMAGE_BYTES / (1024 * 1024));
    return {
      ok: false,
      status: 413,
      reason: `That photo is larger than ${mb} MB. Most phones can send a smaller copy.`,
    };
  }

  const inspection = inspectImage(bytes);
  if (!inspection.ok) {
    return { ok: false, reason: inspection.reason, status: 400 };
  }

  return { ok: true, kind: "PHOTO", contentType: inspection.contentType };
}
