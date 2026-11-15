/**
 * Tag a household's shared recipes "Needs photo", so the photos can be
 * replaced from one list: /recipes?tag=needs-photo. See `src/lib/photo-todo.ts`.
 *
 *   npm run photos:todo                                   # which households share what
 *   npm run photos:todo -- --email you@example.com        # dry run: what would be tagged
 *   npm run photos:todo -- --email you@example.com --write
 *   npm run photos:todo -- --email you@example.com --all --write   # with or without a photo
 *
 * The household is the one that email belongs to. That household's shared
 * recipes with a photo are tagged, or all its shared recipes with `--all`;
 * uploading a new photo takes the tag off again. Run it against the database
 * whose library it is (production: `vercel env pull` puts its DATABASE_URL in
 * a local env file). Safe to run twice: a recipe already on the list stays on
 * it once.
 */
import "dotenv/config";

import { prisma } from "@/lib/db";
import {
  NEEDS_PHOTO,
  markNeedsPhoto,
  photoTodoCandidates,
} from "@/lib/photo-todo";

const argv = process.argv.slice(2);
const emailAt = argv.indexOf("--email");
const email = emailAt >= 0 ? argv[emailAt + 1]?.toLowerCase() : undefined;
const write = argv.includes("--write");
const all = argv.includes("--all");

async function main() {
  if (!email) {
    const households = await prisma.household.findMany({
      where: { recipes: { some: { isShared: true } } },
      select: {
        name: true,
        _count: { select: { recipes: { where: { isShared: true } } } },
      },
      orderBy: { name: "asc" },
    });
    console.log("Households sharing recipes:");
    for (const h of households) {
      console.log(`  ${h.name}: ${h._count.recipes} shared`);
    }
    console.log("\nRun again with --email <a member's email> to tag one.");
    return;
  }

  const user = await prisma.user.findFirst({
    where: { email },
    select: { householdId: true, household: { select: { name: true } } },
  });
  if (!user?.householdId) {
    console.error("No household for that email.");
    process.exitCode = 2;
    return;
  }

  const recipes = await photoTodoCandidates(user.householdId, { all });
  console.log(
    `${user.household?.name}: ${recipes.length} shared recipes` +
      (all ? "." : " with a photo."),
  );
  for (const recipe of recipes) console.log(`  ${recipe.title}`);

  if (!write) {
    console.log(`\nDry run. Add --write to tag them "${NEEDS_PHOTO.name}".`);
    return;
  }
  const added = await markNeedsPhoto(recipes.map((r) => r.id));
  console.log(
    `\nTagged ${added} (${recipes.length - added} already were). ` +
      `The list: /recipes?tag=${NEEDS_PHOTO.slug}`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
