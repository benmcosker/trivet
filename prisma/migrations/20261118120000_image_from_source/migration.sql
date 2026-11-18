-- Whether a recipe's photo came with its source (a web page, a PDF) rather
-- than being added by the household. Source photos are shown only to the
-- household that owns the recipe, never to the ones it is shared with.
ALTER TABLE "recipe" ADD COLUMN "imageFromSource" BOOLEAN NOT NULL DEFAULT false;

-- Existing photos on recipes read from a link or a PDF are assumed to be the
-- source's. Some of them may since have been replaced by hand, and there is no
-- record of which; those stop travelling until the household adds the photo
-- again, which is the safe way round to be wrong. Photographed cards never
-- kept a dish photo, and manual recipes only ever got one by hand.
UPDATE "recipe"
SET "imageFromSource" = true
WHERE "imageUrl" IS NOT NULL AND "source" IN ('URL', 'PDF');
