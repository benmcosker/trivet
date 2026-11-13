import { prisma } from "../db";
import { addDays, weekStartOf } from "../grocery";
import { listPantryItems } from "../pantry";
import type { RecipeCourse } from "@/generated/prisma/enums";
import {
  getRecipe,
  searchRecipes,
  slugifyTag,
  type RecipeWithRelations,
} from "../recipes";
import { recipePath } from "../recipe-url";
import { weekShoppingList } from "../week-list";

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
