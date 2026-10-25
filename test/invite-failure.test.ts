import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What happens when redemption does not merely refuse, but breaks.
 *
 * Kept in its own file because it has to mock the invite module, and the rest
 * of the invite tests want the real one.
 *
 * The failure this guards is not the error itself - a database can always have
 * a bad minute - but what it leaves behind. better-auth creates the account
 * before the hook runs, so an exception that escapes the hook strands a user
 * row with no household: unusable, since every page reads through
 * `requireHousehold`, and holding the email address so the same person cannot
 * simply try again. They are told the account already exists, which is true and
 * useless.
 */
const redeemInvite = vi.hoisted(() => vi.fn());

vi.mock("@/lib/invites", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/invites")>("@/lib/invites");
  return { ...actual, redeemInvite };
});

const { auth } = await import("@/lib/auth");
const { prisma } = await import("@/lib/db");
const { createInvite } = await import("@/lib/invites");
const { makeHousehold, resetDatabase } = await import("./support/db");

const hasDb = Boolean(process.env.DATABASE_URL);
const PASSWORD = "correct-horse-battery-staple";

async function signUp(email: string, inviteCode: string): Promise<number> {
  try {
    const res = await auth.api.signUpEmail({
      body: {
        name: "New User",
        email,
        password: PASSWORD,
        // Spread so the excess-property check does not reject a field
        // better-auth passes through to the signup hook but does not type.
        ...{ inviteCode },
      },
      asResponse: true,
    });
    return res.status;
  } catch (error) {
    const code = (error as { statusCode?: number }).statusCode;
    if (typeof code === "number") return code;
    const named = (error as { status?: string }).status;
    if (named === "FORBIDDEN") return 403;
    if (named === "INTERNAL_SERVER_ERROR") return 500;
    throw error;
  }
}

describe.skipIf(!hasDb)("when redeeming an invite breaks", () => {
  let code: string;

  beforeEach(async () => {
    await resetDatabase();
    redeemInvite.mockReset();

    const { householdId, userId } = await makeHousehold("The Inviters");
    ({ code } = await createInvite({ createdById: userId, householdId }));
  });

  afterAll(async () => {
    await resetDatabase();
    await prisma.$disconnect();
  });

  it("leaves no account behind when redemption throws", async () => {
    redeemInvite.mockRejectedValue(new Error("connection terminated"));

    await signUp("hopeful@example.com", code);

    // The point of the whole test: the address is free to try again with.
    expect(
      await prisma.user.findUnique({ where: { email: "hopeful@example.com" } }),
    ).toBeNull();
  });

  it("never leaves an account with no household", async () => {
    redeemInvite.mockRejectedValue(new Error("connection terminated"));
    await signUp("hopeful@example.com", code);

    // A user with no household can sign in and then be bounced off every page
    // by `requireHousehold`, with nothing on screen explaining why.
    expect(await prisma.user.count({ where: { householdId: null } })).toBe(0);
  });

  it("says something went wrong, not that the code was used", async () => {
    redeemInvite.mockRejectedValue(new Error("connection terminated"));

    // "Already used" would send them off to ask for another code, which will
    // fail in exactly the same way.
    expect(await signUp("hopeful@example.com", code)).toBe(500);
  });

  it("still reports a genuinely spent code as spent", async () => {
    redeemInvite.mockResolvedValue(false);

    expect(await signUp("latecomer@example.com", code)).toBe(403);
    expect(
      await prisma.user.findUnique({
        where: { email: "latecomer@example.com" },
      }),
    ).toBeNull();
  });

  it("keeps the account when redemption succeeds", async () => {
    redeemInvite.mockResolvedValue(true);

    expect(await signUp("welcome@example.com", code)).toBe(200);
    expect(
      await prisma.user.findUnique({ where: { email: "welcome@example.com" } }),
    ).not.toBeNull();
  });
});
