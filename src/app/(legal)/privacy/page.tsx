import Typography from "@mui/material/Typography";
import type { Metadata } from "next";

import {
  BRAND,
  CONTACT_EMAIL,
  LEGAL_UPDATED,
  SMS_FREQUENCY,
  SMS_NO_SHARING,
  SMS_PROVIDER,
  SMS_RATES,
} from "@/lib/legal";

export const metadata: Metadata = {
  title: `Privacy Policy — ${BRAND}`,
  description: `What ${BRAND} stores, and what it never shares.`,
};

/**
 * The privacy policy a carrier reads before approving the campaign.
 *
 * Structured for how it is actually reviewed rather than how a policy is
 * usually written. The text-messaging section comes first and says the
 * required things in the required words: numbers are not shared, how often
 * messages arrive, and that message and data rates may apply. An earlier
 * version buried those under "what is collected" and described Twilio without
 * saying what Twilio is to us, and the campaign was rejected for a policy that
 * "could not be verified as compliant" (error 30908).
 *
 * The strings come from `lib/legal.ts`, so this cannot drift from the checkbox
 * a member actually ticks.
 */
export default function PrivacyPage() {
  return (
    <>
      <Typography variant="h1" sx={{ mb: 1 }}>
        Privacy Policy
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {BRAND} is a private, invite-only application used by one household to
        plan meals and shop for them. It is not a public service, it sells
        nothing, and it has no advertisers. This is the only privacy policy that
        applies to {BRAND}.
      </Typography>

      <Typography variant="h2" sx={{ mb: 1 }}>
        Text messages and your mobile number
      </Typography>
      <Typography sx={{ mb: 1 }}>
        <strong>{SMS_NO_SHARING}</strong>
      </Typography>
      <Typography sx={{ mb: 1 }}>
        Members may optionally give a mobile number and tick a box agreeing to
        receive text messages. We store the number, the date consent was given,
        and how it was given. That information is used for one purpose only:
        sending that member their own household&apos;s weekly grocery shopping
        list, when a member of that household asks for it to be sent. It is
        never used to market anything.
      </Typography>
      <Typography sx={{ mb: 1 }}>
        Message frequency: {SMS_FREQUENCY}. {SMS_RATES}
      </Typography>
      <Typography sx={{ mb: 1 }}>{SMS_PROVIDER}</Typography>
      <Typography sx={{ mb: 3 }}>
        Members can stop the messages at any time by unticking the agreement or
        clearing their number on the Household page, or by replying STOP to any
        message. Reply HELP for help, or email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </Typography>

      <Typography variant="h2" sx={{ mb: 1 }}>
        What else is collected
      </Typography>
      <Typography sx={{ mb: 1 }}>
        A member&apos;s name and email address, needed to sign in, and the
        recipes, weekly plans, pantry contents and notes they enter. If a member
        invites somebody by email, that address is kept with the invitation and
        used only to send it and to check that the person signs up with the
        address it was sent to.
      </Typography>
      <Typography sx={{ mb: 1 }}>
        A card, page or file a recipe is read from is kept only while you check
        what was read from it. Once the recipe is saved, the file is deleted;
        only a fingerprint of it stays, so the same file is recognised if it is
        uploaded again.
      </Typography>
      <Typography sx={{ mb: 3 }}>
        No location, no contacts, no browsing history, and no advertising
        identifiers are collected, and members are not tracked across other
        sites.
      </Typography>

      {/* The consent on the Add a recipe page links here (`ai-consent.ts`). */}
      <Typography id="ai" variant="h2" sx={{ mb: 1 }}>
        Reading recipes with AI
      </Typography>
      <Typography sx={{ mb: 1 }}>
        Recipes you add from a photo, a PDF, a web page or pasted text are read
        by Claude, an AI model made by Anthropic. What you add is sent to
        Anthropic, which reads it and sends back the recipe for you to check
        before anything is saved. Your name and email address are not sent with
        it, and nothing else in your account is: not your plans, your shopping
        list or your household.
      </Typography>
      <Typography sx={{ mb: 1 }}>
        Anthropic acts on our behalf under its commercial terms. It does not use
        what it reads to train its models, and keeps it only for the limited
        time those terms allow, for example to check for misuse.
      </Typography>
      <Typography sx={{ mb: 3 }}>
        Nothing is sent until you agree, the first time you add a recipe this
        way. You can take that agreement back on the Household page, and recipes
        can always be typed in by hand without it.
      </Typography>

      <Typography variant="h2" sx={{ mb: 1 }}>
        Who else sees anything
      </Typography>
      <Typography sx={{ mb: 3 }}>
        Recipes and plans are visible to the members of the same household.
        Beyond that, information is held only by the service providers that run
        the application - its hosting, its database, the messaging provider
        named above, and Anthropic for reading recipes you add - each acting on
        our behalf. Nothing is sold, rented, or given to anyone for marketing or
        promotional purposes.
      </Typography>

      <Typography variant="h2" sx={{ mb: 1 }}>
        Keeping and deleting
      </Typography>
      <Typography sx={{ mb: 3 }}>
        Information is kept while the account exists. An account can be deleted
        at any time from the Household page, under Delete my account. If others
        share the household, they keep its recipes, plans and lists; the last
        person to leave takes the household and everything in it with them,
        including any recipes it shared. You can also email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> to have it done
        for you.
      </Typography>

      <Typography variant="h2" sx={{ mb: 1 }}>
        Contact
      </Typography>
      <Typography sx={{ mb: 3 }}>
        Questions about this policy:{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </Typography>

      <Typography variant="body2" color="text.secondary">
        Last updated {LEGAL_UPDATED}.
      </Typography>
    </>
  );
}
