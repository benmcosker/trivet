import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import {
  NEEDS_PHOTO,
  clearNeedsPhoto,
  markNeedsPhoto,
  photoTodoCandidates,
} from "@/lib/photo-todo";
import { setRecipeImage } from "@/lib/recipe-image";
import { createRecipe } from "@/lib/recipe-mutations";
import { recipeInput } from "@/lib/recipe-schema";

import { makeHousehold, resetDatabase as reset } from "./support/db";

const hasDb = Boolean(process.env.DATABASE_URL);

const photo = () =>
  new Uint8Array(readFileSync(join(process.cwd(), "test/fixtures/photo.jpg")));

describe.skipIf(!hasDb)("the Needs photo list", () => {
  let householdId: string;
  let userId: string;

  const recipe = async (
    title: string,
    { shared = true, image = true, owner = householdId } = {},
  ) => {
    const id = await createRecipe(
      recipeInput.parse({
        title,
        instructions: ["Cook"],
        ingredients: [],
        tags: [],
      }),
      owner,
      userId,
    );
    await prisma.recipe.update({
      where: { id },
      data: { isShared: shared, imageUrl: image ? `/uploads/${id}.jpg` : null },
    });
    return id;
  };

  const tagged = async () =>
    (
      await prisma.recipeTag.findMany({
        where: { tag: { slug: NEEDS_PHOTO.slug } },
        select: { recipe: { select: { title: true } } },
      })
    )
      .map((r) => r.recipe.title)
      .sort();

  beforeEach(async () => {
    await reset();
    ({ householdId, userId } = await makeHousehold());
  });

  afterAll(async () => {
    await reset();
    await prisma.$disconnect();
  });

  it("lists only the household's own shared recipes that have a photo", async () => {
    await recipe("Piccata");
    await recipe("Private", { shared: false });
    await recipe("No photo", { image: false });
    const other = await makeHousehold("Elsewhere");
    await recipe("Theirs", { owner: other.householdId });

    const titles = (await photoTodoCandidates(householdId)).map((r) => r.title);
    expect(titles).toEqual(["Piccata"]);
  });

  it("adds the ones without a photo when asked for all", async () => {
    await recipe("Piccata");
    await recipe("No photo", { image: false });
    await recipe("Private", { shared: false });

    const titles = (await photoTodoCandidates(householdId, { all: true })).map(
      (r) => r.title,
    );
    expect(titles).toEqual(["No photo", "Piccata"]);
  });

  it("tags once, however many times it runs", async () => {
    const id = await recipe("Piccata");
    expect(await markNeedsPhoto([id])).toBe(1);
    expect(await markNeedsPhoto([id])).toBe(0);
    expect(await tagged()).toEqual(["Piccata"]);
  });

  it("comes off a recipe when it gets a new photo", async () => {
    const a = await recipe("Piccata");
    const b = await recipe("Ragu");
    await markNeedsPhoto([a, b]);

    await setRecipeImage(a, householdId, photo(), "photo.jpg", "image/jpeg");

    expect(await tagged()).toEqual(["Ragu"]);
  });

  it("drops the tag itself once the list is empty", async () => {
    const id = await recipe("Piccata");
    await markNeedsPhoto([id]);

    await clearNeedsPhoto(id);

    expect(
      await prisma.tag.findUnique({ where: { slug: NEEDS_PHOTO.slug } }),
    ).toBeNull();
  });

  it("does nothing when there is no list", async () => {
    const id = await recipe("Piccata");
    await expect(clearNeedsPhoto(id)).resolves.toBeUndefined();
  });
});
