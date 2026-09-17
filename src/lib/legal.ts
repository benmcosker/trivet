/**
 * The facts a carrier needs stated, kept in one place.
 *
 * US carriers require an A2P 10DLC campaign registration before they will
 * carry application-sent texts, and registration is reviewed by a person who
 * compares three things: the consent box a user actually ticks, the public
 * page describing the opt-in, and the privacy policy. If the wording differs
 * between them the campaign is rejected, so all three read from here rather
 * than restating it and drifting apart.
 *
 * A plain module with no directive, so the server-rendered legal pages and the
 * client-side opt-in forms can both import it - the same reasoning as
 * `theme/page.ts`.
 */

/**
 * What the app calls itself on screen.
 *
 * Split from `BRAND` below, which is a different fact about the world. This
 * one is a display string with no promise attached to it: nothing outside the
 * app reads it, so it follows the rename freely.
 */
export const APP_NAME = "Trivet";

/**
 * The name on the A2P 10DLC campaign registration. These have to match.
 *
 * **This is deliberately still the old name.** The app was renamed to Trivet;
 * this was not, and changing it here is not a tidy-up - it is a promise to a
 * carrier. The registered campaign says "McMullen Meal Magic", every message
 * body carries it, and vetting compares the two. Rename this before the
 * campaign is re-registered and messages stop being delivered: not bounced,
 * silently dropped, which is the failure mode that already cost a day once.
 *
 * Getting the campaign approved took two rejections, both for wording rather
 * than substance, and both are written up in the README. Re-registering under
 * a new brand name means going through that again.
 *
 * So the order is: register "Trivet" with the carrier, wait for approval, and
 * only then change this line - along with the two tests that pin it,
 * `test/sms-consent.test.ts` and `test/sms-message.test.ts`. Those tests
 * failing is the tripwire, and it is there on purpose.
 *
 * Everything reading this constant is something a carrier looks at: the
 * message bodies, and the three legal pages vetting compares them against.
 * The site chrome reads `APP_NAME` instead - so if you are here because a
 * heading somewhere still says the old name, that heading is on a legal page
 * and it is supposed to.
 */
export const BRAND = "McMullen Meal Magic";

/** Where HELP and privacy questions go. Must be an address somebody reads. */
export const CONTACT_EMAIL = "benmcosker@gmail.com";

/**
 * What people are told to expect, and what the app must then stay under.
 *
 * A week's list is one message in the ordinary case and two when the shop is
 * long - `splitMessage` breaks at 1200 characters - and it is sent once a
 * week. "Up to 2 messages a week" is the true ceiling rather than a
 * comfortable-sounding number, which matters: the frequency claim is one of
 * the things a carrier will hold you to.
 */
export const SMS_FREQUENCY = "up to 2 messages a week";

/** What the messages actually are. Vagueness here reads as a marketing list. */
export const SMS_PURPOSE =
  "your household's weekly grocery shopping list, sent when someone in your household asks for it";

/**
 * The sentence beside the checkbox.
 *
 * Written as something a person can act on rather than a legal formula, but it
 * carries the two things that must be there: who is texting, and how often.
 */
export const SMS_CONSENT_LABEL =
  `Yes, text me my household's weekly shopping list from ${BRAND}. ` +
  `I understand I will receive ${SMS_FREQUENCY}.`;

/** Message-and-data-rates. Required, and required to be in these words. */
export const SMS_RATES =
  "Message and data rates may apply, depending on your mobile plan.";

/** How to get help and how to stop. Twilio answers both automatically. */
export const SMS_HELP_STOP =
  "Reply HELP for help or STOP to cancel at any time. " +
  `You can also clear your number on the Household page, or email ${CONTACT_EMAIL}.`;

/**
 * The non-sharing promise, in the words the vetting reviewer looks for.
 *
 * Deliberately close to verbatim from Twilio's own example of language that
 * passes review (error 30908). An earlier wording said the same thing in
 * better English - "are never shared with third parties or affiliates" - and
 * the campaign was rejected. Vetting is largely pattern-matching, so matching
 * the pattern is worth more here than the prose is.
 *
 * "share, sell, or provide" rather than just "share": the three verbs are what
 * the reviewer scans for, and dropping two of them leaves a gap they read as
 * an omission.
 */
export const SMS_NO_SHARING =
  "We do not share, sell, or provide your mobile phone number or messaging " +
  "consent data to third parties or affiliates for marketing or promotional " +
  "purposes.";

/**
 * How Twilio is described, wherever it is mentioned.
 *
 * The policy has to name it - the number really does leave this app - but a
 * bare "the number is passed to Twilio" is read by a reviewer scanning for
 * disclosure of sharing as exactly that, which contradicts the sentence above
 * and gets the campaign refused for conflicting information. Naming the
 * relationship, rather than only the company, is what resolves it.
 */
export const SMS_PROVIDER =
  "Text messages are delivered through Twilio, our messaging service " +
  "provider, acting only to transmit messages on our behalf. Twilio is not a " +
  "marketing partner, receives no information for its own marketing use, and " +
  "no other third party receives your mobile number.";

/** Shown at the foot of each policy so a reviewer can see it is current. */
export const LEGAL_UPDATED = "30 August 2026";
