import { prisma } from "../db";

/**
 * Who an assistant's access token speaks for, or null when it no longer may.
 *
 * The token itself is checked by `requireMcpAuth` (signature, issuer,
 * audience, expiry, scope). It is a signed JWT, good until it expires, so on
 * its own a Disconnect would only take effect within the hour. This adds the
 * database's word: the person must still have a consent on file for this
 * assistant, which Disconnect deletes, and still belong to a household.
 */
export async function assistantAccess(claims: {
  sub?: unknown;
  client_id?: unknown;
  azp?: unknown;
}): Promise<{ userId: string; householdId: string; clientId: string } | null> {
  const userId = typeof claims.sub === "string" ? claims.sub : null;
  const clientId =
    typeof claims.client_id === "string"
      ? claims.client_id
      : typeof claims.azp === "string"
        ? claims.azp
        : null;
  if (!userId || !clientId) return null;

  const [user, consent] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { householdId: true },
    }),
    prisma.oauthConsent.findFirst({
      where: { userId, clientId },
      select: { id: true },
    }),
  ]);
  if (!user?.householdId || !consent) return null;
  return { userId, householdId: user.householdId, clientId };
}

/** Everything an assistant holds for this person, gone at once. */
export async function disconnectAssistant(userId: string, clientId: string) {
  await prisma.$transaction([
    prisma.oauthConsent.deleteMany({ where: { userId, clientId } }),
    prisma.oauthRefreshToken.deleteMany({ where: { userId, clientId } }),
    prisma.oauthAccessToken.deleteMany({ where: { userId, clientId } }),
  ]);
}

/**
 * The assistants this person has connected, for the Household page: the
 * name it registered with, when it was first allowed in, and when it last
 * fetched a fresh token, which it does about hourly while in use.
 */
export async function listConnectedAssistants(userId: string) {
  const consents = await prisma.oauthConsent.findMany({
    where: { userId },
    select: {
      clientId: true,
      scopes: true,
      createdAt: true,
      oauthclient: { select: { name: true, uri: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  if (consents.length === 0) return [];

  const latest = await prisma.oauthRefreshToken.groupBy({
    by: ["clientId"],
    where: { userId, clientId: { in: consents.map((c) => c.clientId) } },
    _max: { createdAt: true },
  });
  const lastActive = new Map(
    latest.map((row) => [row.clientId, row._max.createdAt]),
  );

  // The latest thing each one changed, so "who planned this?" has an answer
  // on the page as well as in the record.
  const actions = await prisma.assistantAction.findMany({
    where: { userId, clientId: { in: consents.map((c) => c.clientId) } },
    orderBy: { createdAt: "desc" },
    distinct: ["clientId"],
    select: { clientId: true, summary: true },
  });
  const lastChange = new Map(actions.map((a) => [a.clientId, a.summary]));

  return consents.map((consent) => ({
    clientId: consent.clientId,
    name: consent.oauthclient.name ?? "An assistant",
    uri: consent.oauthclient.uri,
    scopes: consent.scopes,
    connectedAt: consent.createdAt,
    lastActiveAt: lastActive.get(consent.clientId) ?? consent.createdAt,
    lastChange: lastChange.get(consent.clientId) ?? null,
  }));
}
