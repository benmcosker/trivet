import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import type { Metadata } from "next";
import Link from "next/link";

import { COPYRIGHT_AGENT } from "@/lib/copyright-agent";
import { inTrivetApp } from "@/lib/in-app";

import {
  APP_NAME,
  CONTACT_EMAIL,
  LEGAL_UPDATED,
  SMS_FREQUENCY,
  SMS_HELP_STOP,
  SMS_PURPOSE,
  SMS_RATES,
} from "@/lib/legal";
import {
  PRICE_MONTHLY_USD,
  PRICE_YEARLY_USD,
  REFUND_DAYS,
  TRIAL_DAYS,
} from "@/lib/pricing";

export const metadata: Metadata = {
  title: `Terms of Service — ${APP_NAME}`,
  description: `Terms for using ${APP_NAME}, including its text messages.`,
};

/**
 * The terms of service, written for a public app.
 *
 * The messaging section is the part a carrier reads, and it repeats the
 * frequency, the rates line and the stop instructions from `lib/legal.ts` -
 * the same strings the checkbox and the privacy policy use. Don't reword
 * those here. The texts themselves still carry `BRAND`, the app's old name;
 * this page doesn't (see `legal.ts`).
 *
 * The rest says what a person may do, what they keep, what we promise and
 * what we cannot: that the recipe reading is a machine's and can be wrong,
 * and that nothing here is food-safety or allergy advice.
 */
export default async function TermsPage() {
  // Inside the iPhone app the site shows no price (see lib/in-app.ts).
  const inApp = await inTrivetApp();

  return (
    <>
      <Typography variant="h1" sx={{ mb: 1 }}>
        Terms of Service
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {APP_NAME} is a recipe library, weekly meal planner and shopping list
        for households, on the web at trivetbox.com and as an iPhone app. It is
        run by {COPYRIGHT_AGENT.name} (&ldquo;we&rdquo;). By using {APP_NAME}{" "}
        you agree to these terms and to the{" "}
        <Link href="/privacy">privacy policy</Link>.
      </Typography>

      <Typography variant="h2" sx={{ mb: 1 }}>
        Your account
      </Typography>
      <Typography sx={{ mb: 1 }}>
        While {APP_NAME} is in early access, accounts are created by invitation:
        somebody already using {APP_NAME} invites you, either into their
        household or to start your own. Sign-up opens to everyone when the paid
        plan launches. You must be 13 or older.
      </Typography>
      <Typography sx={{ mb: 3 }}>
        Keep your sign-in details to yourself, and enter only your own phone
        number - never another person&apos;s. Recipes, plans and lists are
        shared with the other members of your household, and anyone in it can
        change them.
      </Typography>

      <Typography variant="h2" sx={{ mb: 1 }}>
        What you add
      </Typography>
      <Typography sx={{ mb: 1 }}>
        What you add stays yours. You let us store it, show it to the people you
        share it with, and process it to run {APP_NAME} for you - including
        sending a recipe you import to Anthropic to be read, once you have
        agreed to that. This permission ends when you delete it or your account,
        apart from copies other households already hold of recipes you shared
        with them.
      </Typography>
      <Typography sx={{ mb: 3 }}>
        Add only what you have the right to use. Keeping a copy of a recipe from
        a cookbook, a card or a website for your own household&apos;s cooking is
        what {APP_NAME} is for; sharing it with other households is your
        decision and your responsibility, so share only what you wrote or have
        permission to share.
      </Typography>

      <Typography variant="h2" sx={{ mb: 1 }}>
        Check what is read, and what you cook
      </Typography>
      <Typography sx={{ mb: 1 }}>
        Recipes imported from a photo, a PDF, a web page or text are read by AI,
        and it makes mistakes: an amount, a temperature, a time or an ingredient
        can come out wrong. Nutrition figures {APP_NAME} works out itself are
        estimates. Check a recipe before you save it, and again before you cook
        it.
      </Typography>
      <Typography sx={{ mb: 3 }}>
        Nothing in {APP_NAME} is medical, dietary, allergy or food-safety
        advice. If you or someone you cook for has an allergy or a dietary need,
        check every ingredient yourself.
      </Typography>

      <Typography variant="h2" sx={{ mb: 1 }}>
        Fair use
      </Typography>
      <Typography sx={{ mb: 3 }}>
        Don&apos;t use {APP_NAME} to break the law or anyone&apos;s rights, to
        harass anyone, or to send spam. Don&apos;t try to reach another
        household&apos;s information, get around a limit (such as the daily
        number of recipes that can be read), overload the service, or copy it
        wholesale with automated tools. An AI assistant you connect acts for
        you, so these rules apply to what it does too.
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
        Paying for {APP_NAME}
      </Typography>
      <Typography sx={{ mb: 1 }}>
        The recipe library, the meal planner, the shopping list and connecting
        an AI assistant are free. A paid plan, charged per household, adds
        recipe imports beyond the free allowance, shopping lists by text
        message, and sharing with other households.
        {inApp
          ? ""
          : ` It costs US$${PRICE_MONTHLY_USD} a month or US$${PRICE_YEARLY_USD} a year.`}
      </Typography>
      <Typography sx={{ mb: 1 }}>
        A household that is new to {APP_NAME} gets the paid features free for{" "}
        {TRIAL_DAYS} days, with a limit on how many recipes it can import in
        that time. When the free period ends the household moves to the free
        plan unless somebody in it subscribes. Each household has one free
        month.
      </Typography>
      <Typography sx={{ mb: 1 }}>
        A subscription renews each month or year until it is cancelled. You
        cancel in the place you subscribed: for an iPhone purchase, in your
        Apple account settings, and for a web purchase through the link in your
        receipt from our payment provider. Cancelling stops the next renewal;
        the plan runs to the end of the period already paid for.
      </Typography>
      <Typography sx={{ mb: 1 }}>
        A web purchase is handled by our payment provider, which takes the
        payment and handles tax. You can have a web payment refunded within{" "}
        {REFUND_DAYS} days of it being taken, by writing to {CONTACT_EMAIL}. A
        purchase made through Apple is refunded by Apple, under Apple&apos;s
        rules.
      </Typography>
      <Typography sx={{ mb: 1 }}>
        If a household drops to the free plan, whether it cancelled or its free
        month ended, nothing it has saved is removed: its recipes, plans, lists
        and photos stay and keep working. What stops is the paid features
        themselves, meaning new imports past the free allowance, text messages,
        and sharing with other households. Sharing already set up pauses and
        starts again if the household subscribes.
      </Typography>
      <Typography sx={{ mb: 3 }}>
        We may change a price. A change applies from your next renewal, and we
        tell you before it does. It never changes what you have already paid
        for.
      </Typography>

      <Typography variant="h2" sx={{ mb: 1 }}>
        If {APP_NAME} changes or closes
      </Typography>
      <Typography sx={{ mb: 1 }}>
        Features may change over time. A change to these terms is posted here
        with a new date; one that takes something away from you is also emailed
        to you before it takes effect.
      </Typography>
      <Typography sx={{ mb: 1 }}>
        The iPhone app can leave Apple&apos;s App Store, whether Apple removes
        it or we do. An app already installed may keep working for a time but
        will stop being updated. {APP_NAME} itself stays available in a web
        browser at trivetbox.com for as long as the service runs, with the same
        account and everything in it.
      </Typography>
      <Typography sx={{ mb: 1 }}>
        If {APP_NAME} closes, every member will be told by email at least 30
        days before, and in the app. Until it closes you will be able to
        download your household&apos;s recipes. After it closes, accounts and
        everything in them are deleted, as the privacy policy describes.
      </Typography>
      <Typography sx={{ mb: 3 }}>
        If you pay for {APP_NAME}, a subscription stops renewing when the
        service closes or the feature you pay for is withdrawn. Money is
        refunded as described above; if {APP_NAME} closes, the part of a period
        you paid for and did not use is refunded too.
      </Typography>
      <Typography variant="h2" sx={{ mb: 1 }}>
        Ending your account
      </Typography>
      <Typography sx={{ mb: 3 }}>
        You can delete your account at any time from the Household page. We may
        suspend or close an account that breaks these terms, and will tell you
        why unless the law or someone&apos;s safety prevents it.
      </Typography>

      <Typography variant="h2" sx={{ mb: 1 }}>
        No warranty, and limits on liability
      </Typography>
      <Typography sx={{ mb: 1 }}>
        {APP_NAME} is provided as it is and as available, without warranties of
        any kind, as far as the law allows. A shopping list it produces is a
        convenience and not a guarantee: check it before you shop.
      </Typography>
      <Typography sx={{ mb: 3 }}>
        As far as the law allows, we are not liable for indirect or
        consequential losses, or for lost data, and our total liability to you
        for anything to do with {APP_NAME} is limited to the greater of what you
        paid us in the 12 months before the claim and US$50. Some places do not
        allow these limits, and where they do not, they do not apply to you.
      </Typography>

      <Typography variant="h2" sx={{ mb: 1 }}>
        The iPhone app
      </Typography>
      <Typography sx={{ mb: 3 }}>
        These terms are between you and us, not Apple. Apple is not responsible
        for the app or its content, has no duty to support it, and is not
        responsible for any claim about it. Apple&apos;s own Licensed
        Application End User License Agreement also applies to the app, and
        Apple may enforce these terms as they relate to it.
      </Typography>

      <Typography variant="h2" sx={{ mb: 1 }}>
        The law that applies
      </Typography>
      <Typography sx={{ mb: 3 }}>
        These terms are governed by the laws of Rhode Island, USA, without
        affecting any protection the law where you live gives you.
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
