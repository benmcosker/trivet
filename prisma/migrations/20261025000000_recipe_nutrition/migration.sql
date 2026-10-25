-- Macros per serving, and where they came from.
--
-- The basis column is the point of this migration as much as the numbers are.
-- PRINTED and ESTIMATED are stored the same way and mean entirely different
-- things to somebody cooking from them, so the database refuses to hold a
-- macro that does not say which it is.
CREATE TYPE "NutritionBasis" AS ENUM ('PRINTED', 'ESTIMATED');

ALTER TABLE "recipe"
  ADD COLUMN "caloriesKcal"   INTEGER,
  ADD COLUMN "proteinG"       INTEGER,
  ADD COLUMN "carbsG"         INTEGER,
  ADD COLUMN "fatG"           INTEGER,
  ADD COLUMN "nutritionBasis" "NutritionBasis";

-- A macro with no basis is a number nobody can read, and a basis with no
-- macros is a claim about nothing. Either the row says both or it says
-- neither - the same bargain `ovenTemp` and `ovenTempUnit` already strike.
ALTER TABLE "recipe"
  ADD CONSTRAINT "recipe_nutrition_basis_present"
  CHECK (
    ("nutritionBasis" IS NULL) = (
      "caloriesKcal" IS NULL
      AND "proteinG" IS NULL
      AND "carbsG" IS NULL
      AND "fatG" IS NULL
    )
  );

-- A backstop, not a nutritional opinion. It exists to catch a per-recipe total
-- stored as a per-serving figure, which is the error that makes two dishes
-- uncomparable, and an extraction that has put grams in the calories column.
-- Generous on purpose: a rich single-serving dish can genuinely reach four
-- figures of calories, and these only refuse the impossible.
ALTER TABLE "recipe"
  ADD CONSTRAINT "recipe_nutrition_plausible"
  CHECK (
    ("caloriesKcal" IS NULL OR "caloriesKcal" BETWEEN 0 AND 5000)
    AND ("proteinG" IS NULL OR "proteinG" BETWEEN 0 AND 500)
    AND ("carbsG"   IS NULL OR "carbsG"   BETWEEN 0 AND 1000)
    AND ("fatG"     IS NULL OR "fatG"     BETWEEN 0 AND 500)
  );
