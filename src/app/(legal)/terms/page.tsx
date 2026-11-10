import Typography from "@mui/material/Typography";
import type { Metadata } from "next";

import {
  BRAND,
  CONTACT_EMAIL,
  LEGAL_UPDATED,
  SMS_FREQUENCY,
  SMS_HELP_STOP,
  SMS_PURPOSE,
  SMS_RATES,
} from "@/lib/legal";

export const metadata: Metadata = {
  title: `Terms of Service — ${BRAND}`,
  description: `Terms for using ${BRAND}, including its text messages.`,
};

/**
 * Terms, kept to what is true of a private family app.
 *
 * The messaging section is the part a carrier reads, and it repeats the
 * frequency, the rates line and the stop instructions from `lib/legal.ts` -
 * the same strings the checkbox and the privacy policy use.
 */
export default function TermsPage() {
  return (
    <>
      <Typography variant="h1" sx={{ mb: 1 }}>
        Terms of Service
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {BRAND} is a private, invite-only application for planning a
        household&apos;s meals and shopping. Accounts are created by invitation
        only and it is not open to the public.
      </Typography>

      <Typography variant="h2" sx={{ mb: 1 }}>
        Using the app
      </Typography>
      <Typography sx={{ mb: 3 }}>
        Members keep their sign-in details to themselves and enter only their
        own phone number - never another person&apos;s. Recipes and plans are
        shared with the other members of the same household.
      </Typography>

      <Typography variant="h2" sx={{ mb: 1 }}>
        Shared recipes and reviews
      </Typography>
      <Typography sx={{ mb: 1 }}>
        A household can share its recipes with every other household, and
        members can review the recipes they can see. Shared recipes and reviews
        must be about cooking, and must not be offensive, abusive, hateful,
        sexual, or copied from someone who has not given permission. There is no
        tolerance for objectionable content or abusive members.
      </Typography>
      <Typography sx={{ mb: 3 }}>
        Anyone can report a shared recipe or a review from its page, or hide the
        household it came from. Reports are read within a day. Content that
        breaks these rules is removed, and the accounts of those who post it are
        closed.
      </Typography>

      <Typography variant="h2" sx={{ mb: 1 }}>
        Text messages
      </Typography>
      <Typography sx={{ mb: 1 }}>
        Members who give a mobile number and tick the agreement receive{" "}
        {SMS_PURPOSE}. Messages arrive {SMS_FREQUENCY}.
      </Typography>
      <Typography sx={{ mb: 1 }}>{SMS_RATES}</Typography>
      <Typography sx={{ mb: 1 }}>{SMS_HELP_STOP}</Typography>
      <Typography sx={{ mb: 3 }}>
        Carriers are not liable for delayed or undelivered messages.
      </Typography>

      <Typography variant="h2" sx={{ mb: 1 }}>
        No warranty
      </Typography>
      <Typography sx={{ mb: 3 }}>
        The app is provided as it is, without warranty. A shopping list it
        produces is a convenience and not a guarantee: check it before you shop.
      </Typography>

      <Typography variant="h2" sx={{ mb: 1 }}>
        Contact
      </Typography>
      <Typography sx={{ mb: 3 }}>
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </Typography>

      <Typography variant="body2" color="text.secondary">
        Last updated {LEGAL_UPDATED}.
      </Typography>
    </>
  );
}
