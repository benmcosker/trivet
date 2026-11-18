/**
 * Show the shared library's replaced photos to every household again.
 *
 *   npm run photos:own -- --email you@example.com          # dry run: what would change
 *   npm run photos:own -- --email you@example.com --write
 *
 * When photos got an origin (#193), every photo on a recipe read from a link
 * or a PDF was marked as the source's and stopped showing to other
 * households - including ones already replaced from the "Needs photo" list,
 * because nothing recorded which those were. The list did: replacing a photo
 * takes the recipe off it. This finds the household's shared recipes that
 * have a photo, are still marked as the source's and are no longer on the
 * list, and marks those photos as the household's own. See
 * `replacedLibraryPhotos` in `src/lib/photo-todo.ts`.
 *
 * If the list is finished, the tag is gone and the script stops; add
 * `--list-finished` to say every listed photo was replaced. Run it against
 * the database whose library it is, as with `photos:todo`. Safe to run twice.
 */
import "dotenv/config";

import { prisma } from "@/lib/db";
import { markPhotosOwn, replacedLibraryPhotos } from "@/lib/photo-todo";

const argv = process.argv.slice(2);
const emailAt = argv.indexOf("--email");
const email = emailAt >= 0 ? argv[emailAt + 1]?.toLowerCase() : undefined;
const write = argv.includes("--write");
const listFinished = argv.includes("--list-finished");

async function main() {
  if (!email) {
    console.error("Run with --email <a member's email>.");
    process.exitCode = 2;
    return;
  }
  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { householdId: true, household: { select: { name: true } } },
  });
  if (!user?.householdId) {
    console.error("No household for that email.");
    process.exitCode = 2;
    return;
  }

  const found = await replacedLibraryPhotos(user.householdId, {
    listFinished,
  });
  if (!found.ok) {
    console.error(
      'There is no "Needs photo" list any more, so replaced photos cannot be ' +
        "told from the originals. If every recipe on it was given a new " +
        "photo, run again with --list-finished.",
    );
    process.exitCode = 2;
    return;
  }

  const { recipes } = found;
  console.log(
    `${user.household?.name}: ${recipes.length} replaced photo${recipes.length === 1 ? "" : "s"} still hidden from other households.`,
  );
  for (const r of recipes) console.log(`  ${r.title}`);

  if (!write) {
    if (recipes.length > 0) console.log("\nDry run. Add --write to show them.");
    return;
  }
  const count = await markPhotosOwn(recipes.map((r) => r.id));
  console.log(`\nMarked ${count} as the household's own.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
