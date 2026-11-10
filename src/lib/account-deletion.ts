import { prisma } from "./db";
import { deleteFile } from "./storage";

/**
 * Deleting an account from inside the app: Apple's guideline 5.1.1(v).
 *
 * Two cases, because a household is shared:
 *
 * - **Others stay.** The account goes, the family keeps everything. Every row
 *   this person created for the household (recipes, pantry, extras, skips,
 *   shopping runs and texts) is handed to the longest-standing remaining
 *   member first: those rows cascade from their creator, and without the
 *   handover the family would lose its library with one person's account.
 *   Their reviews, sign-ins and pending invites go with them.
 * - **Last one out.** The household goes, and everything in it, including the
 *   recipes it shared with other households (settled with Ben, 10 November):
 *   deleting means deleting, as the privacy page says. The stored photos and
 *   cards go too.
 */

export type DeletionPreview = {
  /** Nobody else is in the household, so it goes too. */
  lastMember: boolean;
  /** Recipes the household would lose (last one out only). */
  recipes: number;
  /** Of those, how many other households can see. */
  sharedRecipes: number;
};

export async function deletionPreview(
  userId: string,
): Promise<DeletionPreview> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { householdId: true },
  });
  if (!user?.householdId)
    return { lastMember: true, recipes: 0, sharedRecipes: 0 };

  const others = await prisma.user.count({
    where: { householdId: user.householdId, id: { not: userId } },
  });
  if (others > 0) return { lastMember: false, recipes: 0, sharedRecipes: 0 };

  const [recipes, sharedRecipes] = await Promise.all([
    prisma.recipe.count({ where: { householdId: user.householdId } }),
    prisma.recipe.count({
      where: { householdId: user.householdId, isShared: true },
    }),
  ]);
  return { lastMember: true, recipes, sharedRecipes };
}

/** Delete this account, as described above. */
export async function deleteAccount(userId: string): Promise<void> {
  const files = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { householdId: true },
    });
    if (!user) return [];

    const heir = user.householdId
      ? await tx.user.findFirst({
          where: { householdId: user.householdId, id: { not: userId } },
          orderBy: { createdAt: "asc" },
          select: { id: true },
        })
      : null;

    if (heir) {
      const handOver = {
        where: { createdById: userId },
        data: { createdById: heir.id },
      };
      await tx.recipe.updateMany(handOver);
      await tx.pantryItem.updateMany(handOver);
      await tx.extraItem.updateMany(handOver);
      await tx.weeklySkip.updateMany(handOver);
      await tx.shoppingText.updateMany(handOver);
      await tx.shoppingHandoff.updateMany(handOver);
      await tx.user.delete({ where: { id: userId } });
      return [];
    }

    if (!user.householdId) {
      await tx.user.delete({ where: { id: userId } });
      return [];
    }

    // Last one out: the files are collected before the rows that name them go.
    const recipes = await tx.recipe.findMany({
      where: { householdId: user.householdId },
      select: { imageUrl: true, sourceFileUrl: true },
    });
    // The household cascades to its members, this one included, and to
    // everything they made.
    await tx.household.delete({ where: { id: user.householdId } });
    return recipes.flatMap((r) => [r.imageUrl, r.sourceFileUrl]);
  });

  // After the rows, not inside the transaction: a file store that is slow or
  // down must not keep an account somebody asked to delete. A file left over
  // is named by nothing and can be swept; a kept account cannot.
  await Promise.all(
    files
      .filter((url): url is string => Boolean(url && isStored(url)))
      .map(deleteFile),
  );
}

/** One of Trivet's own stored files, rather than a photo on another site. */
function isStored(url: string): boolean {
  return (
    url.startsWith("/uploads/") || url.includes(".blob.vercel-storage.com/")
  );
}
