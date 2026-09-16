"use server";

import { revalidatePath } from "next/cache";

import type { MealSlot, ShoppingProvider } from "@/generated/prisma/enums";
import { sideMarker } from "@/lib/side-marker";
import { prisma } from "@/lib/db";
import { weekStartOf } from "@/lib/grocery";
import { FIRST_DINNER } from "@/lib/meal-slots";
import { visibleRecipes } from "@/lib/recipe-visibility";
import { weekShoppingList } from "@/lib/week-list";
import { getProvider, type HandoffResult } from "@/lib/shopping";
import { createRecipe } from "@/lib/recipe-mutations";
import { recipeInput } from "@/lib/recipe-schema";
import { listPantryItems } from "@/lib/pantry";
import { suggestSides } from "@/lib/side-suggestions";
import { findSide } from "@/lib/sides";
import { textShoppingList } from "@/lib/sms/shopping-list";
import { requireHousehold } from "@/lib/session";

export async function setPlannedMealAction(input: {
  date: string;
  slot: MealSlot;
  recipeId: string | null;
  servings: number;
}): Promise<void> {
  const { householdId } = await requireHousehold();

  const date = new Date(`${input.date}T00:00:00.000Z`);

  if (!input.recipeId) {
    // Clearing a slot: delete rather than storing an empty row.
    await prisma.plannedMeal.deleteMany({
      where: { householdId, date, slot: input.slot },
    });
  } else {
    /*
     * Anything this household can see can be planned - its own, and whatever
     * other households have shared. Checked rather than trusted: the id comes
     * from a form post, so without this a guessed id would put another
     * family's private dish on the week and its ingredients on the shopping
     * list, which is a way of reading a recipe without opening it.
     *
     * A reference, not a copy. The plan stores the id, so the owner's later
     * edits reach a meal somebody else has already planned - which is the
     * point of sharing rather than handing out duplicates.
     */
    const recipe = await prisma.recipe.findFirst({
      where: { AND: [{ id: input.recipeId }, visibleRecipes(householdId)] },
      select: { id: true },
    });
    if (!recipe) return;

    await prisma.plannedMeal.upsert({
      where: {
        householdId_date_slot: { householdId, date, slot: input.slot },
      },
      create: {
        householdId,
        date,
        slot: input.slot,
        recipeId: input.recipeId,
        servings: input.servings,
      },
      update: { recipeId: input.recipeId, servings: input.servings },
    });
  }

  revalidatePath("/plan");
}

/**
 * Hand this week's list to a shop.
 *
 * What comes back depends on the provider: Instacart returns a prepared cart,
 * Amazon returns per-ingredient search links because it has no ordering API.
 * The result type keeps those distinct so the UI cannot present one as the
 * other.
 */
export async function sendWeekToProviderAction(
  weekStartIso: string,
  providerId: ShoppingProvider,
): Promise<HandoffResult> {
  const user = await requireHousehold();

  const weekStart = weekStartOf(new Date(weekStartIso));
  const lines = await weekShoppingList(weekStart, user.householdId);

  if (lines.length === 0) {
    return {
      ok: false,
      error: "Nothing on the list this week, so there is nothing to send.",
    };
  }

  const result = await getProvider(providerId).handoff(lines, weekStart);
  if (!result.ok) return result;

  // Record the hand-off. The shop owns everything after this point, so this is
  // the last thing we can know about an order.
  await prisma.shoppingHandoff.create({
    data: {
      provider: providerId,
      weekStart,
      url: result.kind === "cart" ? result.url : null,
      itemCount: lines.length,
      householdId: user.householdId,
      createdById: user.id,
    },
  });

  revalidatePath("/plan");
  return result;
}

export type TextListActionResult =
  { ok: true; message: string } | { ok: false; error: string };

/**
 * Text this week's shopping to everyone in the household who has a number.
 *
 * The week is taken from the client, the list is not: what gets sent is what
 * the plan says now, rather than what a page rendered some minutes ago and may
 * have been left open through.
 */
export async function textShoppingListAction(
  weekStartIso: string,
): Promise<TextListActionResult> {
  const user = await requireHousehold();
  const weekStart = weekStartOf(new Date(weekStartIso));

  let result;
  try {
    result = await textShoppingList({
      householdId: user.householdId,
      createdById: user.id,
      weekStart,
      weekLabel: `week of ${weekStart.toISOString().slice(0, 10)}`,
    });
  } catch (error) {
    console.error("[sms] could not text the shopping list", error);
    return { ok: false, error: "The message could not be sent. Try again." };
  }

  if (!result.ok) return result;

  const parts = result.parts === 1 ? "" : ` in ${result.parts} messages`;
  const sent = `Sent to ${formatNames(result.delivered)}${parts}.`;
  const failed = result.failed.length
    ? ` Could not reach ${formatNames(result.failed.map((f) => f.name))}: ${result.failed[0].error}`
    : "";
  // Named apart, because the two gaps need different things doing about them.
  const noNumber = result.withoutNumber.length
    ? ` ${formatNames(result.withoutNumber)} ${result.withoutNumber.length === 1 ? "has" : "have"} no number saved.`
    : "";
  const noConsent = result.withoutConsent.length
    ? ` ${formatNames(result.withoutConsent)} ${result.withoutConsent.length === 1 ? "has" : "have"} not agreed to be texted.`
    : "";

  // Said before the gaps, because it is the only one that changed something:
  // their consent has just been cleared, and the planner will show them as not
  // agreed from now on.
  const stopped = result.unsubscribed.length
    ? ` ${formatNames(result.unsubscribed)} ${result.unsubscribed.length === 1 ? "has" : "have"} replied STOP and will no longer be texted.`
    : "";

  return {
    ok: true,
    message: `${sent}${failed}${stopped}${noNumber}${noConsent}`,
  };
}

/** "Ben", "Ben and Laura", "Ben, Laura and Pat". */
function formatNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "nobody";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export type AcceptSideResult =
  { ok: true; title: string } | { ok: false; error: string };

/**
 * Take a suggested side and make it real.
 *
 * The side becomes an ordinary recipe belonging to this household - editable,
 * rateable, and shoppable like anything else - rather than a special kind of
 * row that every other query would have to know about. Nothing from the
 * catalogue exists in anybody's library until this runs, which is the same
 * bargain the suggested pantry staples make.
 *
 * Accepting the same side twice reuses the recipe rather than making a second
 * copy: the catalogue id is remembered in sourceName, which is also what tells
 * a reader six months later where an unfamiliar recipe came from.
 */
export async function acceptSideAction(
  weekStartIso: string,
  dateIso: string,
  sideId: string,
): Promise<AcceptSideResult> {
  const { householdId, id: userId } = await requireHousehold();

  const side = findSide(sideId);
  if (!side) return { ok: false, error: "That side is no longer offered." };

  const marker = sideMarker(side.id);
  const date = new Date(`${dateIso}T00:00:00.000Z`);

  try {
    const existing = await prisma.recipe.findFirst({
      where: { householdId, sourceName: marker },
      select: { id: true },
    });

    const recipeId =
      existing?.id ??
      (await createRecipe(
        recipeInput.parse({
          title: side.title,
          description: side.description,
          servings: side.servings,
          prepMinutes: side.prepMinutes,
          cookMinutes: side.cookMinutes,
          ovenTemp: side.ovenTemp ?? null,
          ovenTempUnit: side.ovenTempUnit ?? null,
          equipment: side.equipment,
          sourceName: marker,
          instructions: side.instructions,
          ingredients: side.ingredients,
          tags: side.tags,
        }),
        householdId,
        userId,
      ));

    await prisma.plannedMeal.upsert({
      where: { householdId_date_slot: { householdId, date, slot: "SIDE" } },
      create: {
        householdId,
        date,
        slot: "SIDE",
        recipeId,
        servings: side.servings,
      },
      update: { recipeId, servings: side.servings },
    });
  } catch (error) {
    console.error("[sides] could not add the side", error);
    return { ok: false, error: "That side could not be added. Try again." };
  }

  revalidatePath("/plan");
  revalidatePath("/recipes");
  void weekStartIso;
  return { ok: true, title: side.title };
}

export type SideOption = {
  id: string;
  title: string;
  description: string;
  reasons: string[];
  minutes: number;
};

/**
 * What to put beside the dinner planned on one day.
 *
 * Worked out when asked rather than for all seven days up front: it needs the
 * main's ingredients, equipment and oven temperature, and loading all of that
 * for a week nobody is going to ask about is a lot of query for a button that
 * is mostly not pressed.
 */
export async function suggestSidesForDayAction(
  dateIso: string,
): Promise<SideOption[]> {
  const { householdId } = await requireHousehold();
  const date = new Date(`${dateIso}T00:00:00.000Z`);

  const [dinner, pantry] = await Promise.all([
    prisma.plannedMeal.findUnique({
      // Anchored on the first dinner even when the evening holds three.
      // Sides belong to the day rather than to a dinner, so there is no single
      // right answer to "which one is this for"; suggesting against the dish
      // the tile leads with is the one a person would have picked.
      where: {
        householdId_date_slot: { householdId, date, slot: FIRST_DINNER },
      },
      select: {
        recipe: {
          select: {
            title: true,
            ovenTemp: true,
            ovenTempUnit: true,
            equipment: true,
            ingredients: { select: { name: true } },
          },
        },
      },
    }),
    listPantryItems(householdId),
  ]);

  if (!dinner?.recipe) return [];

  return suggestSides(
    dinner.recipe,
    pantry.map((item) => item.name),
  ).map(({ side, reasons }) => ({
    id: side.id,
    title: side.title,
    description: side.description,
    reasons,
    minutes: side.prepMinutes + side.cookMinutes,
  }));
}
