-- Macros per serving, as the source stated them.
--
-- Transcribed, never calculated: if the card or the page does not say,
-- Trivet does not say. There is deliberately no column recording where a
-- figure came from. The only distinction worth drawing would have been
-- stated versus computed, and nothing computes these - a figure on a card,
-- a figure in a page's structured data and a figure a cook typed off their
-- own scales are the same kind of claim, and the row already carries
-- `source`, `sourceName` and `sourceUrl` for anybody who wants to know which.
ALTER TABLE "recipe"
  ADD COLUMN "caloriesKcal" INTEGER,
  ADD COLUMN "proteinG"     INTEGER,
  ADD COLUMN "carbsG"       INTEGER,
  ADD COLUMN "fatG"         INTEGER;

-- A backstop, not a nutritional opinion. It exists to catch a per-recipe
-- total stored as a per-serving figure, which is the error that makes two
-- dishes uncomparable while neither of them looks wrong on its own, and an
-- extraction that has put grams in the calories column. Generous on purpose:
-- a rich single serving can genuinely reach four figures of calories, so
-- these refuse only the impossible.
--
-- A partial set is not impossible. A card that prints protein and nothing
-- else is a real card, and three nulls beside one figure is the honest
-- record of it.
ALTER TABLE "recipe"
  ADD CONSTRAINT "recipe_nutrition_plausible"
  CHECK (
    ("caloriesKcal" IS NULL OR "caloriesKcal" BETWEEN 0 AND 5000)
    AND ("proteinG" IS NULL OR "proteinG" BETWEEN 0 AND 500)
    AND ("carbsG"   IS NULL OR "carbsG"   BETWEEN 0 AND 1000)
    AND ("fatG"     IS NULL OR "fatG"     BETWEEN 0 AND 500)
  );
