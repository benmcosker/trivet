import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import {
  ORPHAN_MIN_AGE_MS,
  describeFiles,
  orphanedFiles,
} from "@/lib/originals";
import { setRecipeImage } from "@/lib/recipe-image";
import { createRecipe, deleteRecipe } from "@/lib/recipe-mutations";
import { recipeInput } from "@/lib/recipe-schema";
import { storeFile } from "@/lib/storage";

import { makeHousehold, resetDatabase as reset } from "./support/db";

const hasDb = Boolean(process.env.DATABASE_URL);

describe("orphanedFiles", () => {
  const now = new Date("2026-11-20T12:00:00Z");
  const blob = (url: string, ageMs: number) => ({
    url,
    pathname: url,
    size: 1024 * 1024,
    uploadedAt: new Date(now.getTime() - ageMs),
  });

  it("finds old files no recipe points at", () => {
    const files = [
      blob("https://x/in-use.jpg", ORPHAN_MIN_AGE_MS * 3),
      blob("https://x/left-behind.pdf", ORPHAN_MIN_AGE_MS * 3),
    ];
    expect(
      orphanedFiles(files, new Set(["https://x/in-use.jpg"]), now).map(
        (b) => b.url,
      ),
    ).toEqual(["https://x/left-behind.pdf"]);
  });

  it("leaves a new file alone: it may be an upload still being reviewed", () => {
    expect(
      orphanedFiles([blob("https://x/just-now.pdf", 60_000)], new Set(), now),
    ).toEqual([]);
  });

  it("says how many and how big", () => {
    expect(describeFiles([{ size: 1024 * 1024 }, { size: 512 * 1024 }])).toBe(
      "2 files, 1.5 MB",
    );
    expect(describeFiles([])).toBe("0 files, 0.0 MB");
  });
});

describe.skipIf(!hasDb)("deleting a recipe", () => {
  let householdId: string;
  let userId: string;
  const uploads = join(process.cwd(), "public", "uploads");
  const onDisk = (url: string) => join(uploads, url.split("/").pop()!);

  beforeEach(async () => {
    await reset();
    ({ householdId, userId } = await makeHousehold());
  });

  afterAll(async () => {
    await reset();
    await prisma.$disconnect();
  });

  it("takes its photo and its card with it", async () => {
    const card = await storeFile(
      new TextEncoder().encode("%PDF-1.4 card"),
      "card.pdf",
      "application/pdf",
    );
    const id = await createRecipe(
      recipeInput.parse({
        title: "Piccata",
        instructions: ["Cook"],
        ingredients: [],
        tags: [],
      }),
      householdId,
      userId,
      { source: "PDF", sourceFileUrl: card.url },
    );
    const photo = await setRecipeImage(
      id,
      householdId,
      new Uint8Array(
        readFileSync(join(process.cwd(), "test/fixtures/photo.jpg")),
      ),
      "photo.jpg",
      "image/jpeg",
    );
    expect(existsSync(onDisk(card.url))).toBe(true);
    expect(existsSync(onDisk(photo))).toBe(true);

    expect(await deleteRecipe(id, householdId)).toBe(true);
    expect(existsSync(onDisk(card.url))).toBe(false);
    expect(existsSync(onDisk(photo))).toBe(false);
  });

  it("leaves another household's recipe and files alone", async () => {
    const card = await storeFile(
      new TextEncoder().encode("%PDF-1.4 card"),
      "card.pdf",
      "application/pdf",
    );
    const id = await createRecipe(
      recipeInput.parse({
        title: "Piccata",
        instructions: ["Cook"],
        ingredients: [],
        tags: [],
      }),
      householdId,
      userId,
      { source: "PDF", sourceFileUrl: card.url },
    );
    const stranger = await makeHousehold("Strangers");
    expect(await deleteRecipe(id, stranger.householdId)).toBe(false);
    expect(existsSync(onDisk(card.url))).toBe(true);
  });
});
