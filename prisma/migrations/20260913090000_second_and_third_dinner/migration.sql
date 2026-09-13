-- A day can hold three mains. Sides are unchanged and still belong to the day
-- rather than to a particular dinner, which is what keeps the unique key on
-- (householdId, date, slot) workable.
ALTER TYPE "MealSlot" ADD VALUE 'DINNER_2';
ALTER TYPE "MealSlot" ADD VALUE 'DINNER_3';
