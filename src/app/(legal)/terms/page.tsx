import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import type { Metadata } from "next";

import { COPYRIGHT_AGENT } from "@/lib/copyright-agent";

import {
  APP_NAME,
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
        The shared library and reviews
      </Typography>
      <Typography sx={{ mb: 1 }}>
        Every household sees Trivet&apos;s shared library, a set of base recipes
        written for Trivet, alongside its own. Members can review the recipes
        they can see. Reviews must be about cooking, and must not be offensive,
        abusive, hateful, sexual, or copied from someone who has not given
        permission. There is no tolerance for objectionable content or abusive
        members.
      </Typography>
      <Typography sx={{ mb: 1 }}>
        The recipes your household adds, with their photos, are private to your
        household unless you share one. The card or file a recipe is read from
        is deleted once the recipe is saved.
      </Typography>
      <Typography sx={{ mb: 3 }}>
        Anyone can report a shared recipe or a review from its page, or hide the
        household it came from. Reports are read within a day. Content that
        breaks these rules is removed, and the accounts of those who post it are
        closed.
      </Typography>

      <Typography variant="h2" sx={{ mb: 1 }}>
        Copyright
      </Typography>
      <Typography sx={{ mb: 1 }}>
        If you believe something on {APP_NAME} infringes your copyright, send a
        notice to {APP_NAME}&apos;s designated agent:
      </Typography>
      <Typography component="address" sx={{ mb: 2, fontStyle: "normal" }}>
        {COPYRIGHT_AGENT.name}
        <br />
        {COPYRIGHT_AGENT.street}
        <br />
        {COPYRIGHT_AGENT.cityLine}
        <br />
        {COPYRIGHT_AGENT.phone}
        <br />
        <a href={`mailto:${COPYRIGHT_AGENT.email}`}>{COPYRIGHT_AGENT.email}</a>
      </Typography>
      <Typography sx={{ mb: 1 }}>
        A notice must include (17 U.S.C. &sect; 512(c)(3)):
      </Typography>
      <Box component="ul" sx={{ mt: 0, mb: 2, pl: 3 }}>
        <Typography component="li">
          your physical or electronic signature, or that of someone authorised
          to act for the copyright owner;
        </Typography>
        <Typography component="li">
          the copyrighted work you believe is infringed;
        </Typography>
        <Typography component="li">
          the material on {APP_NAME} you believe infringes it, with enough to
          find it, such as the recipe&apos;s link;
        </Typography>
        <Typography component="li">
          your name, address, phone number and email address;
        </Typography>
        <Typography component="li">
          a statement that you believe in good faith the use is not authorised
          by the copyright owner, its agent or the law;
        </Typography>
        <Typography component="li">
          a statement that the notice is accurate and, under penalty of perjury,
          that you are the owner or authorised to act for the owner.
        </Typography>
      </Box>
      <Typography sx={{ mb: 1 }}>
        If something you added was removed and you believe that was a mistake,
        you can send a counter-notice to the same agent. It must include your
        signature; the material removed and where it appeared; a statement,
        under penalty of perjury, that you believe in good faith it was removed
        by mistake or misidentification; and your name, address and phone
        number, with a statement that you consent to the jurisdiction of the
        federal district court for your address (or, outside the United States,
        any district where {APP_NAME} may be found) and will accept service from
        the person who sent the notice. Unless that person tells us they have
        filed a court action, the material may be restored 10 to 14 business
        days after the counter-notice arrives.
      </Typography>
      <Typography sx={{ mb: 3 }}>
        The accounts of members who repeatedly infringe copyright are closed.
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
        If {BRAND} changes or closes
      </Typography>
      <Typography sx={{ mb: 1 }}>
        Features may change over time. A change to these terms is posted here
        with a new date; one that takes something away from you is also emailed
        to you before it takes effect.
      </Typography>
      <Typography sx={{ mb: 1 }}>
        The iPhone app can leave Apple&apos;s App Store, whether Apple removes
        it or we do. An app already installed may keep working for a time but
        will stop being updated. {BRAND} itself stays available in a web browser
        at trivetbox.com for as long as the service runs, with the same account
        and everything in it.
      </Typography>
      <Typography sx={{ mb: 1 }}>
        If {BRAND} closes, every member will be told by email at least 30 days
        before, and in the app. Until it closes you will be able to download
        your household&apos;s recipes. After it closes, accounts and everything
        in them are deleted, as the privacy policy describes.
      </Typography>
      <Typography sx={{ mb: 3 }}>
        If you pay for {BRAND}, a subscription stops renewing when the service
        closes or the feature you pay for is withdrawn. A purchase made through
        Apple is refunded by Apple, under Apple&apos;s rules; one paid to us
        directly is refunded for the unused part of the period you paid for. A
        lifetime purchase lasts for the life of the service, not the life of the
        buyer.
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
