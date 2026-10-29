"use client";

import { saveRecipeAction } from "@/app/recipes/actions";
import type { RecipeInput } from "@/lib/recipe-schema";

import { RecipeForm } from "./RecipeForm";

const blank: RecipeInput = {
  title: "",
  description: null,
  servings: 4,
  prepMinutes: null,
  cookMinutes: null,
  restMinutes: null,
  ovenTemp: null,
  ovenTempUnit: null,
  yieldNote: null,
  equipment: [],
  caloriesKcal: null,
  proteinG: null,
  carbsG: null,
  fatG: null,
  course: null,
  sourceUrl: null,
  sourceName: null,
  notes: null,
  instructions: [],
  ingredients: [],
  tags: [],
};

export function NewRecipeForm({ initial }: { initial?: RecipeInput }) {
  return (
    <RecipeForm
      initial={initial ?? blank}
      submitLabel="Save recipe"
      onSubmit={async (values) => {
        const result = await saveRecipeAction(values);
        if (result && result.ok === false) return result;
      }}
    />
  );
}
