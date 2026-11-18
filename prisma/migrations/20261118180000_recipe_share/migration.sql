-- A recipe shared with one other household. Sharing with every household is
-- now the base library's alone; this is how any household shares.
CREATE TABLE "recipe_share" (
    "recipeId" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recipe_share_pkey" PRIMARY KEY ("recipeId","householdId")
);

CREATE INDEX "recipe_share_householdId_idx" ON "recipe_share"("householdId");

ALTER TABLE "recipe_share" ADD CONSTRAINT "recipe_share_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "recipe_share" ADD CONSTRAINT "recipe_share_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
