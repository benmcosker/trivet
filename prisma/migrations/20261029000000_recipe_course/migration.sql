-- What kind of dish a recipe is. Nullable, and null means "not sorted yet":
-- nothing is assumed, because a wrong guess here becomes pancakes suggested
-- for a Tuesday dinner.
CREATE TYPE "RecipeCourse" AS ENUM ('DINNER', 'SIDE', 'BREAKFAST', 'DESSERT', 'SNACK', 'OTHER');

ALTER TABLE "recipe" ADD COLUMN "course" "RecipeCourse";

-- The one thing already known for certain: a side accepted from the
-- planner's suggestions carries the side marker in its source name, and is a
-- side. Everything else waits for a person (or the importer, for new ones).
UPDATE "recipe" SET "course" = 'SIDE' WHERE "sourceName" LIKE 'Trivet side: %';
