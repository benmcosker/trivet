-- Marks nutrition that Trivet estimated from the ingredients, so the
-- recipe page can say so. Existing figures were all printed on the source.
ALTER TABLE "recipe" ADD COLUMN "nutritionEstimated" BOOLEAN NOT NULL DEFAULT false;
