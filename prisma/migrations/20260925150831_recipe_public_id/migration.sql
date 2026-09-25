-- The short, stable half of a recipe's web address.
--
-- One migration rather than three, because Prisma runs each migration inside a
-- transaction: if the unique index at the end cannot be built, the column and
-- the backfill go with it and the database is left exactly as it was. A
-- half-applied version of this - a column that exists but is not unique, or is
-- unique but not filled - is the state worth not having.

-- Nullable to begin with, because the rows that already exist have no value
-- to put here yet.
ALTER TABLE "recipe" ADD COLUMN "publicId" TEXT;

-- Eight hex characters per existing recipe, from md5 of a random value salted
-- with the row's own id.
--
-- Random rather than derived from the title: two households may both have a
-- "Chicken Soup", and a title-derived address would make the second one's
-- address announce that the first one exists.
--
-- Of 4.3 billion possible values, a collision across a few thousand recipes is
-- about one chance in ten thousand. If it happens the unique index below fails,
-- this whole migration rolls back, and the next deployment tries again with
-- different numbers. That is a retry, not a repair.
UPDATE "recipe"
SET "publicId" = substr(md5(random()::text || "id"), 1, 8)
WHERE "publicId" IS NULL;

-- Now it can be required. Every row has one, and the application gives one to
-- every row it creates from here.
ALTER TABLE "recipe" ALTER COLUMN "publicId" SET NOT NULL;

CREATE UNIQUE INDEX "recipe_publicId_key" ON "recipe"("publicId");
