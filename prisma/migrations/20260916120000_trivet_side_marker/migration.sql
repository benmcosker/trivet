-- Rename the marker that identifies an accepted side.
--
-- `acceptSideAction` writes "<prefix><side id>" into recipe.sourceName and
-- then matches on that exact string to decide whether a side has already been
-- accepted. The product changed name, the prefix changed with it, and rows
-- written under the old prefix would stop matching - so accepting a side you
-- already had would quietly create a second copy of it.
--
-- Guarded by the LIKE so only marker rows are touched: sourceName is a free
-- text field elsewhere ("Bon Appetit", "Nana's card"), and a recipe somebody
-- genuinely sourced from a magazine article about meal magic is not this.
UPDATE "recipe"
SET "sourceName" = replace("sourceName", 'Meal Magic side: ', 'Trivet side: ')
WHERE "sourceName" LIKE 'Meal Magic side: %';
