/**
 * Fill a household with the library the README screenshots are taken from.
 *
 * The screenshots in `docs/screenshots/` went a month out of date without
 * anybody noticing: they were taken by hand in September, the app was renamed
 * from Meal Magic to Trivet afterwards, and four pictures of the wrong product
 * sat under the README's heading until somebody looked. Taking them by hand
 * again would set the same trap, so the library they show lives here instead.
 *
 *   npm run browse:seed        # the account, if it does not exist yet
 *   npm run seed:demo          # this - the dishes, the week, the pantry
 *   npm run browse -- /recipes --shot=docs/screenshots/recipes.png
 *
 * Deliberately no dish photographs. The striped placeholders are what the app
 * draws for a recipe with no picture, they are a designed state rather than a
 * gap, and the alternative is publishing a family's dinners to a public repo.
 *
 * Destructive and idempotent in the same breath: it clears this household's
 * recipes, plan, pantry and extras and writes them again, so a second run
 * gives the same library rather than two of it. That is also what makes it
 * safe to run before every screenshot pass.
 *
 * Only ever point it at a development database.
 */
import { createHash } from "node:crypto";

import "dotenv/config";

import { prisma } from "@/lib/db";

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to run against a production database.");
  process.exit(2);
}

const email = process.env.BROWSE_EMAIL ?? "browse@example.com";

/** The name in the nav and in the eyebrow over the library. */
const HOUSEHOLD = "The McMullens";

/** Who the screenshots are signed in as. The browse account is called
 * "Browse Check", which reads as a nav item sitting in the top right. */
const COOK = "Ben";

type Seed = {
  title: string;
  description: string;
  servings: number;
  prepMinutes?: number;
  cookMinutes?: number;
  restMinutes?: number;
  ovenTemp?: number;
  equipment?: string[];
  sourceName?: string;
  yieldNote?: string;
  notes?: string;
  tags: string[];
  ingredients: [name: string, quantity: number | null, unit: string | null][];
  instructions: string[];
};

const LIBRARY: Seed[] = [
  {
    title: "Zuni Chicken with Bread Salad",
    description:
      "The one that justifies owning a cast iron pan. Salt it a day ahead and do not skip the currants.",
    servings: 4,
    prepMinutes: 20,
    cookMinutes: 70,
    restMinutes: 1440,
    ovenTemp: 475,
    equipment: ["Cast iron skillet"],
    sourceName: "Zuni Cafe Cookbook",
    notes: "The day in the fridge is the recipe. An hour will not do it.",
    tags: ["Sunday Cooking", "Comfort", "Chicken"],
    ingredients: [
      ["whole chicken", 1, null],
      ["day-old country bread", 0.5, "loaf"],
      ["dried currants", 2, "tbsp"],
      ["red wine vinegar", 1, "tbsp"],
      ["scallions", 4, null],
      ["pine nuts", 3, "tbsp"],
      ["olive oil", 0.25, "cup"],
      ["salt", null, null],
    ],
    instructions: [
      "Salt the chicken all over and leave it uncovered in the fridge for a day.",
      "Heat the oven to 475F with the skillet in it.",
      "Roast the chicken breast up for 30 minutes, turn, and give it 20 more.",
      "Soak the currants in the vinegar while it roasts.",
      "Tear the bread, oil it, and toast it under the chicken for the last 10 minutes.",
      "Rest the bird, toss the bread with the currants, scallions and pine nuts, and serve it underneath.",
    ],
  },
  {
    title: "Pork Shoulder Ragu",
    description:
      "Four hours of nothing much, and then dinner for the rest of the week.",
    servings: 6,
    prepMinutes: 25,
    cookMinutes: 240,
    ovenTemp: 300,
    equipment: ["Dutch oven"],
    tags: ["Sunday Cooking", "Pasta", "Comfort", "One Pot"],
    ingredients: [
      ["pork shoulder", 2, "lb"],
      ["onions", 2, null],
      ["carrots", 2, null],
      ["garlic", 4, "cloves"],
      ["tinned tomatoes", 28, "oz"],
      ["red wine", 1, "cup"],
      ["pappardelle", 1, "lb"],
      ["olive oil", 2, "tbsp"],
    ],
    instructions: [
      "Brown the pork hard on every side and set it aside.",
      "Soften the onions, carrots and garlic in the same pot.",
      "Deglaze with the wine and let it reduce by half.",
      "Add the tomatoes and the pork, cover, and put it in a 300F oven for four hours.",
      "Shred the meat into the sauce and toss with the pappardelle.",
    ],
  },
  {
    title: "Sheet Pan Chicken Thighs and Potatoes",
    description:
      "One pan, forty minutes, and the potatoes cook in the chicken fat.",
    servings: 4,
    prepMinutes: 10,
    cookMinutes: 40,
    ovenTemp: 425,
    equipment: ["Half sheet pan"],
    tags: ["Weeknight", "Chicken", "One Pot"],
    ingredients: [
      ["bone-in chicken thighs", 6, null],
      ["new potatoes", 1.5, "lb"],
      ["lemon", 1, null],
      ["rosemary", 2, "sprigs"],
      ["olive oil", 3, "tbsp"],
    ],
    instructions: [
      "Halve the potatoes and toss them with oil, salt and the rosemary.",
      "Sit the thighs skin up on top and season them well.",
      "Roast at 425F for 40 minutes without turning anything.",
      "Squeeze the lemon over it as it comes out.",
    ],
  },
  {
    title: "Cacio e Pepe",
    description: "Three ingredients, and the only hard part is the emulsion.",
    servings: 2,
    prepMinutes: 5,
    cookMinutes: 15,
    tags: ["Weeknight", "Pasta"],
    ingredients: [
      ["tonnarelli", 200, "g"],
      ["pecorino romano", 100, "g"],
      ["black peppercorns", 1, "tbsp"],
    ],
    instructions: [
      "Toast the peppercorns and crack them coarsely.",
      "Boil the pasta in half the usual water, so the starch concentrates.",
      "Grate the pecorino and work it into a paste with a little pasta water off the heat.",
      "Toss the drained pasta with the pepper, then the cheese, adding water until it turns glossy.",
    ],
  },
  {
    title: "Grilled Skirt Steak with Salsa Verde",
    description: "Hot and fast, then let it sit. Slice against the grain.",
    servings: 4,
    prepMinutes: 15,
    cookMinutes: 8,
    restMinutes: 10,
    equipment: ["Charcoal grill"],
    tags: ["Grill", "Weeknight"],
    ingredients: [
      ["skirt steak", 1.5, "lb"],
      ["parsley", 1, "bunch"],
      ["capers", 2, "tbsp"],
      ["anchovy fillets", 3, null],
      ["garlic", 1, "clove"],
      ["olive oil", 0.5, "cup"],
      ["red wine vinegar", 1, "tbsp"],
    ],
    instructions: [
      "Chop the parsley, capers, anchovies and garlic together and loosen with the oil and vinegar.",
      "Get the grill as hot as it goes.",
      "Grill the steak four minutes a side and no more.",
      "Rest it ten minutes, slice against the grain, and spoon the salsa over.",
    ],
  },
  {
    title: "White Bean and Kale Soup",
    description:
      "The thing to cook when there is nothing in. Better on the second day.",
    servings: 6,
    prepMinutes: 15,
    cookMinutes: 45,
    equipment: ["Dutch oven"],
    tags: ["Weeknight", "One Pot", "Comfort", "Vegetarian"],
    ingredients: [
      ["cannellini beans", 2, "tins"],
      ["lacinato kale", 1, "bunch"],
      ["onions", 1, null],
      ["garlic", 3, "cloves"],
      ["vegetable stock", 6, "cups"],
      ["parmesan rind", 1, null],
      ["olive oil", 2, "tbsp"],
    ],
    instructions: [
      "Soften the onion and garlic in the oil.",
      "Add the stock, the beans and the parmesan rind, and simmer for half an hour.",
      "Mash a ladleful of beans against the side to thicken it.",
      "Stir the kale through and give it ten more minutes.",
    ],
  },
  {
    title: "Shrimp and Grits",
    description: "Twenty minutes if the grits are already on.",
    servings: 4,
    prepMinutes: 10,
    cookMinutes: 30,
    tags: ["Weeknight", "Comfort"],
    ingredients: [
      ["stone-ground grits", 1, "cup"],
      ["shrimp", 1, "lb"],
      ["bacon", 4, "slices"],
      ["sharp cheddar", 1, "cup"],
      ["scallions", 3, null],
      ["lemon", 1, null],
    ],
    instructions: [
      "Cook the grits slowly in salted water until they stop tasting raw.",
      "Render the bacon and set it aside; keep the fat.",
      "Beat the cheddar into the grits.",
      "Sear the shrimp in the bacon fat for two minutes, squeeze the lemon in, and pile it on top.",
    ],
  },
  {
    title: "Roast Tomato and Bread Soup",
    description: "What to do with the tomatoes that went soft on the sill.",
    servings: 4,
    prepMinutes: 10,
    cookMinutes: 50,
    ovenTemp: 400,
    tags: ["Vegetarian", "Comfort", "One Pot"],
    ingredients: [
      ["ripe tomatoes", 2, "lb"],
      ["stale sourdough", 4, "slices"],
      ["garlic", 4, "cloves"],
      ["basil", 1, "handful"],
      ["olive oil", 0.25, "cup"],
    ],
    instructions: [
      "Roast the tomatoes and unpeeled garlic at 400F for 40 minutes.",
      "Squeeze the garlic out of its skins and crush everything together.",
      "Tear the bread in and let it collapse into the soup over a low heat.",
      "Finish with the basil and a lot of oil.",
    ],
  },
  {
    title: "Buttermilk Pancakes",
    description: "Saturday. Do not beat the lumps out.",
    servings: 4,
    prepMinutes: 10,
    cookMinutes: 20,
    yieldNote: "Makes about 12",
    tags: ["Weeknight", "Comfort"],
    ingredients: [
      ["plain flour", 2, "cups"],
      ["buttermilk", 2, "cups"],
      ["eggs", 2, null],
      ["butter", 3, "tbsp"],
      ["baking soda", 1, "tsp"],
      ["sugar", 2, "tbsp"],
    ],
    instructions: [
      "Whisk the dry things together.",
      "Beat the buttermilk, eggs and melted butter in, stopping while it is still lumpy.",
      "Rest the batter ten minutes.",
      "Cook on a medium griddle until the bubbles stay open, then turn once.",
    ],
  },
];

/** The dishes on the plan, as offsets from Monday of the current week. */
const PLAN: [dayOffset: number, title: string][] = [
  [0, "Sheet Pan Chicken Thighs and Potatoes"],
  [1, "Cacio e Pepe"],
  [2, "White Bean and Kale Soup"],
  [3, "Shrimp and Grits"],
  [5, "Pork Shoulder Ragu"],
];

const PANTRY = [
  "Olive oil",
  "Salt",
  "Black peppercorns",
  "Plain flour",
  "Garlic",
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Eight hex characters, the same shape `publicId` gets everywhere else - but
 * derived from the title rather than drawn at random, so a dish keeps its
 * address across runs. The screenshot commands in the README name a recipe by
 * URL, and a random id would break them every time this is re-run.
 */
function publicId(title: string): string {
  return createHash("sha256").update(title).digest("hex").slice(0, 8);
}

/** Monday of the current week, at midnight UTC - what `weekStartOf` returns. */
function mondayOfThisWeek(): Date {
  const now = new Date();
  const utc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const weekday = (utc.getUTCDay() + 6) % 7;
  utc.setUTCDate(utc.getUTCDate() - weekday);
  return utc;
}

async function main() {
  const user = await prisma.user.findFirst({
    where: { email },
    select: { id: true, householdId: true },
  });

  if (!user?.householdId) {
    console.error(
      `No household for ${email}. Run \`npm run browse:seed\` first, with the app running.`,
    );
    process.exit(2);
  }

  const householdId = user.householdId;

  await prisma.household.update({
    where: { id: householdId },
    data: { name: HOUSEHOLD },
  });

  await prisma.user.update({ where: { id: user.id }, data: { name: COOK } });

  // Written fresh every run, so two runs give one library rather than two.
  await prisma.plannedMeal.deleteMany({ where: { householdId } });
  await prisma.recipe.deleteMany({ where: { householdId } });
  await prisma.pantryItem.deleteMany({ where: { householdId } });

  const byTitle = new Map<string, string>();
  const byServings = new Map<string, number>();

  for (const seed of LIBRARY) {
    const tagIds = await Promise.all(
      seed.tags.map(async (name) => {
        const tag = await prisma.tag.upsert({
          where: { slug: slugify(name) },
          update: {},
          create: { name, slug: slugify(name) },
        });
        return tag.id;
      }),
    );

    /*
     * Added a day apart, newest first, so the library is in the order the
     * array is written in: the page sorts by newest and gives the first one
     * the hero. Letting creation order decide it put the pancakes on the
     * front page, which is not what a recipe box leads with.
     */
    const addedAt = new Date(Date.now() - LIBRARY.indexOf(seed) * 86_400_000);

    const recipe = await prisma.recipe.create({
      data: {
        createdAt: addedAt,
        updatedAt: addedAt,
        publicId: publicId(seed.title),
        title: seed.title,
        description: seed.description,
        servings: seed.servings,
        prepMinutes: seed.prepMinutes ?? null,
        cookMinutes: seed.cookMinutes ?? null,
        restMinutes: seed.restMinutes ?? null,
        ovenTemp: seed.ovenTemp ?? null,
        ovenTempUnit: seed.ovenTemp ? "FAHRENHEIT" : null,
        equipment: seed.equipment ?? [],
        sourceName: seed.sourceName ?? null,
        yieldNote: seed.yieldNote ?? null,
        notes: seed.notes ?? null,
        instructions: seed.instructions,
        householdId,
        createdById: user.id,
        isShared: true,
        ingredients: {
          create: seed.ingredients.map(([name, quantity, unit], position) => ({
            name,
            quantity,
            unit,
            position,
          })),
        },
        tags: { create: tagIds.map((tagId) => ({ tagId })) },
      },
      select: { id: true },
    });

    byTitle.set(seed.title, recipe.id);
    byServings.set(seed.title, seed.servings);
  }

  const monday = mondayOfThisWeek();

  for (const [offset, title] of PLAN) {
    const recipeId = byTitle.get(title);
    if (!recipeId) continue;

    const date = new Date(monday);
    date.setUTCDate(date.getUTCDate() + offset);

    /*
     * Planned at whatever the dish itself makes, not a flat four. Planning a
     * recipe for six at four scales the list down - 1.33 tins of beans, 0.67
     * of a bunch of kale - and a shopping list full of thirds reads as a bug
     * in the arithmetic rather than as a household that cooks what the card
     * says.
     */
    const servings = byServings.get(title) ?? 4;

    await prisma.plannedMeal.create({
      data: {
        date,
        slot: "DINNER",
        servings,
        recipeId,
        householdId,
      },
    });
  }

  for (const name of PANTRY) {
    await prisma.pantryItem.create({
      data: {
        name,
        normalisedName: name.trim().toLowerCase(),
        householdId,
        createdById: user.id,
      },
    });
  }

  console.log(
    `${HOUSEHOLD}: ${LIBRARY.length} dishes, ${PLAN.length} planned, ${PANTRY.length} staples.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
