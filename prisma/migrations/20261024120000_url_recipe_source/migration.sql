-- A recipe read from a page on the web, rather than from a file somebody had.
--
-- Postgres will not add an enum value inside a transaction that then uses it,
-- and Prisma wraps a migration in one - so this is the whole migration, and
-- anything writing RecipeSource.URL waits for the next. No table is rewritten:
-- adding a value is a catalogue change, and every existing row keeps the
-- source it already had.
ALTER TYPE "RecipeSource" ADD VALUE IF NOT EXISTS 'URL' AFTER 'PHOTO';
