-- How many recipes a household has had read this month, for the monthly
-- import allowance. Nothing is enforced until IMPORT_ALLOWANCE=on.
CREATE TABLE "import_count" (
    "householdId" TEXT NOT NULL,
    "month" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "import_count_pkey" PRIMARY KEY ("householdId","month")
);

ALTER TABLE "import_count" ADD CONSTRAINT "import_count_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
