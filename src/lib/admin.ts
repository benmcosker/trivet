import { prisma } from "./db";

/**
 * Who may see the overview.
 *
 * An environment variable rather than a column on the user: nobody can grant
 * themselves the role through the app, there is no "make admin" button to
 * defend, and taking it away is a deploy rather than a database edit somebody
 * has to remember to make.
 *
 * Compared case-insensitively, because an email address is typed by a person
 * and "Ben@" and "ben@" are the same inbox.
 *
 * Surrounding quotes are stripped too. A .env file wants
 * ADMIN_EMAILS="ben@example.com" and a hosting dashboard wants the bare
 * address, so the quoted form gets pasted into the dashboard and the value
 * arrives with literal quote characters in it. Nothing then matches, and the
 * page 404s exactly as it would for a stranger - which is the least
 * debuggable way this can fail.
 */
export function adminEmails(
  env: Record<string, string | undefined> = process.env,
): string[] {
  return parseEmailList(env.ADMIN_EMAILS);
}

/**
 * A comma-separated list of addresses from the environment, forgiving the
 * ways a dashboard mangles one (see `adminEmails`). Shared with
 * `libraryEmails`, which is configured the same way for the same reasons.
 */
export function parseEmailList(value: string | undefined): string[] {
  const raw = (value ?? "").trim();

  /*
   * Unwrap the whole value only when its quotes are the only pair in it.
   * `"a@x.com, b@x.com"` is one wrapped list and unwraps; `"a@x.com","b@x.com"`
   * is two quoted entries, and unwrapping that leaves a stray quote glued to
   * each address - so it is left for the per-entry pass below instead.
   */
  const pairs = (raw.match(/["']/g) ?? []).length;
  const source = pairs === 2 ? unquote(raw) : raw;

  return source
    .split(",")
    .map((entry) => normaliseConfigured(unquote(entry)))
    .filter(Boolean);
}

/**
 * The configured side: the value an operator typed into a hosting dashboard.
 *
 * Zero-width characters are stripped as well as case and space. They survive a
 * copy out of a rich-text editor, a chat window or a password manager, they
 * are invisible in every field that will ever show them, and one of them
 * anywhere in the value makes the address match nothing while looking exactly
 * right in the dashboard.
 */
function normaliseConfigured(value: string): string {
  return value
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .trim()
    .toLowerCase();
}

/**
 * The identity side: the address an account is actually registered under.
 *
 * Deliberately narrower than the configured side, and the asymmetry is the
 * point. Forgiving an invisible character in ADMIN_EMAILS helps the one person
 * who set it. Forgiving one here would mean an address that merely *folds*
 * into the admin's is treated as the admin's - so an account registered as
 * "ben<zero-width>@example.com", which the unique index is perfectly happy to
 * hold alongside the real one, would be let in. Signup is invite-only, so this
 * is narrow rather than open, but "hard to reach" is not a reason to compare
 * an identity by anything other than what it literally is.
 */
function normaliseIdentity(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Drop one matched pair of surrounding quotes, if there is one.
 *
 * An unbalanced quote is left alone: half a quote is a typo, and stripping it
 * would invent an address nobody typed.
 */
function unquote(value: string): string {
  const trimmed = value.trim();
  const quoted =
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")));
  return quoted ? trimmed.slice(1, -1).trim() : trimmed;
}

/** The identity side of the comparison, for other lists read the same way. */
export function emailInList(
  email: string | null | undefined,
  list: string[],
): boolean {
  const address = normaliseIdentity(email ?? "");
  return address !== "" && list.includes(address);
}

export function isAdmin(
  email: string | null | undefined,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const address = normaliseIdentity(email ?? "");
  if (!address) return false;
  return adminEmails(env).includes(address);
}

/**
 * An address reduced to what can be said about it in a log.
 *
 * "be********@gmail.com (20 chars)". Enough to see a typo, a wrong domain or
 * a stray invisible character - a length that disagrees with what the visible
 * text should give is the whole point - without writing anybody's address into
 * a log that outlives the question.
 */
export function maskAddress(address: string): string {
  const at = address.lastIndexOf("@");
  const size = `${address.length} chars`;
  if (at <= 0) return `${address.slice(0, 2)}... (${size}, no @)`;

  const local = address.slice(0, at);
  const kept = local.slice(0, 2);
  return `${kept}${"*".repeat(local.length - kept.length)}${address.slice(at)} (${size})`;
}

export type AdminMember = {
  name: string;
  email: string;
  /**
   * The most recent session this person started, or null.
   *
   * Expired sessions are cleaned up, so null reads as "not lately" rather than
   * "never" - it cannot tell a new account from a dormant one.
   */
  lastSignInAt: Date | null;
  agreedToTexts: boolean;
};

export type AdminHousehold = {
  id: string;
  name: string;
  createdAt: Date;
  members: AdminMember[];
  /** Recipes this household owns, split by how they arrived. */
  recipes: { total: number; manual: number; pdf: number; photo: number };
  /**
   * Meals on the planner, ever. A household fact rather than a personal one:
   * a planned meal records the household and the date, not who chose it.
   */
  planner: { mealsPlanned: number; lastPlannedAt: Date | null };
  /**
   * Card reads charged against the daily quota, summed over the household.
   *
   * Attempts, not recipes: a refused or unreadable card still spends one, so
   * this sits above the PDF and photo counts rather than matching them.
   */
  uploadAttempts: number;
  /**
   * Times this household texted its shopping list.
   *
   * Initiated, not delivered - Twilio's acceptance is all the app ever sees.
   * Counting the sends is the honest version of "do they use the texting",
   * and it is the only question this view can answer about it.
   */
  texts: { sent: number; lastSentAt: Date | null };
};

/**
 * Every household, and how much use each is getting.
 *
 * Deliberately nothing but counts and dates. No recipe titles, no plans, no
 * shopping lists, no phone numbers - the privacy policy says recipes and plans
 * are visible to the members of the same household, and this view has to leave
 * that true rather than make it a promise an administrator is trusted to keep.
 *
 * Read in a handful of grouped queries and stitched here. A household and its
 * members are small enough that the joins are not worth the SQL.
 */
export async function adminOverview(): Promise<AdminHousehold[]> {
  const [households, recipeCounts, plannerCounts, quotas, textCounts] =
    await Promise.all([
      prisma.household.findMany({
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          createdAt: true,
          members: {
            orderBy: { name: "asc" },
            select: {
              id: true,
              name: true,
              email: true,
              smsConsentAt: true,
              sessions: {
                orderBy: { createdAt: "desc" },
                take: 1,
                select: { createdAt: true },
              },
            },
          },
        },
      }),
      prisma.recipe.groupBy({
        by: ["householdId", "source"],
        _count: { _all: true },
      }),
      prisma.plannedMeal.groupBy({
        by: ["householdId"],
        _count: { _all: true },
        _max: { createdAt: true },
      }),
      prisma.uploadQuota.groupBy({ by: ["userId"], _sum: { count: true } }),
      prisma.shoppingText.groupBy({
        by: ["householdId"],
        _count: { _all: true },
        _max: { createdAt: true },
      }),
    ]);

  const attemptsByUser = new Map(
    quotas.map((row) => [row.userId, row._sum.count ?? 0]),
  );
  const plannerByHousehold = new Map(
    plannerCounts.map((row) => [row.householdId, row]),
  );
  const textsByHousehold = new Map(
    textCounts.map((row) => [row.householdId, row]),
  );

  return households.map((household) => {
    const recipes = { total: 0, manual: 0, pdf: 0, photo: 0 };
    for (const row of recipeCounts) {
      if (row.householdId !== household.id) continue;
      const n = row._count._all;
      recipes.total += n;
      if (row.source === "MANUAL") recipes.manual += n;
      if (row.source === "PDF") recipes.pdf += n;
      if (row.source === "PHOTO") recipes.photo += n;
    }

    const planned = plannerByHousehold.get(household.id);
    const texted = textsByHousehold.get(household.id);

    return {
      id: household.id,
      name: household.name,
      createdAt: household.createdAt,
      members: household.members.map((member) => ({
        name: member.name,
        email: member.email,
        lastSignInAt: member.sessions[0]?.createdAt ?? null,
        agreedToTexts: member.smsConsentAt != null,
      })),
      recipes,
      planner: {
        mealsPlanned: planned?._count._all ?? 0,
        lastPlannedAt: planned?._max.createdAt ?? null,
      },
      uploadAttempts: household.members.reduce(
        (total, member) => total + (attemptsByUser.get(member.id) ?? 0),
        0,
      ),
      texts: {
        sent: texted?._count._all ?? 0,
        lastSentAt: texted?._max.createdAt ?? null,
      },
    };
  });
}
