-- Dishes cooked through to the end in cook mode, so a dinner made without
-- being planned still counts as had. See CookedMeal in schema.prisma.

-- CreateTable
CREATE TABLE "cooked_meal" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recipeId" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,

    CONSTRAINT "cooked_meal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cooked_meal_recipeId_idx" ON "cooked_meal"("recipeId");

-- CreateIndex
CREATE UNIQUE INDEX "cooked_meal_householdId_recipeId_date_key" ON "cooked_meal"("householdId", "recipeId", "date");

-- AddForeignKey
ALTER TABLE "cooked_meal" ADD CONSTRAINT "cooked_meal_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cooked_meal" ADD CONSTRAINT "cooked_meal_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
