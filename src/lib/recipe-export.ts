import { prisma } from "./db";
import { formatAmount } from "./quantity";
import { COURSE_LABEL } from "./recipe-schema";

/**
 * "Download our recipes": a household's own recipes as a file it keeps.
 *
 * The terms promise it: if Trivet closes, everyone can take their recipes
 * with them until it does. So the file must make sense with Trivet gone, which
 * is why there are no photos (they would be links into Trivet's storage) and
 * nothing that needs Trivet to read.
 *
 * Two shapes of the same recipes:
 * - **A page** (`.html`): opens in any browser, prints, and reads like the
 *   recipe page. For people.
 * - **Recipe data** (`.json`): schema.org `Recipe` objects in JSON-LD, the
 *   format recipe sites publish and other recipe apps import. For moving.
 *
 * Only the household's own recipes: not the shared library, and not recipes
 * other households shared with it, which are theirs to keep.
 */

export type ExportRecipe = Awaited<ReturnType<typeof householdRecipes>>[number];

export async function householdRecipes(householdId: string) {
  return prisma.recipe.findMany({
    where: { householdId },
    orderBy: { title: "asc" },
    select: {
      title: true,
      description: true,
      servings: true,
      yieldNote: true,
      prepMinutes: true,
      cookMinutes: true,
      restMinutes: true,
      ovenTemp: true,
      ovenTempUnit: true,
      course: true,
      equipment: true,
      instructions: true,
      notes: true,
      sourceUrl: true,
      sourceName: true,
      caloriesKcal: true,
      proteinG: true,
      carbsG: true,
      fatG: true,
      nutritionEstimated: true,
      createdAt: true,
      ingredients: {
        orderBy: { position: "asc" },
        select: { name: true, quantity: true, unit: true, note: true },
      },
      tags: { select: { tag: { select: { name: true } } } },
    },
  });
}

/** How many recipes the download would hold. */
export function householdRecipeCount(householdId: string): Promise<number> {
  return prisma.recipe.count({ where: { householdId } });
}

/**
 * "2 cups flour, sifted". A unit with no number ("to taste", "a pinch") reads
 * better after the name: "salt, to taste".
 */
export function ingredientLine(ingredient: {
  name: string;
  quantity: number | null;
  unit: string | null;
  note: string | null;
}): string {
  const { name, quantity, unit, note } = ingredient;
  const line =
    quantity == null
      ? [name, unit].filter(Boolean).join(", ")
      : `${formatAmount(quantity, unit)} ${name}`;
  return note ? `${line}, ${note}` : line;
}

/** ISO 8601 duration, as schema.org wants it: 75 minutes is "PT1H15M". */
export function isoDuration(minutes: number | null): string | undefined {
  if (minutes == null || minutes <= 0) return undefined;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `PT${hours ? `${hours}H` : ""}${rest ? `${rest}M` : ""}`;
}

/** "1 hr 15 min", for the page. */
function minutesLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return [hours ? `${hours} hr` : "", rest ? `${rest} min` : ""]
    .filter(Boolean)
    .join(" ");
}

function ovenLabel(recipe: ExportRecipe): string | null {
  if (recipe.ovenTemp == null) return null;
  return `${recipe.ovenTemp}°${recipe.ovenTempUnit === "CELSIUS" ? "C" : "F"}`;
}

function tagNames(recipe: ExportRecipe): string[] {
  return recipe.tags.map((t) => t.tag.name);
}

/** One recipe as a schema.org Recipe. Empty fields are left out. */
export function toSchemaRecipe(recipe: ExportRecipe): Record<string, unknown> {
  const total =
    (recipe.prepMinutes ?? 0) +
    (recipe.cookMinutes ?? 0) +
    (recipe.restMinutes ?? 0);
  const hasNutrition =
    recipe.caloriesKcal != null ||
    recipe.proteinG != null ||
    recipe.carbsG != null ||
    recipe.fatG != null;

  const fields: Record<string, unknown> = {
    "@type": "Recipe",
    name: recipe.title,
    description: recipe.description ?? undefined,
    recipeYield: recipe.yieldNote ?? `${recipe.servings} servings`,
    prepTime: isoDuration(recipe.prepMinutes),
    cookTime: isoDuration(recipe.cookMinutes),
    totalTime: isoDuration(total),
    recipeCategory: recipe.course ? COURSE_LABEL[recipe.course] : undefined,
    keywords: tagNames(recipe).join(", ") || undefined,
    tool: recipe.equipment.length ? recipe.equipment : undefined,
    recipeIngredient: recipe.ingredients.map(ingredientLine),
    recipeInstructions: recipe.instructions.map((text) => ({
      "@type": "HowToStep",
      text,
    })),
    nutrition: hasNutrition
      ? {
          "@type": "NutritionInformation",
          calories:
            recipe.caloriesKcal != null
              ? `${recipe.caloriesKcal} calories`
              : undefined,
          proteinContent:
            recipe.proteinG != null ? `${recipe.proteinG} g` : undefined,
          carbohydrateContent:
            recipe.carbsG != null ? `${recipe.carbsG} g` : undefined,
          fatContent: recipe.fatG != null ? `${recipe.fatG} g` : undefined,
        }
      : undefined,
    isBasedOn: recipe.sourceUrl ?? recipe.sourceName ?? undefined,
    comment: recipe.notes
      ? { "@type": "Comment", text: recipe.notes }
      : undefined,
    dateCreated: recipe.createdAt.toISOString(),
  };
  // JSON.stringify drops undefined, but a tidy object is easier to test.
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  );
}

/** All of them, as one JSON-LD document. */
export function toRecipeData(recipes: ExportRecipe[]): string {
  return JSON.stringify(
    {
      "@context": "https://schema.org",
      "@graph": recipes.map(toSchemaRecipe),
    },
    null,
    2,
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Only http and https addresses become links; anything else is text. */
function sourceHtml(recipe: ExportRecipe): string | null {
  const name = recipe.sourceName ? escapeHtml(recipe.sourceName) : null;
  const url = recipe.sourceUrl;
  if (url && /^https?:\/\//i.test(url)) {
    return `<a href="${escapeHtml(url)}">${name ?? escapeHtml(url)}</a>`;
  }
  return name;
}

function recipeHtml(recipe: ExportRecipe, index: number): string {
  const facts = [
    recipe.yieldNote ?? `Serves ${recipe.servings}`,
    recipe.prepMinutes ? `Prep ${minutesLabel(recipe.prepMinutes)}` : null,
    recipe.cookMinutes ? `Cook ${minutesLabel(recipe.cookMinutes)}` : null,
    recipe.restMinutes ? `Rest ${minutesLabel(recipe.restMinutes)}` : null,
    ovenLabel(recipe) ? `Oven ${ovenLabel(recipe)}` : null,
    recipe.course ? COURSE_LABEL[recipe.course] : null,
  ].filter((fact): fact is string => Boolean(fact));

  const nutrition = [
    recipe.caloriesKcal != null ? `${recipe.caloriesKcal} kcal` : null,
    recipe.proteinG != null ? `${recipe.proteinG} g protein` : null,
    recipe.carbsG != null ? `${recipe.carbsG} g carbs` : null,
    recipe.fatG != null ? `${recipe.fatG} g fat` : null,
  ].filter((part): part is string => Boolean(part));

  const source = sourceHtml(recipe);
  const tags = tagNames(recipe);

  return `<article id="r${index}">
<h2>${escapeHtml(recipe.title)}</h2>
${recipe.description ? `<p class="lede">${escapeHtml(recipe.description)}</p>` : ""}
<p class="facts">${facts.map(escapeHtml).join(" · ")}</p>
${recipe.ingredients.length ? `<h3>Ingredients</h3>\n<ul>${recipe.ingredients.map((i) => `<li>${escapeHtml(ingredientLine(i))}</li>`).join("")}</ul>` : ""}
${recipe.equipment.length ? `<h3>Equipment</h3>\n<p>${recipe.equipment.map(escapeHtml).join(", ")}</p>` : ""}
${recipe.instructions.length ? `<h3>Method</h3>\n<ol>${recipe.instructions.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>` : ""}
${recipe.notes ? `<h3>Notes</h3>\n<p class="notes">${escapeHtml(recipe.notes)}</p>` : ""}
${nutrition.length ? `<p class="small">Per serving${recipe.nutritionEstimated ? " (estimated)" : ""}: ${nutrition.join(", ")}</p>` : ""}
${source ? `<p class="small">From ${source}</p>` : ""}
${tags.length ? `<p class="small">${tags.map(escapeHtml).join(", ")}</p>` : ""}
</article>`;
}

/** All of them, as one page that opens in any browser and prints cleanly. */
export function toRecipePage(
  recipes: ExportRecipe[],
  householdName: string,
  on: Date,
): string {
  const title = `${householdName}: recipes from Trivet`;
  const date = on.toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
body { font: 17px/1.55 Georgia, "Times New Roman", serif; color: #1c1a17; background: #f7f4ed; max-width: 42rem; margin: 0 auto; padding: 2rem 1rem 4rem; }
h1 { font-size: 2rem; margin: 0 0 .25rem; }
h2 { font-size: 1.6rem; margin: 0 0 .25rem; }
h3 { font: 600 .8rem/1.4 system-ui, sans-serif; letter-spacing: .1em; text-transform: uppercase; color: #8a4b2a; margin: 1.5rem 0 .5rem; }
.small, .facts, nav { font: .9rem/1.5 system-ui, sans-serif; color: #5c554b; }
.lede { font-style: italic; }
.notes { white-space: pre-wrap; }
article { border-top: 1px solid #d8d1c3; padding-top: 2rem; margin-top: 2rem; }
nav ol { columns: 2; padding-left: 1.2rem; }
a { color: #2f6f4e; }
@media print { body { background: #fff; } article { break-before: page; border: 0; margin: 0; } nav { display: none; } }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<p class="small">${recipes.length} ${recipes.length === 1 ? "recipe" : "recipes"}, downloaded ${escapeHtml(date)}.</p>
<nav><ol>${recipes.map((r, i) => `<li><a href="#r${i}">${escapeHtml(r.title)}</a></li>`).join("")}</ol></nav>
${recipes.map(recipeHtml).join("\n")}
</body>
</html>
`;
}

/** "trivet-recipes-2026-11-20.html". */
export function exportFileName(on: Date, extension: "html" | "json"): string {
  return `trivet-recipes-${on.toISOString().slice(0, 10)}.${extension}`;
}
