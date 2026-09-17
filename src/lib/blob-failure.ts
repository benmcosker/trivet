import { BlobError } from "@vercel/blob";
import { NextResponse } from "next/server";

import { blobStoreId, usingBlobStorage } from "./storage";

/**
 * What to say, and what to log, when the blob store turns an upload away.
 *
 * One function because there are two upload routes and they had drifted: the
 * recipe-card route logged which store the token named, the photo route did
 * not, and the photo route is the one that failed in production. The operator
 * got "Access denied, please provide a valid token for this resource" and
 * nothing at all about which token or which store - which is exactly the
 * information the other route had been printing all along.
 *
 * The store id is worth printing because Vercel's own error talks about *the
 * resource*, which reads as a problem with the store and sends you to the
 * store's settings. The mistake is almost always in the variable instead:
 * pasted with the quotes around it, truncated, or belonging to a store that no
 * longer exists. `blobStoreId` reads the id out of the token rather than out
 * of the dashboard, so the two can be compared - and "unknown" is itself the
 * answer, because it means the value is not shaped like a token at all.
 *
 * Nothing secret is printed. Vercel's tokens are `vercel_blob_rw_<store>_<secret>`
 * and only the store segment is ever read.
 */
export function blobFailure(
  error: unknown,
  /** What the person was trying to store: "upload", "image". */
  subject: "file" | "photo",
): NextResponse | null {
  if (!(error instanceof BlobError)) return null;

  console.error(
    `[trivet] blob store in use: ${blobStoreId() ?? "unknown"}` +
      (usingBlobStorage()
        ? ""
        : " (no BLOB_READ_WRITE_TOKEN is set at all, so this deployment was " +
          "writing to the local disk)"),
  );

  return NextResponse.json(
    {
      error:
        `File storage rejected the ${subject}. Nothing was saved - this is ` +
        "a configuration problem, not a problem with your " +
        `${subject === "photo" ? "photo" : "file"}.`,
    },
    { status: 500 },
  );
}
