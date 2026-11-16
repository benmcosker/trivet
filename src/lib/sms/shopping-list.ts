import { prisma } from "../db";
import { formatAsPlainText } from "../shopping/format";
import { weekShoppingList } from "../week-list";
import { getSender, smsAvailable } from "./index";
import { TWILIO_UNSUBSCRIBED } from "./twilio";
import { shoppingListMessage, splitMessage } from "./message";
import type { SendOutcome, SmsRecipient } from "./types";
import { reportError } from "@/lib/report-error";

export type TextListResult =
  | {
      ok: true;
      /** How many messages each person received. */
      parts: number;
      delivered: string[];
      /** Named individually: a partial failure is not a failure. */
      failed: { name: string; error: string }[];
      /** Members who have replied STOP; their consent has just been cleared. */
      unsubscribed: string[];
      /** Members with no number on file, so the gap is visible. */
      withoutNumber: string[];
      /** Members who have a number but have not agreed to be texted. */
      withoutConsent: string[];
    }
  | { ok: false; error: string };

/**
 * Record that somebody has opted out, without touching their number.
 *
 * The same shape as unticking the box on the Household page: the number stays,
 * so re-agreeing later is a tick rather than typing it again, and clearing
 * `smsConsentSource` alongside the date keeps the two columns from disagreeing
 * about whether there is a consent at all.
 *
 * Failure here is logged rather than thrown. The message did not go out either
 * way, and losing the report of a partial send - which tells the household who
 * did get the list - would be a worse outcome than a consent row that stays
 * stale until the next attempt tries again.
 */
async function withdrawConsent(userId: string): Promise<void> {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { smsConsentAt: null, smsConsentSource: null },
    });
  } catch (error) {
    reportError("[sms] could not record a STOP reply", error);
  }
}

/**
 * Everyone in the household who may be texted, and everyone who may not.
 *
 * A number is not permission. Somebody can have one on file and still not have
 * agreed to receive texts - they never ticked the box, or they unticked it -
 * and sending to them anyway is both a broken promise and the thing US
 * carriers register campaigns to prevent.
 *
 * The two ways of being left out are reported apart because they need
 * different things from the person: one has to add a number, the other has to
 * agree. Telling somebody who has typed their number that they have no number
 * saved sends them to type it again.
 */
export async function shoppingListAudience(householdId: string): Promise<{
  recipients: SmsRecipient[];
  /** In the household, but there is nowhere to send it. */
  withoutNumber: string[];
  /** Reachable, but has not agreed to be. */
  withoutConsent: string[];
}> {
  const members = await prisma.user.findMany({
    where: { householdId },
    select: { id: true, name: true, phone: true, smsConsentAt: true },
    orderBy: { createdAt: "asc" },
  });

  return {
    recipients: members
      .filter(
        (
          m,
        ): m is {
          id: string;
          name: string;
          phone: string;
          smsConsentAt: Date;
        } => Boolean(m.phone) && m.smsConsentAt !== null,
      )
      .map((m) => ({ id: m.id, name: m.name, phone: m.phone })),
    withoutNumber: members.filter((m) => !m.phone).map((m) => m.name),
    withoutConsent: members
      .filter((m) => m.phone && m.smsConsentAt === null)
      .map((m) => m.name),
  };
}

/**
 * Text a week's shopping to everyone in the household who has a number.
 *
 * Everyone rather than just whoever pressed the button: the list is the
 * household's, and the person who plans the week is routinely not the person
 * who walks round the shop.
 *
 * The list is built here rather than taken from the client, for the same
 * reason every other write is: what gets sent should be what the week actually
 * says, not what a page believed it said some minutes ago.
 */
export async function textShoppingList(params: {
  householdId: string;
  weekStart: Date;
  weekLabel: string;
  /** Who pressed the button, for the record written at the end. */
  createdById: string;
}): Promise<TextListResult> {
  if (!smsAvailable()) {
    return { ok: false, error: "Texting is not set up for this deployment." };
  }

  const lines = await weekShoppingList(params.weekStart, params.householdId);
  if (lines.length === 0) {
    return {
      ok: false,
      error: "Nothing on the list this week, so there is nothing to send.",
    };
  }

  const { recipients, withoutNumber, withoutConsent } =
    await shoppingListAudience(params.householdId);
  if (recipients.length === 0) {
    return {
      ok: false,
      error: withoutConsent.length
        ? "Nobody has agreed to be texted yet. Tick the box on the Household page to turn it on."
        : "Nobody in the household has a phone number yet.",
    };
  }

  const parts = splitMessage(
    shoppingListMessage(params.weekLabel, formatAsPlainText(lines)),
  );
  const sender = getSender();

  // One person at a time, and their parts in order. Sending everything at once
  // would be faster and would also let a numbered list arrive shuffled, which
  // for a list split across three messages is worse than waiting.
  const outcomes: SendOutcome[] = [];
  for (const recipient of recipients) {
    let failure: { error: string; code?: number } | null = null;
    for (const part of parts) {
      const result = await sender.send(recipient.phone, part);
      if (!result.ok) {
        failure = {
          error: result.error,
          ...(result.code ? { code: result.code } : {}),
        };
        break;
      }
    }

    if (!failure) {
      outcomes.push({ ok: true, recipient, parts: parts.length });
      continue;
    }

    // Twilio answers STOP at its own edge and never tells the application, so
    // this rejection is the only notice the app ever gets that somebody has
    // opted out. Without acting on it the send fails again every week forever,
    // and - worse - the stored consent goes on claiming a permission that was
    // withdrawn, which is the one thing the record exists to be right about.
    const unsubscribed = failure.code === TWILIO_UNSUBSCRIBED;
    if (unsubscribed) {
      await withdrawConsent(recipient.id);
    }

    outcomes.push({
      ok: false,
      recipient,
      error: failure.error,
      ...(unsubscribed ? { unsubscribed: true } : {}),
    });
  }

  /*
   * The record that this happened, written whatever the outcome.
   *
   * Sending was initiated the moment the loop above ran, and that is the fact
   * worth keeping: a send where every message was refused is still a household
   * that tried to text its list, and is the more interesting of the two. What
   * cannot be recorded is delivery - Twilio's 201 means accepted, and a status
   * callback that would say more does not exist yet - so nothing here claims
   * it.
   *
   * Not awaited into the result: a household that got its shopping should not
   * be told the send failed because a bookkeeping row would not write.
   */
  const accepted = outcomes.filter((o) => o.ok).length;
  try {
    await prisma.shoppingText.create({
      data: {
        weekStart: params.weekStart,
        itemCount: lines.length,
        partCount: parts.length,
        acceptedFor: accepted,
        refusedFor: outcomes.length - accepted,
        householdId: params.householdId,
        createdById: params.createdById,
      },
    });
  } catch (error) {
    reportError("[sms] could not record that the list was texted", error);
  }

  const delivered = outcomes.filter((o) => o.ok).map((o) => o.recipient.name);
  const failures = outcomes.filter(
    (o): o is Extract<SendOutcome, { ok: false }> => !o.ok,
  );
  const failed = failures
    .filter((o) => !o.unsubscribed)
    .map((o) => ({ name: o.recipient.name, error: o.error }));
  // Named apart from the failures: nothing went wrong, somebody asked to stop.
  const unsubscribed = failures
    .filter((o) => o.unsubscribed)
    .map((o) => o.recipient.name);

  // Reported as a success with the failures named, rather than an outright
  // failure, when anybody got it: telling somebody the send failed when the
  // list is already on their partner's phone sends them to do it again.
  if (delivered.length === 0) {
    // A send where the only recipient had replied STOP is not a failure to
    // explain, it is an answer: reporting Twilio's "unsubscribed recipient" or
    // a flat "could not be sent" would send somebody looking for a fault in
    // the app. Their consent has just been cleared, so the planner will show
    // them as not agreed from here on.
    if (unsubscribed.length > 0 && failed.length === 0) {
      return {
        ok: false,
        error: `${formatList(unsubscribed)} replied STOP, so nobody is left to text. They can start again by ticking the box on the household page.`,
      };
    }

    return {
      ok: false,
      error: failed[0]?.error ?? "The message could not be sent.",
    };
  }

  return {
    ok: true,
    parts: parts.length,
    delivered,
    failed,
    unsubscribed,
    withoutNumber,
    withoutConsent,
  };
}

/** "Ben", "Ben and Laura", "Ben, Laura and Pat". */
function formatList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "nobody";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
