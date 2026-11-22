import { NextResponse } from "next/server";

import { allowanceMessage, claimImportAllowance } from "./import-allowance";

/**
 * The monthly allowance, as the answer an import route gives when it is spent.
 *
 * Null when there is room, so a route can write
 * `const over = await refuseIfOverAllowance(...); if (over) return over;`.
 * A 429 with Retry-After, the same shape as the daily ceiling, so the upload
 * screen already knows how to show it.
 */
export async function refuseIfOverAllowance(
  householdId: string,
): Promise<NextResponse | null> {
  const claim = await claimImportAllowance(householdId);
  if (claim.ok) return null;
  return NextResponse.json(
    { error: allowanceMessage(claim.kind, claim.limit) },
    {
      status: 429,
      headers: { "Retry-After": String(claim.retryAfterSeconds) },
    },
  );
}
