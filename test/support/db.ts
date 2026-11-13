import { prisma } from "@/lib/db";

/**
 * Empty every table the app writes to.
 *
 * Households cascade to their members and to everything those members own, so
 * most of the library goes with them. Tags are the exception: they are a shared
 * vocabulary belonging to no household, so they have to be cleared on their
 * own. Users are cleared separately too, because a user with no household -
 * mid-signup, or the wreckage of a failed one - has nothing to cascade from.
 */
export async function resetDatabase(): Promise<void> {
  // Assistants' registrations, which their consents and tokens cascade from.
  await prisma.oauthClient.deleteMany();
  await prisma.household.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.invite.deleteMany();
  await prisma.user.deleteMany();
}

let counter = 0;

/** A household with one member in it, which is what most tests need. */
export async function makeHousehold(name = "Test Household"): Promise<{
  householdId: string;
  userId: string;
}> {
  counter += 1;
  const household = await prisma.household.create({ data: { name } });
  const user = await makeUser(household.id, `cook-${counter}`);
  return { householdId: household.id, userId: user };
}

/** Another member of an existing household. */
export async function makeUser(
  householdId: string,
  key?: string,
): Promise<string> {
  counter += 1;
  const id = key ?? `member-${counter}`;
  await prisma.user.create({
    data: {
      id,
      name: "Cook",
      email: `${id}@example.com`,
      emailVerified: true,
      updatedAt: new Date(),
      householdId,
    },
  });
  return id;
}
