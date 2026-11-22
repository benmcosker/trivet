import Typography from "@mui/material/Typography";
import type { Metadata } from "next";
import Link from "next/link";

import { APP_NAME } from "@/lib/legal";
import {
  PRICE_MONTHLY_USD,
  PRICE_YEARLY_USD,
  REFUND_DAYS,
  TRIAL_DAYS,
} from "@/lib/pricing";

export const metadata: Metadata = {
  title: `Pricing — ${APP_NAME}`,
  description: `What ${APP_NAME} costs: free to use, with a paid household plan.`,
};

/**
 * What is free and what is paid, in words anyone can check.
 *
 * Public on purpose, like the policy pages beside it: a payment processor
 * reviews the site before it will sell for it, and the price, the refund terms
 * and the policies all have to be findable without an account. The numbers come
 * from `lib/pricing.ts`, so this page and the terms cannot disagree.
 *
 * The paid plan is not on sale yet, and the page says so rather than leaving a
 * price with nothing to buy.
 */
export default function PricingPage() {
  return (
    <>
      <Typography variant="h1" sx={{ mb: 1 }}>
        Pricing
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {APP_NAME} is free to use. A paid plan, charged per household, adds the
        features that cost money to run.
      </Typography>

      <Typography variant="h2" sx={{ mb: 1 }}>
        Free
      </Typography>
      <Typography sx={{ mb: 3 }}>
        Your recipe library, the weekly meal planner, the shopping list, and
        connecting your own AI assistant. These stay free.
      </Typography>

      <Typography variant="h2" sx={{ mb: 1 }}>
        The household plan
      </Typography>
      <Typography sx={{ mb: 1 }}>
        US${PRICE_MONTHLY_USD} a month, or US${PRICE_YEARLY_USD} a year, for the
        whole household. It adds:
      </Typography>
      <Typography component="div" sx={{ mb: 1 }}>
        <ul>
          <li>recipe imports beyond the free monthly allowance,</li>
          <li>shopping lists sent to you by text message,</li>
          <li>sharing recipes with other households.</li>
        </ul>
      </Typography>
      <Typography sx={{ mb: 3 }}>
        Imports are the cost that grows: each one is read by an AI model. That
        is why they, and texts, are what the plan pays for.
      </Typography>

      <Typography variant="h2" sx={{ mb: 1 }}>
        A free month
      </Typography>
      <Typography sx={{ mb: 3 }}>
        A new household gets the paid features free for {TRIAL_DAYS} days, with
        a limit on how many recipes it can import in that time. After that it
        moves to the free plan unless someone in the household subscribes.
        Nothing you saved is removed when a household moves to the free plan;
        only the paid features stop.
      </Typography>

      <Typography variant="h2" sx={{ mb: 1 }}>
        Cancelling and refunds
      </Typography>
      <Typography sx={{ mb: 1 }}>
        You can cancel at any time; the plan runs to the end of the period you
        paid for. A web purchase can be refunded within {REFUND_DAYS} days of a
        payment. A purchase made through Apple is refunded by Apple, under
        Apple&apos;s rules. The <Link href="/refunds">refund policy</Link>, the{" "}
        <Link href="/terms">terms of service</Link> and the{" "}
        <Link href="/privacy">privacy policy</Link> have the detail.
      </Typography>
      <Typography sx={{ mb: 3 }}>
        The paid plan is not on sale yet. Until it is, every feature is
        available to every household. {APP_NAME} is invite-only during early
        access, and sign-up opens to everyone when the paid plan launches.
      </Typography>
    </>
  );
}
