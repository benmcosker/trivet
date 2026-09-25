import { randomBytes } from "node:crypto";

import { prisma } from "./db";
import { visibleRecipes } from "./recipe-visibility";
import type { RecipeInput } from "./recipe-schema";
import { upsertTags } from "./recipes";

/**
 * A fresh public id: eight hex characters.
 *
 * Four bytes of randomness, which is 4.3 billion addresses - enough that the
 * unique index has never had to argue with this, and it would be caught if it
 * did. `randomBytes` rather than `Math.random` because an address people paste
 * to each other should not be predictable from the one before it.
 *
 * Here rather than in `recipe-url.ts` on purpose: that file is imported by the
 * planner, which is client code, and `node:crypto` cannot go there.
 */
function newPublicId(): string {
  return randomBytes(4).toString("hex");
}

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

type RecipeAssets = {
  sourceFileUrl?: string | null;
  sourceFileName?: string | null;
  /** The stored file's content type, so a page can link it or show it. */
  sourceFileType?: string | null;
  /** Lets a re-upload of the same file be recognised. Null for manual entry. */
  sourceFileSha256?: string | null;
  imageUrl?: string | null;
  source?: "MANUAL" | "PDF" | "PHOTO";
};

export async function createRecipe(
  input: RecipeInput,
  householdId: string,
  createdById: string,
  assets: RecipeAssets = {},
): Promise<string> {
  const tagIds = await upsertTags(input.tags);

  const recipe = await prisma.recipe.create({
    data: {
      publicId: newPublicId(),
      title: input.title,
      description: emptyToNull(input.description),
      servings: input.servings,
      prepMinutes: input.prepMinutes ?? null,
      cookMinutes: input.cookMinutes ?? null,
      sourceUrl: emptyToNull(input.sourceUrl),
      sourceName: emptyToNull(input.sourceName),
      ovenTemp: input.ovenTemp ?? null,
      ovenTempUnit: input.ovenTempUnit ?? null,
      restMinutes: input.restMinutes ?? null,
      yieldNote: emptyToNull(input.yieldNote),
      equipment: input.equipment,
      notes: emptyToNull(input.notes),
      instructions: input.instructions,
      source: assets.source ?? "MANUAL",
      sourceFileUrl: assets.sourceFileUrl ?? null,
      sourceFileName: assets.sourceFileName ?? null,
      sourceFileType: assets.sourceFileType ?? null,
      sourceFileSha256: assets.sourceFileSha256 ?? null,
      imageUrl: assets.imageUrl ?? null,
      householdId,
      createdById,
      ingredients: {
        create: input.ingredients.map((ingredient, position) => ({
          name: ingredient.name,
          quantity: ingredient.quantity ?? null,
          unit: emptyToNull(ingredient.unit),
          note: emptyToNull(ingredient.note),
          position,
        })),
      },
      tags: { create: tagIds.map((tagId) => ({ tagId })) },
    },
  });

  return recipe.id;
}

/**
 * Replace a recipe's contents. Returns false if another household added it.
 *
 * Everyone can read the library; only the family who put a recipe in it can
 * rewrite it. Without that, one household could quietly reword a card another
 * household cooks from every week.
 *
 * Ingredients and tags are deleted and recreated rather than diffed: the lists
 * are short, ordering matters, and a diff would have to reconcile renames it
 * has no stable identity for. Wrapped in a transaction so a failure part-way
 * cannot leave a recipe with no ingredients, and the ownership check runs
 * inside it rather than before, leaving no window between the answer and the
 * write.
 */
export async function updateRecipe(
  id: string,
  householdId: string,
  input: RecipeInput,
): Promise<boolean> {
  const tagIds = await upsertTags(input.tags);

  return prisma.$transaction(async (tx) => {
    const owned = await tx.recipe.findFirst({
      where: { id, householdId },
      select: { id: true },
    });
    if (!owned) return false;

    await tx.ingredient.deleteMany({ where: { recipeId: id } });
    await tx.recipeTag.deleteMany({ where: { recipeId: id } });
    await tx.recipe.update({
      where: { id },
      data: {
        title: input.title,
        description: emptyToNull(input.description),
        servings: input.servings,
        prepMinutes: input.prepMinutes ?? null,
        cookMinutes: input.cookMinutes ?? null,
        sourceUrl: emptyToNull(input.sourceUrl),
        sourceName: emptyToNull(input.sourceName),
        ovenTemp: input.ovenTemp ?? null,
        ovenTempUnit: input.ovenTempUnit ?? null,
        restMinutes: input.restMinutes ?? null,
        yieldNote: emptyToNull(input.yieldNote),
        equipment: input.equipment,
        notes: emptyToNull(input.notes),
        instructions: input.instructions,
        ingredients: {
          create: input.ingredients.map((ingredient, position) => ({
            name: ingredient.name,
            quantity: ingredient.quantity ?? null,
            unit: emptyToNull(ingredient.unit),
            note: emptyToNull(ingredient.note),
            position,
          })),
        },
        tags: { create: tagIds.map((tagId) => ({ tagId })) },
      },
    });

    return true;
  });
}

/**
 * Remove a recipe, if this household added it. Returns whether it did.
 *
 * The library is shared, so a delete is not a private act: it takes the card
 * away from everybody, including whoever planned it for Thursday. Only the
 * family who added it may do that.
 *
 * `deleteMany` rather than `delete` so somebody else's id matches nothing
 * instead of erroring, which is the same answer as an id already gone.
 */
export async function deleteRecipe(
  id: string,
  householdId: string,
): Promise<boolean> {
  const { count } = await prisma.recipe.deleteMany({
    where: { id, householdId },
  });
  return count > 0;
}

/**
 * Share a recipe with the other households, or take it back.
 *
 * Scoped to the owner like every other write: the id arrives from a form post,
 * and sharing is not a thing you may do to somebody else's recipe in either
 * direction. Returns false when the recipe is not theirs, which the caller
 * treats the same as it not existing.
 *
 * Un-sharing is not retroactive to a week already planned. A household that
 * put this on Thursday keeps it there and still gets its ingredients on the
 * shopping list - pulling dinner out of somebody's week days later, because
 * another family changed its mind, is worse than the recipe staying readable
 * to the few people who had already committed to cooking it.
 */
export async function setRecipeShared(
  id: string,
  householdId: string,
  isShared: boolean,
): Promise<boolean> {
  const { count } = await prisma.recipe.updateMany({
    where: { id, householdId },
    data: { isShared },
  });
  return count > 0;
}

/** Tags with a usage count, for the filter bar. */
export async function listTagsWithCounts(
  householdId: string,
): Promise<{ id: string; name: string; slug: string; count: number }[]> {
  /*
   * Counted over the recipes this household can see, not over the table.
   *
   * Tags themselves are a shared vocabulary, but their counts are not: a
   * count taken over everything would offer a filter that returns nothing,
   * and the number itself would say how many recipes exist behind a door
   * this household cannot open.
   */
  const tags = await prisma.tag.findMany({
    include: {
      _count: {
        select: { recipes: { where: { recipe: visibleRecipes(householdId) } } },
      },
    },
    orderBy: { name: "asc" },
  });

  return tags
    .map((tag) => ({
      id: tag.id,
      name: tag.name,
      slug: tag.slug,
      count: tag._count.recipes,
    }))
    .filter((tag) => tag.count > 0);
}
