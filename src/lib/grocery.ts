import { prisma } from "./db";
import { SHOPPING_SLOTS } from "./meal-slots";

export type GroceryLine = {
  name: string;
  quantity: number | null;
  unit: string | null;
  /** Titles of the recipes that contributed to this line. Empty when none did. */
  fromRecipes: string[];
  recipeId: string | null;
  /**
   * Set when the line was typed onto the week by hand rather than coming from
   * a recipe. Carries the id so the row can offer to take it off again.
   */
  extraId?: string | null;
  /**
   * A hand-written amount, shown exactly as typed in place of quantity and
   * unit. Free text on purpose: "a big bag" is a real answer to how much.
   */
  amountLabel?: string | null;
};

/** Monday 00:00 UTC of the week containing `date`. */
export function weekStartOf(date: Date): Date {
  const utc = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  // getUTCDay: 0 = Sunday. Shift so Monday is the first day.
  const dayOffset = (utc.getUTCDay() + 6) % 7;
  utc.setUTCDate(utc.getUTCDate() - dayOffset);
  return utc;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/**
 * Units that mean the same thing written different ways. Only exact synonyms
 * are folded together - no conversion between tbsp and cups, because getting
 * that wrong silently is worse than a shopping list with two lines on it.
 */
const unitAliases: Record<string, string> = {
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  tbs: "tbsp",
  teaspoon: "tsp",
  teaspoons: "tsp",
  cups: "cup",
  gram: "g",
  grams: "g",
  kilogram: "kg",
  kilograms: "kg",
  pound: "lb",
  pounds: "lb",
  lbs: "lb",
  ounce: "oz",
  ounces: "oz",
  milliliter: "ml",
  milliliters: "ml",
  liter: "l",
  liters: "l",
  clove: "cloves",
};

export function normaliseUnit(unit: string | null | undefined): string | null {
  const value = unit?.trim().toLowerCase();
  if (!value) return null;
  return unitAliases[value] ?? value;
}

/**
 * Exported because exclusions have to match names the same way aggregation
 * groups them. Two different notions of "the same ingredient" would mean
 * skipping "Olive Oil" and still seeing "olive oil" on the list.
 */
export function normaliseName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Roll a week's planned meals up into a shopping list.
 *
 * Quantities are scaled by how many servings were planned against how many the
 * recipe makes, then merged across recipes when the name and unit agree.
 *
 * Lines with no quantity ("salt to taste") are kept separate from lines with
 * one, rather than being merged into a total that would be wrong: adding "2 tbsp
 * butter" to "butter, to taste" and printing "2 tbsp" loses the second
 * instruction entirely.
 */
export function aggregateIngredients(
  meals: {
    servings: number;
    recipe: {
      id: string;
      title: string;
      servings: number;
      ingredients: {
        name: string;
        quantity: number | null;
        unit: string | null;
      }[];
    } | null;
  }[],
  /** What to leave off the list entirely. */
  excluded: Exclusions = NOTHING_EXCLUDED,
): GroceryLine[] {
  const merged = new Map<string, GroceryLine>();

  for (const meal of meals) {
    if (!meal.recipe) continue;

    // A recipe claiming zero servings would divide by zero; treat it as 1.
    const recipeServings = meal.recipe.servings > 0 ? meal.recipe.servings : 1;
    const scale = meal.servings / recipeServings;

    for (const ingredient of meal.recipe.ingredients) {
      const unit = normaliseUnit(ingredient.unit);
      const name = normaliseName(ingredient.name);
      if (!name) continue;

      // Excluded before merging, so a staple contributed by three recipes
      // disappears once rather than leaving a merged line behind.
      if (excluded.has(name)) continue;

      const hasQuantity =
        ingredient.quantity != null && ingredient.quantity > 0;
      // Unquantified lines get their own bucket so they cannot absorb a total.
      const key = `${name}|${unit ?? ""}|${hasQuantity ? "q" : "noq"}`;

      const existing = merged.get(key);
      const scaled = hasQuantity
        ? roundQuantity(ingredient.quantity! * scale)
        : null;

      if (!existing) {
        merged.set(key, {
          name: ingredient.name.trim(),
          quantity: scaled,
          unit: ingredient.unit?.trim() || null,
          fromRecipes: [meal.recipe.title],
          recipeId: meal.recipe.id,
        });
        continue;
      }

      if (scaled != null) {
        existing.quantity = roundQuantity((existing.quantity ?? 0) + scaled);
      }
      if (!existing.fromRecipes.includes(meal.recipe.title)) {
        existing.fromRecipes.push(meal.recipe.title);
      }
      // Once two recipes contribute, the line is no longer attributable to one.
      if (existing.recipeId !== meal.recipe.id) existing.recipeId = null;
    }
  }

  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Two decimals is enough for a shopping list, and avoids 0.30000000000000004. */
function roundQuantity(value: number): number {
  return Math.round(value * 100) / 100;
}

export type PlannedMealWithRecipe = Awaited<
  ReturnType<typeof getWeekPlan>
>[number];

/**
 * Re-exported so server code that already reaches for grocery.ts keeps working.
 * The definitions live in meal-slots.ts, which imports nothing, because the
 * planner is a client component and this module reaches Prisma on line one.
 */
export {
  DINNER_SLOTS,
  SIDE_SLOTS,
  SHOPPING_SLOTS,
  FIRST_DINNER,
} from "./meal-slots";

export async function getWeekPlan(weekStart: Date, householdId: string) {
  return prisma.plannedMeal.findMany({
    where: {
      householdId,
      date: { gte: weekStart, lt: addDays(weekStart, 7) },
      slot: { in: [...SHOPPING_SLOTS] },
    },
    include: {
      recipe: {
        include: { ingredients: { orderBy: { position: "asc" } } },
      },
    },
    orderBy: [{ date: "asc" }, { slot: "asc" }],
  });
}

export type WeeklySkipRecord = {
  id: string;
  name: string;
  normalisedName: string;
};

/**
 * Ingredients marked "got it" for this week specifically.
 *
 * Pantry staples are not in here. They are a separate, permanent list, and
 * folding the two together was what made "always have" reachable only by
 * dismissing a row that had already appeared.
 */
export async function getWeeklySkips(
  weekStart: Date,
  householdId: string,
): Promise<WeeklySkipRecord[]> {
  return prisma.weeklySkip.findMany({
    where: { householdId, weekStart },
    orderBy: { name: "asc" },
    select: { id: true, name: true, normalisedName: true },
  });
}

/** Decides whether a normalised ingredient name belongs on the list. */
export type Exclusions = { has(normalisedName: string): boolean };

export const NOTHING_EXCLUDED: Exclusions = { has: () => false };

/**
 * Everything to keep off this week's list: the permanent pantry, plus what has
 * already been picked up this week.
 *
 * The two match differently, on purpose.
 *
 * A weekly skip matches exactly. You ticked off the line as it was printed, and
 * that is all you meant.
 *
 * A pantry staple matches on the head of the phrase, in either direction,
 * because the name in the cupboard and the name on the card are rarely the same
 * words. "Coarse salt" in the pantry has to cover a recipe asking for "salt",
 * and "olive oil" has to cover "extra virgin olive oil".
 *
 * Matching the head - the last word, which is what an English noun phrase is
 * actually about - rather than any run of words is what keeps this honest.
 * "Egg noodles" contains "egg" but is not eggs, and would have been quietly
 * dropped from the list by a looser rule; its head is "noodles", so it stays.
 * Likewise "granulated sugar" in the pantry does not hide "brown sugar", and
 * "salt" does not swallow "salted butter".
 */
export function buildExclusions(
  pantry: { normalisedName: string }[],
  weeklySkips: { normalisedName: string }[],
): Exclusions {
  const exact = new Set(weeklySkips.map((skip) => skip.normalisedName));
  const staples = pantry
    .map((item) => words(item.normalisedName))
    .filter((tokens) => tokens.length > 0);

  return {
    has(normalisedName: string): boolean {
      if (exact.has(normalisedName)) return true;

      const tokens = words(normalisedName);
      if (tokens.length === 0) return false;

      return staples.some(
        (staple) => endsWith(tokens, staple) || endsWith(staple, tokens),
      );
    },
  };
}

/**
 * Split into comparable words.
 *
 * Trailing plurals are dropped so "eggs" in the pantry covers a recipe calling
 * for an "egg". Both sides get the same treatment, so it does not matter that
 * the rule is crude - only that it is applied consistently. Words ending in
 * "ss" are left alone, or "glass" would become "glas".
 */
function words(value: string): string[] {
  return value
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((word) =>
      word.length > 3 && word.endsWith("s") && !word.endsWith("ss")
        ? word.slice(0, -1)
        : word,
    );
}

/**
 * Does `phrase` end with `suffix`?
 *
 * The head of an English noun phrase is its last word, so this asks whether the
 * two names are about the same thing: "extra virgin olive oil" and "olive oil"
 * are, "egg noodles" and "eggs" are not.
 */
function endsWith(phrase: string[], suffix: string[]): boolean {
  if (suffix.length === 0 || suffix.length > phrase.length) return false;

  const offset = phrase.length - suffix.length;
  return suffix.every((word, index) => phrase[offset + index] === word);
}
