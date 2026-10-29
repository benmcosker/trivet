"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { RECIPE_COURSES, type RecipeCourse } from "@/lib/recipe-schema";
import { requireHousehold } from "@/lib/session";

export type SetCourseResult = { ok: true } | { ok: false; error: string };

/**
 * Say what one recipe is.
 *
 * Only this household's own recipes: the course is part of the recipe, and a
 * shared recipe belongs to the household that added it, which is the only one
 * allowed to change it. `updateMany` with the household in the where clause
 * makes that the query rather than a check before it - a recipe id from
 * somewhere else matches nothing and changes nothing.
 */
export async function setCourseAction(
  recipeId: string,
  course: RecipeCourse,
): Promise<SetCourseResult> {
  const user = await requireHousehold();

  if (!RECIPE_COURSES.includes(course)) {
    return { ok: false, error: "That is not a course." };
  }

  const { count } = await prisma.recipe.updateMany({
    where: { id: recipeId, householdId: user.householdId },
    data: { course },
  });
  if (count === 0) {
    return { ok: false, error: "That recipe could not be changed." };
  }

  revalidatePath("/recipes/sort");
  return { ok: true };
}
