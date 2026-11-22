import Typography from "@mui/material/Typography";
import type { Metadata } from "next";
import Link from "next/link";

import { inTrivetApp } from "@/lib/in-app";
import { APP_NAME, CONTACT_EMAIL, LEGAL_UPDATED } from "@/lib/legal";
import {
  PRICE_MONTHLY_USD,
  PRICE_YEARLY_USD,
  REFUND_DAYS,
} from "@/lib/pricing";

export const metadata: Metadata = {
  title: `Refund Policy — ${APP_NAME}`,
  description: `How cancelling and refunds work for ${APP_NAME}'s paid household plan.`,
};

/**
 * The refund policy, on a page of its own.
 *
 * A payment processor reviewing the site asks for the refund policy to be
 * easy to find, not buried in the terms. The terms and the pricing page say
 * the same thing; the window comes from `lib/pricing.ts` so the three agree.
 */
export default async function RefundsPage() {
  const inApp = await inTrivetApp();

  return (
    <>
      <Typography variant="h1" sx={{ mb: 1 }}>
        Refund Policy
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        This applies to the paid household plan
        {inApp
          ? ""
          : ` at US$${PRICE_MONTHLY_USD} a month or US$${PRICE_YEARLY_USD} a year`}
        . {APP_NAME} itself is free to use.
      </Typography>

      <Typography variant="h2" sx={{ mb: 1 }}>
        Cancelling
      </Typography>
      <Typography sx={{ mb: 3 }}>
        You can cancel at any time. Cancelling stops the next renewal, and the
        plan keeps working to the end of the period you already paid for. For a
        web purchase, cancel from the link in your receipt. For an iPhone
        purchase, cancel in your Apple account settings.
      </Typography>

      <Typography variant="h2" sx={{ mb: 1 }}>
        Refunds
      </Typography>
      <Typography sx={{ mb: 1 }}>
        A web payment can be refunded within {REFUND_DAYS} days of it being
        taken, whether it was the first payment or a renewal. Write to{" "}
        {CONTACT_EMAIL} with the email address you paid with.
      </Typography>
      <Typography sx={{ mb: 1 }}>
        A purchase made through Apple is refunded by Apple, under Apple&apos;s
        rules, not by us.
      </Typography>
      <Typography sx={{ mb: 3 }}>
        If {APP_NAME} closes, the part of a period you paid for and did not use
        is refunded.
      </Typography>

      <Typography variant="h2" sx={{ mb: 1 }}>
        What you keep
      </Typography>
      <Typography sx={{ mb: 3 }}>
        When a household moves to the free plan, nothing it saved is removed.
        Only the paid features stop. The{" "}
        <Link href="/terms">terms of service</Link>
        {inApp ? (
          " have the detail."
        ) : (
          <>
            {" "}
            and the <Link href="/pricing">pricing page</Link> have the detail.
          </>
        )}
      </Typography>

      <Typography color="text.secondary" variant="body2">
        Last updated {LEGAL_UPDATED}.
      </Typography>
    </>
  );
}
