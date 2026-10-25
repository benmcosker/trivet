import { SmsConsentSource } from "@/generated/prisma/enums";

import { prisma } from "./db";
import { parsePhone } from "./phone";
import { MAX_SERVINGS } from "./scale";

/**
 * A household's name when nobody has chosen one.
 *
 * Derived from whoever it was created for, because "Household" on its own tells
 * a member nothing and there is no point asking someone to name their family
 * before they have seen the app. Renaming it later is one field on the
 * household page.
 */
export function defaultHouseholdName(memberName: string): string {
  const name = memberName.trim();
  if (!name) return "My Household";

  // "Ben" -> "Ben's Household"; "Chris" -> "Chris' Household".
  const suffix = name.endsWith("s") ? "'" : "'s";
  return `${name}${suffix} Household`;
}

export type HouseholdMember = {
  id: string;
  name: string;
  email: string;
  /** E.164, or null. Whether the week's shopping can reach them. */
  phone: string | null;
  /** Whether they have agreed to be texted. A number alone is not consent. */
  smsConsented: boolean;
  joinedAt: Date;
};

export type HouseholdDetail = {
  id: string;
  name: string;
  /** How many this household cooks for, or null when nobody has said. */
  defaultServings: number | null;
  members: HouseholdMember[];
};

export async function getHousehold(
  householdId: string,
): Promise<HouseholdDetail | null> {
  const household = await prisma.household.findUnique({
    where: { id: householdId },
    include: {
      members: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          smsConsentAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!household) return null;

  return {
    id: household.id,
    name: household.name,
    defaultServings: household.defaultServings,
    members: household.members.map((member) => ({
      id: member.id,
      name: member.name,
      email: member.email,
      phone: member.phone,
      smsConsented: member.smsConsentAt !== null,
      joinedAt: member.createdAt,
    })),
  };
}

export const MAX_HOUSEHOLD_NAME = 80;

/** Returns the trimmed name that was saved, or null if it was blank. */
export async function renameHousehold(
  householdId: string,
  name: string,
): Promise<string | null> {
  const trimmed = name.trim().slice(0, MAX_HOUSEHOLD_NAME);
  if (!trimmed) return null;

  await prisma.household.update({
    where: { id: householdId },
    data: { name: trimmed },
  });
  return trimmed;
}

/**
 * How many this household cooks for, or null when nobody has said.
 *
 * Its own small query rather than another column on the session lookup that
 * every page runs: this is wanted when a meal is planned, which is a handful
 * of times a week, and not when a page is rendered, which is constantly.
 */
export async function defaultServingsFor(
  householdId: string,
): Promise<number | null> {
  const household = await prisma.household.findUnique({
    where: { id: householdId },
    select: { defaultServings: true },
  });
  return household?.defaultServings ?? null;
}

/**
 * Say how many the household cooks for, or stop saying.
 *
 * Null is a real answer and not a failure: it puts the app back to planning
 * each dish for whatever it makes, which is what it did before the question
 * was asked.
 *
 * Bounded by the same cap as everything else, because a default of forty
 * would reach the planner as forty and be clamped there, one dish at a time,
 * leaving a number on the household page that nothing on any other page
 * agrees with.
 */
export async function setDefaultServings(
  householdId: string,
  servings: number | null,
): Promise<number | null> {
  const saved =
    servings == null || !Number.isFinite(servings)
      ? null
      : Math.min(Math.max(Math.trunc(servings), 1), MAX_SERVINGS);

  await prisma.household.update({
    where: { id: householdId },
    data: { defaultServings: saved },
  });
  return saved;
}

export type SavePhoneResult =
  | { ok: true; phone: string | null; consented: boolean }
  | { ok: false; error: string };

/**
 * Set or clear your own number, and say whether you agree to be texted.
 *
 * Only ever your own: a phone number is the one thing here that reaches a
 * person outside the app, and somebody else in the household typing it wrongly
 * sends the week's shopping to a stranger. Blank clears it, which is how
 * somebody stops receiving the texts without leaving the household.
 *
 * The number and the agreement are stored as two facts rather than one. A
 * number on file is not consent - it is only an address - and US carriers
 * require the agreement itself to be recorded and producible. Keeping them
 * apart also gives people the milder option: untick the box and the texts stop
 * while the number stays, instead of having to delete it and type it again
 * later.
 */
export async function saveOwnPhone(
  userId: string,
  input: string,
  consent: boolean,
): Promise<SavePhoneResult> {
  if (!input.trim()) {
    // Removing the number withdraws the agreement with it. Keeping a consent
    // record for a number the app no longer holds would be a claim about
    // somebody who has just told you to stop.
    await prisma.user.update({
      where: { id: userId },
      data: { phone: null, smsConsentAt: null, smsConsentSource: null },
    });
    return { ok: true, phone: null, consented: false };
  }

  const parsed = parsePhone(input);
  if (!parsed.ok) return { ok: false, error: parsed.reason };

  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { smsConsentAt: true },
  });

  // An unchanged tick keeps its original date: the fact worth recording is
  // when this person first agreed, not the last time they pressed Save.
  const consentData = consent
    ? existing?.smsConsentAt
      ? {}
      : {
          smsConsentAt: new Date(),
          smsConsentSource: SmsConsentSource.CHECKBOX,
        }
    : { smsConsentAt: null, smsConsentSource: null };

  await prisma.user.update({
    where: { id: userId },
    data: { phone: parsed.e164, ...consentData },
  });
  return { ok: true, phone: parsed.e164, consented: consent };
}

/**
 * A household's name with a definite article, without doubling one it already
 * has.
 *
 * People name their household both ways - "McMullens" and "The McMullens" are
 * both what a family calls itself - and the recipes page wants to say "The
 * McMullens recipe box" either way rather than "The The McMullens recipe box".
 */
export function withArticle(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;
  return /^the\s/i.test(trimmed) ? trimmed : `The ${trimmed}`;
}
