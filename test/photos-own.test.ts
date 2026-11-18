import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import {
  NEEDS_PHOTO,
  clearNeedsPhoto,
  markNeedsPhoto,
  markPhotosOwn,
  replacedLibraryPhotos,
} from "@/lib/photo-todo";
import { createRecipe } from "@/lib/recipe-mutations";
import { recipeInput } from "@/lib/recipe-schema";

import { makeHousehold, resetDatabase as reset } from "./support/db";

const hasDb = Boolean(process.env.DATABASE_URL);

/**
 * The state #193's migration left: library photos all marked as the
 * source's, some of them already replaced from the "Needs photo" list.
 */
describe.skipIf(!hasDb)("finding library photos replaced before #193", () => {
  let householdId: string;
  let userId: string;

  const recipe = async (
    title: string,
    { shared = true, fromSource = true } = {},
  ) => {
    const id = await createRecipe(
      recipeInput.parse({
        title,
        instructions: ["Cook"],
        ingredients: [],
        tags: [],
      }),
      householdId,
      userId,
    );
    await prisma.recipe.update({
      where: { id },
      data: {
        isShared: shared,
        imageUrl: `/uploads/${id}.jpg`,
        imageFromSource: fromSource,
      },
    });
    return id;
  };

  beforeEach(async () => {
    await reset();
    ({ householdId, userId } = await makeHousehold("Library"));
  });

  afterAll(async () => {
    await reset();
    await prisma.$disconnect();
  });

  const titles = async () => {
    const found = await replacedLibraryPhotos(householdId);
    if (!found.ok) throw new Error(found.reason);
    return found.recipes.map((r) => r.title);
  };

  it("finds those taken off the list, not those still on it", async () => {
    const waiting = await recipe("Waiting");
    const replaced = await recipe("Replaced");
    await recipe("Private", { shared: false });
    await recipe("Already own", { fromSource: false });
    await markNeedsPhoto([waiting, replaced]);
    await clearNeedsPhoto(replaced);

    expect(await titles()).toEqual(["Replaced"]);
  });

  it("marks them as the household's own, and then finds nothing", async () => {
    const waiting = await recipe("Waiting");
    const replaced = await recipe("Replaced");
    await markNeedsPhoto([waiting, replaced]);
    await clearNeedsPhoto(replaced);

    const found = await replacedLibraryPhotos(householdId);
    if (!found.ok) throw new Error(found.reason);
    expect(await markPhotosOwn(found.recipes.map((r) => r.id))).toBe(1);
    expect(await titles()).toEqual([]);
    const row = await prisma.recipe.findUniqueOrThrow({
      where: { id: waiting },
    });
    expect(row.imageFromSource).toBe(true);
  });

  it("will not guess once the list is gone, unless told it was finished", async () => {
    const only = await recipe("Only");
    await markNeedsPhoto([only]);
    await clearNeedsPhoto(only);
    expect(
      await prisma.tag.findUnique({ where: { slug: NEEDS_PHOTO.slug } }),
    ).toBeNull();

    expect(await replacedLibraryPhotos(householdId)).toEqual({
      ok: false,
      reason: "no-list",
    });
    const finished = await replacedLibraryPhotos(householdId, {
      listFinished: true,
    });
    expect(finished.ok && finished.recipes.map((r) => r.title)).toEqual([
      "Only",
    ]);
  });
});
