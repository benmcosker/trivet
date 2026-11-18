import { prisma } from "./db";

/**
 * "Needs photo": the shared library's to-do list of photos to replace.
 *
 * The shared recipes came with photos from wherever they were first found,
 * and those belong to other people. The household replacing them works
 * through `/recipes?tag=needs-photo`, which is an ordinary tag filter: the
 * tag is put on by `npm run photos:todo` and comes off a recipe by itself
 * when it gets a new photo, so the list only ever shows what is left. When
 * the last one is done the tag itself goes, and with it the filter.
 */
export const NEEDS_PHOTO = { name: "Needs photo", slug: "needs-photo" };

/** Take a recipe off the list; drop the tag once nothing is on it. */
export async function clearNeedsPhoto(recipeId: string): Promise<void> {
  const tag = await prisma.tag.findUnique({
    where: { slug: NEEDS_PHOTO.slug },
    select: { id: true },
  });
  if (!tag) return;

  await prisma.recipeTag.deleteMany({ where: { recipeId, tagId: tag.id } });
  // Only if nothing else has picked it up since: the delete is conditional.
  await prisma.tag.deleteMany({
    where: { id: tag.id, recipes: { none: {} } },
  });
}

/**
 * The shared recipes a household would put on the list: its own, shared,
 * and by default only those with a photo to replace. `all` adds the ones
 * with no photo yet, which the stripe placeholder stands in for.
 */
export function photoTodoCandidates(
  householdId: string,
  { all = false }: { all?: boolean } = {},
) {
  return prisma.recipe.findMany({
    where: {
      householdId,
      isShared: true,
      ...(all ? {} : { imageUrl: { not: null } }),
    },
    select: { id: true, title: true },
    orderBy: { title: "asc" },
  });
}

/** Put recipes on the list. Returns how many were not on it already. */
export async function markNeedsPhoto(recipeIds: string[]): Promise<number> {
  if (recipeIds.length === 0) return 0;
  const tag = await prisma.tag.upsert({
    where: { slug: NEEDS_PHOTO.slug },
    create: NEEDS_PHOTO,
    update: {},
    select: { id: true },
  });
  const { count } = await prisma.recipeTag.createMany({
    data: recipeIds.map((recipeId) => ({ recipeId, tagId: tag.id })),
    skipDuplicates: true,
  });
  return count;
}

/**
 * Library photos that were replaced before photos had an origin, still marked
 * as the source's.
 *
 * `Recipe.imageFromSource` arrived after the "Needs photo" list was already
 * being worked through, and its migration marked every photo on a link or PDF
 * recipe as the source's - including ones already replaced by hand, since
 * nothing recorded which those were. The list did: a new photo takes a recipe
 * off it. So a shared recipe with a photo, still marked as the source's, and
 * no longer on the list, has a photo the household took.
 *
 * Only meaningful while the list exists. Once the last recipe comes off it the
 * tag is deleted, and "not on the list" then means every one was replaced;
 * the caller has to say so (`listFinished`), because a household that never
 * had a list looks exactly the same.
 */
export async function replacedLibraryPhotos(
  householdId: string,
  { listFinished = false }: { listFinished?: boolean } = {},
): Promise<
  | { ok: true; recipes: { id: string; title: string }[] }
  | { ok: false; reason: "no-list" }
> {
  const tag = await prisma.tag.findUnique({
    where: { slug: NEEDS_PHOTO.slug },
    select: { id: true },
  });
  if (!tag && !listFinished) return { ok: false, reason: "no-list" };

  const recipes = await prisma.recipe.findMany({
    where: {
      householdId,
      isShared: true,
      imageUrl: { not: null },
      imageFromSource: true,
      ...(tag ? { tags: { none: { tagId: tag.id } } } : {}),
    },
    select: { id: true, title: true },
    orderBy: { title: "asc" },
  });
  return { ok: true, recipes };
}

/** Mark these photos as the household's own, so they travel with the recipe. */
export async function markPhotosOwn(recipeIds: string[]): Promise<number> {
  if (recipeIds.length === 0) return 0;
  const { count } = await prisma.recipe.updateMany({
    where: { id: { in: recipeIds } },
    data: { imageFromSource: false },
  });
  return count;
}
