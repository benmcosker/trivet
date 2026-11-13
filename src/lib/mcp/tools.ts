import { prisma } from "../db";
import { addExtraItem } from "../extras";
import { addDays, weekStartOf } from "../grocery";
import { DINNER_SLOTS } from "../meal-slots";
import { addPantryItem, listPantryItems } from "../pantry";
import { planDate, planMeal, plannerLibrary } from "../plan-mutations";
import type { RecipeCourse } from "@/generated/prisma/enums";
import {
  getRecipe,
  searchRecipes,
  slugifyTag,
  type RecipeWithRelations,
} from "../recipes";
import { recipePath } from "../recipe-url";
import { suggestDinners } from "../suggest-dinners";
import { weekShoppingList } from "../week-list";

import { recordAssistantAction } from "./activity";
import { siteOrigin } from "./resource";

/**
 * What Trivet's MCP tools answer with (MCP-PLAN.md). Each takes the signed-in
 * person's household and goes through the same functions the website uses,
 * so an assistant sees exactly what the person sees: their household's
 * recipes and the shared library, minus hidden households, and nothing of
 * any other household's own.
 *
 * Kept apart from the MCP plumbing so each can be tested against the database
 * on its own.
 */

export type ToolContext = { householdId: string };

/** Who is writing: the person, and the assistant acting for them. */
export type WriterContext = ToolContext & { userId: string; clientId: string };

/** Slots an assistant may plan: the evening's three mains and its side. */
export const PLANNABLE_SLOTS = [...DINNER_SLOTS, "SIDE"] as const;

const COURSES = [
  "DINNER",
  "SIDE",
  "BREAKFAST",
  "DESSERT",
  "SNACK",
  "OTHER",
] as const satisfies readonly RecipeCourse[];
export { COURSES };

/** A recipe in a list: enough to choose by. */
function summary(recipe: RecipeWithRelations) {
  const minutes = (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0);
  return {
    id: recipe.publicId,
    title: recipe.title,
    course: recipe.course ?? null,
    totalMinutes: minutes > 0 ? minutes : null,
    servings: recipe.servings,
    rating: recipe.reviews.average,
    ratings: recipe.reviews.count,
    tags: recipe.tags.map(({ tag }) => tag.name),
    fromHousehold: recipe.household.name,
    url: `${siteOrigin()}${recipePath(recipe)}`,
  };
}

export async function searchRecipesTool(
  ctx: ToolContext,
  input: {
    query?: string;
    tag?: string;
    course?: (typeof COURSES)[number];
    limit?: number;
  },
) {
  const limit = Math.min(Math.max(input.limit ?? 10, 1), 25);
  // The search covers titles, descriptions, method and ingredients, so an
  // ingredient ("grouper") is a query like any other.
  const recipes = await searchRecipes({
    householdId: ctx.householdId,
    query: input.query,
    tagSlugs: input.tag ? [slugifyTag(input.tag)] : undefined,
    limit: input.course ? 100 : limit,
  });
  const matching = input.course
    ? recipes.filter((r) => r.course === input.course)
    : recipes;
  return { recipes: matching.slice(0, limit).map(summary) };
}

export async function getRecipeTool(ctx: ToolContext, input: { id: string }) {
  const recipe = await getRecipe(input.id, ctx.householdId);
  if (!recipe) return null;
  const hasNutrition = recipe.caloriesKcal != null;
  return {
    ...summary(recipe),
    description: recipe.description,
    prepMinutes: recipe.prepMinutes,
    cookMinutes: recipe.cookMinutes,
    restMinutes: recipe.restMinutes,
    oven: recipe.ovenTemp
      ? `${recipe.ovenTemp}°${recipe.ovenTempUnit === "FAHRENHEIT" ? "F" : "C"}`
      : null,
    yield: recipe.yieldNote,
    equipment: recipe.equipment,
    ingredients: recipe.ingredients.map((i) => ({
      quantity: i.quantity,
      unit: i.unit,
      name: i.name,
      note: i.note,
    })),
    method: recipe.instructions,
    notes: recipe.notes,
    nutritionPerServing: hasNutrition
      ? {
          caloriesKcal: recipe.caloriesKcal,
          proteinG: recipe.proteinG,
          carbsG: recipe.carbsG,
          fatG: recipe.fatG,
          estimated: recipe.nutritionEstimated,
        }
      : null,
    source: recipe.sourceUrl ?? recipe.sourceName ?? null,
  };
}

/** The Monday of the week holding `weekOf` (today when absent). */
function weekOf(input?: string): Date {
  const date = input ? new Date(`${input}T00:00:00.000Z`) : new Date();
  return weekStartOf(Number.isNaN(date.getTime()) ? new Date() : date);
}

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

export async function getWeekTool(
  ctx: ToolContext,
  input: { weekOf?: string },
) {
  const start = weekOf(input.weekOf);
  const meals = await prisma.plannedMeal.findMany({
    where: {
      householdId: ctx.householdId,
      date: { gte: start, lt: addDays(start, 7) },
    },
    include: { recipe: { select: { publicId: true, title: true } } },
    orderBy: [{ date: "asc" }, { slot: "asc" }],
  });
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = isoDay(addDays(start, i));
    return {
      date,
      meals: meals
        .filter((m) => isoDay(m.date) === date)
        .map((m) => ({
          slot: m.slot,
          servings: m.servings,
          recipe: m.recipe
            ? { id: m.recipe.publicId, title: m.recipe.title }
            : null,
        })),
    };
  });
  return { weekStarting: isoDay(start), days };
}

export async function getShoppingListTool(
  ctx: ToolContext,
  input: { weekOf?: string },
) {
  const start = weekOf(input.weekOf);
  const lines = await weekShoppingList(start, ctx.householdId);
  return {
    weekStarting: isoDay(start),
    items: lines.map((line) => ({
      name: line.name,
      quantity: line.quantity,
      unit: line.unit,
      forRecipes: line.fromRecipes,
      addedByHand: Boolean(line.extraId),
    })),
    note: "Pantry staples and anything ticked off for the week are already left out.",
  };
}

export async function getPantryTool(ctx: ToolContext) {
  const items = await listPantryItems(ctx.householdId);
  return { pantry: items.map((item) => item.name) };
}

const today = () => new Date().toISOString().slice(0, 10);

/**
 * A dinner for each open evening of a week, from today on, by Trivet's own
 * ranking (`suggest-dinners.ts`): dinners only, nothing rated low here,
 * nothing already on the week, variety across the evenings. Proposes only;
 * nothing is planned until `plan_dinner` is called.
 */
export async function suggestDinnersTool(
  ctx: ToolContext,
  input: { weekOf?: string },
) {
  const start = weekOf(input.weekOf);
  const [library, meals] = await Promise.all([
    plannerLibrary(ctx.householdId, start),
    prisma.plannedMeal.findMany({
      where: {
        householdId: ctx.householdId,
        date: { gte: start, lt: addDays(start, 7) },
        slot: { in: [...DINNER_SLOTS] },
      },
      select: { date: true, slot: true, recipeId: true },
    }),
  ]);

  const plannedThisWeek = meals.flatMap((m) =>
    m.recipeId
      ? [{ dateIso: isoDay(m.date), slot: m.slot, recipeId: m.recipeId }]
      : [],
  );
  const taken = new Set(meals.map((m) => isoDay(m.date)));
  const evenings = Array.from({ length: 7 }, (_, i) =>
    isoDay(addDays(start, i)),
  ).filter((date) => date >= today() && !taken.has(date));

  const rows = suggestDinners(library, { evenings, plannedThisWeek });
  return {
    weekStarting: isoDay(start),
    suggestions: rows.map((row) => ({
      date: row.dateIso,
      recipe: row.pick
        ? {
            id: row.pick.recipe.publicId,
            title: row.pick.recipe.title,
            totalMinutes: row.pick.recipe.totalMinutes,
          }
        : null,
      why: row.pick?.reason ?? null,
    })),
    note:
      evenings.length === 0
        ? "Every evening left this week already has a dinner."
        : "Nothing is planned yet. Ask the person, then plan the ones they want with plan_dinner.",
  };
}

/**
 * Put a recipe on a day, or clear that slot. The planner's own logic
 * (`plan-mutations.ts`): only recipes this household can see, servings from
 * the household. Says what it replaced, so nothing changes unseen.
 */
export async function planDinnerTool(
  ctx: WriterContext,
  input: {
    date: string;
    recipeId?: string;
    clear?: boolean;
    slot?: (typeof PLANNABLE_SLOTS)[number];
  },
) {
  const slot = input.slot ?? "DINNER";
  const date = planDate(input.date);
  if (!date)
    return { ok: false as const, error: "Give the date as YYYY-MM-DD." };
  if (!input.clear && !input.recipeId) {
    return { ok: false as const, error: "Give a recipe id, or clear: true." };
  }

  const recipe = input.clear
    ? null
    : await getRecipe(input.recipeId!, ctx.householdId);
  if (!input.clear && !recipe) {
    return { ok: false as const, error: "No recipe with that id here." };
  }

  const before = await prisma.plannedMeal.findFirst({
    where: { householdId: ctx.householdId, date, slot },
    select: { recipe: { select: { title: true } }, customTitle: true },
  });
  const replaced = before?.recipe?.title ?? before?.customTitle ?? null;

  const result = await planMeal(ctx.householdId, {
    date: input.date,
    slot,
    recipeId: recipe?.id ?? null,
  });
  if (!result.ok) return result;

  const where = `${slot === "SIDE" ? "the side" : "dinner"} on ${input.date}`;
  const summary = result.cleared
    ? replaced
      ? `Took ${replaced} off ${where}`
      : null
    : `Planned ${result.recipe.title} for ${where}`;
  if (summary) {
    await recordAssistantAction({
      userId: ctx.userId,
      clientId: ctx.clientId,
      tool: "plan_dinner",
      summary,
    });
  }

  return result.cleared
    ? { ok: true as const, cleared: true, removed: replaced }
    : {
        ok: true as const,
        planned: result.recipe.title,
        date: input.date,
        slot,
        servings: result.servings,
        replaced: replaced === result.recipe.title ? null : replaced,
      };
}

export async function addPantryItemTool(
  ctx: WriterContext,
  input: { name: string },
) {
  const result = await addPantryItem(input.name, ctx.householdId, ctx.userId);
  if (!result.ok) return result;
  await recordAssistantAction({
    userId: ctx.userId,
    clientId: ctx.clientId,
    tool: "add_pantry_item",
    summary: `Added ${result.item.name} to the pantry`,
  });
  return { ok: true as const, pantryItem: result.item.name };
}

export async function addToListTool(
  ctx: WriterContext,
  input: { name: string; amount?: string; weekOf?: string },
) {
  const start = weekOf(input.weekOf);
  const result = await addExtraItem(
    { name: input.name, amount: input.amount ?? null },
    start,
    ctx.householdId,
    ctx.userId,
  );
  if (!result.ok) return result;
  await recordAssistantAction({
    userId: ctx.userId,
    clientId: ctx.clientId,
    tool: "add_to_list",
    summary: `Added ${result.item.name} to the list for the week of ${isoDay(start)}`,
  });
  return {
    ok: true as const,
    added: result.item.name,
    amount: result.item.amount,
    weekStarting: isoDay(start),
  };
}

/**
 * A trivetbox.com link that opens Add a recipe already reading a page.
 * Saves nothing: the person reviews the recipe and saves it themselves.
 */
export function importRecipeLinkTool(input: { url: string }) {
  let page: URL;
  try {
    page = new URL(input.url);
  } catch {
    return { ok: false as const, error: "That isn't a web address." };
  }
  if (page.protocol !== "https:" && page.protocol !== "http:") {
    return { ok: false as const, error: "Only web pages can be imported." };
  }
  return {
    ok: true as const,
    link: `${siteOrigin()}/upload?url=${encodeURIComponent(page.toString())}`,
    note: "Give the person this link. Trivet reads the page and shows the recipe for them to check and save; nothing is saved until they do.",
  };
}
