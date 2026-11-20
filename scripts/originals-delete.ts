/**
 * Delete stored original cards, and files no recipe uses any more.
 *
 *   npm run originals:delete            # dry run: what would go
 *   npm run originals:delete -- --write
 *
 * 1. Original cards: every recipe that still has `sourceFileUrl` loses the
 *    stored file and the link to it. Its fingerprint (`sourceFileSha256`)
 *    stays, so the same card uploaded again is still recognised.
 * 2. Unused files: anything in the blob store that no recipe's photo or card
 *    points at, and that is more than a day old (a newer one may be an upload
 *    still being reviewed). Deleted recipes used to leave these behind.
 *
 * Needs the production database and the production blob store: DATABASE_URL
 * and BLOB_READ_WRITE_TOKEN, both in single quotes. The token is in Vercel,
 * under Storage, the blob store, then its .env.local tab. The blob store must
 * be Trivet's alone: step 2 treats every file in it that no recipe uses as
 * unused. Safe to run twice. See `src/lib/originals.ts`.
 */
import "dotenv/config";

import { del, list } from "@vercel/blob";

import { prisma } from "@/lib/db";
import { describeFiles, orphanedFiles, type StoredBlob } from "@/lib/originals";

const write = process.argv.slice(2).includes("--write");
const token = process.env.BLOB_READ_WRITE_TOKEN;

async function allBlobs(): Promise<StoredBlob[]> {
  const blobs: StoredBlob[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ token, cursor, limit: 1000 });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return blobs;
}

async function main() {
  const originals = await prisma.recipe.findMany({
    where: { sourceFileUrl: { not: null } },
    select: {
      id: true,
      title: true,
      sourceFileUrl: true,
      household: { select: { name: true } },
    },
    orderBy: { title: "asc" },
  });

  if (originals.some((r) => r.sourceFileUrl?.startsWith("http")) && !token) {
    console.error(
      "These files are in the blob store, and BLOB_READ_WRITE_TOKEN is not set. " +
        "Add it (Vercel, Storage, the blob store, .env.local) and run again.",
    );
    process.exitCode = 2;
    return;
  }

  // 1. Original cards.
  const byHousehold = new Map<string, number>();
  for (const r of originals) {
    byHousehold.set(
      r.household.name,
      (byHousehold.get(r.household.name) ?? 0) + 1,
    );
  }
  console.log(`Original cards still stored: ${originals.length}`);
  for (const [name, count] of byHousehold) console.log(`  ${name}: ${count}`);

  let cleared = 0;
  const failed: string[] = [];
  if (write) {
    for (const r of originals) {
      try {
        // The file first, then the link: a failed delete keeps the link, so
        // running again retries it rather than losing track of the file.
        if (token && r.sourceFileUrl) await del(r.sourceFileUrl, { token });
        await prisma.recipe.update({
          where: { id: r.id },
          data: {
            sourceFileUrl: null,
            sourceFileName: null,
            sourceFileType: null,
          },
        });
        cleared += 1;
      } catch (error) {
        failed.push(
          `${r.title}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }
    console.log(`Deleted ${cleared}.`);
    for (const line of failed) console.log(`  failed: ${line}`);
  }

  // 2. Files no recipe uses.
  if (!token) {
    console.log("\nNo blob store configured, so no unused files to look for.");
  } else {
    const inUse = await prisma.recipe.findMany({
      select: { imageUrl: true, sourceFileUrl: true },
    });
    const referenced = new Set(
      inUse
        .flatMap((r) => [r.imageUrl, r.sourceFileUrl])
        .filter((url): url is string => Boolean(url)),
    );
    // In a dry run the originals above are still referenced; with --write
    // they are already gone. Either way they are not counted twice.
    const unused = orphanedFiles(await allBlobs(), referenced, new Date());
    console.log(
      `\nFiles no recipe uses, over a day old: ${describeFiles(unused)}`,
    );

    if (write && unused.length > 0) {
      for (let i = 0; i < unused.length; i += 100) {
        await del(
          unused.slice(i, i + 100).map((b) => b.url),
          { token },
        );
      }
      console.log(`Deleted ${unused.length}.`);
    }
  }

  if (!write) console.log("\nDry run. Add --write to delete.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
