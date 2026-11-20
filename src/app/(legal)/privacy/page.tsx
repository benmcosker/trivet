import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { COPYRIGHT_AGENT } from "@/lib/copyright-agent";
import {
  APP_NAME,
  CONTACT_EMAIL,
  LEGAL_UPDATED,
  SMS_FREQUENCY,
  SMS_NO_SHARING,
  SMS_PROVIDER,
  SMS_RATES,
} from "@/lib/legal";

export const metadata: Metadata = {
  title: `Privacy Policy — ${APP_NAME}`,
  description: `What ${APP_NAME} stores, who it goes to, and what it never shares.`,
};

/**
 * The privacy policy: the one App Store review links to, and the one a
 * carrier reads before approving the text-message campaign.
 *
 * Structured for the carrier first, because that review is the stricter one.
 * The text-messaging section comes first and says the required things in the
 * required words: numbers are not shared, how often messages arrive, and that
 * message and data rates may apply. An earlier version buried those under
 * "what is collected" and described Twilio without saying what Twilio is to
 * us, and the campaign was rejected for a policy that "could not be verified
 * as compliant" (error 30908). Those strings come from `lib/legal.ts`, so this
 * cannot drift from the checkbox a member actually ticks; don't reword them
 * here.
 *
 * The campaign is registered as `BRAND`, the app's old name, and the texts
 * still carry it (see `legal.ts`). This page doesn't name it: the texts and
 * the opt-in box that promises them are the only places it survives.
 *
 * Everything after the texts is written for a public app: who runs it, every
 * service provider by name and what it receives, and what a person can do
 * about their data. Each claim is true of the code as it stands; a new
 * provider, a new kind of data or a new way for it to leave the app belongs
 * here in the same change.
 */
export default function PrivacyPage() {
  return (
    <>
      <Typography variant="h1" sx={{ mb: 1 }}>
        Privacy Policy
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {APP_NAME} is a recipe library, weekly meal planner and shopping list
        for households, on the web at trivetbox.com and as an iPhone app. It is
        run by {COPYRIGHT_AGENT.name} (&ldquo;we&rdquo;), in Providence, Rhode
        Island, USA. It has no advertising and does not sell anyone&apos;s
        information. This policy covers the website and the app.
      </Typography>

      <Heading>Text messages and your mobile number</Heading>
      <Para>
        <strong>{SMS_NO_SHARING}</strong>
      </Para>
      <Para>
        Members may optionally give a mobile number and tick a box agreeing to
        receive text messages. We store the number, the date consent was given,
        and how it was given. That information is used for one purpose only:
        sending that member their own household&apos;s weekly grocery shopping
        list, when a member of that household asks for it to be sent. It is
        never used to market anything.
      </Para>
      <Para>
        Message frequency: {SMS_FREQUENCY}. {SMS_RATES}
      </Para>
      <Para>{SMS_PROVIDER}</Para>
      <Para last>
        Members can stop the messages at any time by unticking the agreement or
        clearing their number on the Household page, or by replying STOP to any
        message. Reply HELP for help, or email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </Para>

      <Heading>What we collect</Heading>
      <List>
        <Item>
          <strong>Your account:</strong> your name, email address and password.
          The password is stored only in scrambled (hashed) form, which nobody
          can read back, us included.
        </Item>
        <Item>
          <strong>Your household:</strong> its name, its members, and the email
          address of anyone invited, kept with the invitation to send it and to
          check the person signs up with that address.
        </Item>
        <Item>
          <strong>What you add:</strong> recipes and their photos, weekly plans,
          pantry contents, shopping lists, notes, and reviews.
        </Item>
        <Item>
          <strong>Signing in:</strong> a cookie that keeps you signed in, and,
          with each signed-in session, the IP address and the kind of browser or
          device it came from, so a session can be recognised and misuse
          stopped.
        </Item>
        <Item>
          <strong>When something breaks:</strong> an error report with the page,
          the browser, what went wrong in the code, and your account&apos;s
          internal number. Not your name, email address, recipes or anything you
          typed.
        </Item>
      </List>
      <Para>
        A card, page or file a recipe is read from is kept only while you check
        what was read from it. Once the recipe is saved, the file is deleted;
        only a fingerprint of it stays, so the same file is recognised if it is
        uploaded again.
      </Para>
      <Para last>
        We do not collect your location, contacts, browsing history or
        advertising identifiers. There are no analytics or advertising trackers,
        and you are not tracked across other sites or apps. The only cookies are
        the ones that keep you signed in; your browser also keeps small
        conveniences, such as your place in a recipe while you cook.
      </Para>

      {/* The consent on the Add a recipe page links here (`ai-consent.ts`). */}
      <Heading id="ai">Reading recipes with AI</Heading>
      <Para>
        Recipes you add from a photo, a PDF, a web page or pasted text are read
        by Claude, an AI model made by Anthropic. What you add is sent to
        Anthropic, which reads it and sends back the recipe for you to check
        before anything is saved. Your name and email address are not sent with
        it, and nothing else in your account is: not your plans, your shopping
        list or your household.
      </Para>
      <Para>
        Anthropic acts on our behalf under its commercial terms. It does not use
        what it reads to train its models, and keeps it only for the limited
        time those terms allow, for example to check for misuse.
      </Para>
      <Para last>
        Nothing is sent until you agree, the first time you add a recipe this
        way. You can take that agreement back on the Household page, and recipes
        can always be typed in by hand without it.
      </Para>

      <Heading>How it is used</Heading>
      <Para last>
        To run {APP_NAME} for you and your household: to sign you in, show your
        recipes, plans and lists, read recipes you add, send the texts you ask
        for, and keep the service working and safe. Email goes to you only to
        reset a forgotten password, or to tell you about a change to these terms
        or to the service that affects you. Nothing is used for advertising, and
        nobody&apos;s information is sold, rented, or used to build a profile of
        them.
      </Para>

      <Heading>Who can see what</Heading>
      <List>
        <Item>
          <strong>Your household</strong> sees everything in it: its recipes,
          plans, pantry and lists.
        </Item>
        <Item>
          <strong>Other households</strong> see only what your household shares
          with them: a recipe shared with a household you name, and any review
          you write on a recipe they can see. Each shows your household&apos;s
          name. A photo that came from a website or a card is never shown to
          another household. Any household can hide yours, and you can hide
          theirs.
        </Item>
        <Item>
          <strong>An AI assistant you connect</strong> (such as Claude) can read
          your household&apos;s recipes, plan and lists, and change the plan
          only if you allow it. It acts for you, under its own maker&apos;s
          terms, and you can disconnect it on the Household page.
        </Item>
      </List>
      <Para last>
        We do not look at what you have added except to fix a problem you have
        reported, to deal with a report of abuse or copyright infringement, or
        when the law requires it.
      </Para>

      <Heading>The services we use</Heading>
      <Para>
        These companies run parts of {APP_NAME} for us. Each receives only what
        its job needs and may use it only to do that job for us.
      </Para>
      <List>
        <Item>
          <strong>Vercel</strong> hosts the website and stores photos.
        </Item>
        <Item>
          <strong>Neon</strong> hosts the database that holds accounts and
          everything you add.
        </Item>
        <Item>
          <strong>Anthropic</strong> reads recipes you add, as described above.
        </Item>
        <Item>
          <strong>Twilio</strong> delivers the shopping-list texts.
        </Item>
        <Item>
          <strong>Resend</strong> delivers password-reset emails.
        </Item>
        <Item>
          <strong>Sentry</strong> receives the error reports described above.
        </Item>
        <Item>
          <strong>ImprovMX</strong> forwards email sent to trivetbox.com
          addresses to us.
        </Item>
      </List>
      <Para last>
        These providers may store and process information in the United States
        or in other countries. We may also disclose information when the law
        requires it, or to protect someone&apos;s safety; and if {APP_NAME} were
        ever taken over by someone else, it would pass to them under this
        policy, and you would be told first.
      </Para>

      <Heading>Keeping and deleting</Heading>
      <Para>
        Information is kept while the account exists. An account can be deleted
        at any time from the Household page, under Delete my account. If others
        share the household, they keep its recipes, plans and lists; the last
        person to leave takes the household and everything in it with them,
        including any recipes it shared. You can also email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> to have it done
        for you.
      </Para>
      <Para last>
        Deleted information can remain in the database provider&apos;s backups
        for up to 30 days before it is gone for good. Error reports, which hold
        none of what you added, are kept by Sentry for up to 90 days. If{" "}
        {APP_NAME} closes, every account is deleted, as the terms of service
        describe.
      </Para>

      <Heading>Your choices</Heading>
      <List>
        <Item>
          Change your phone number and your household&apos;s name on the
          Household page, and edit or delete anything you have added. To change
          your own name or email address, email us.
        </Item>
        <Item>
          Stop text messages, stop recipes being sent to Anthropic, disconnect
          an assistant, or delete your account, all from the Household page.
        </Item>
        <Item>
          Ask for a copy of your information, or ask us to correct or delete it,
          by emailing <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          We answer within 30 days.
        </Item>
      </List>
      <Para last>
        These are yours wherever you live, whatever your local law says. We do
        not sell or share personal information as California law defines those
        words, and do not use it for targeted advertising.
      </Para>

      <Heading>Children</Heading>
      <Para last>
        {APP_NAME} is not meant for children under 13, and we do not knowingly
        collect information from them. If you believe a child under 13 has an
        account, email us and it will be deleted.
      </Para>

      <Heading>Keeping it safe</Heading>
      <Para last>
        Everything travels over encrypted connections, passwords are hashed, and
        each household&apos;s information is kept apart from every other
        household&apos;s in the code that reads it. No system is perfectly
        secure; if your information is ever exposed, we will tell you.
      </Para>

      <Heading>Changes to this policy</Heading>
      <Para last>
        A change is posted here with a new date. A change that collects more, or
        shares more, is also emailed to you before it takes effect.
      </Para>

      <Heading>Contact</Heading>
      <Para last>
        Questions about this policy, or about your information:{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </Para>

      <Typography variant="body2" color="text.secondary">
        Last updated {LEGAL_UPDATED}.
      </Typography>
    </>
  );
}

function Heading({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <Typography id={id} variant="h2" sx={{ mb: 1 }}>
      {children}
    </Typography>
  );
}

/** A paragraph; the last in a section leaves the gap before the next. */
function Para({
  last = false,
  children,
}: {
  last?: boolean;
  children: ReactNode;
}) {
  return <Typography sx={{ mb: last ? 3 : 1 }}>{children}</Typography>;
}

function List({ children }: { children: ReactNode }) {
  return (
    <Box component="ul" sx={{ mt: 0, mb: 2, pl: 3 }}>
      {children}
    </Box>
  );
}

function Item({ children }: { children: ReactNode }) {
  return (
    <Typography component="li" sx={{ mb: 0.5 }}>
      {children}
    </Typography>
  );
}
