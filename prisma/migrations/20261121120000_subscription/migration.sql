-- A household's paid plan, and the end of its free month.
-- Nothing is gated on either yet. Existing households get no trial (null).
CREATE TYPE "SubscriptionSource" AS ENUM ('WEB', 'APPLE');

CREATE TYPE "SubscriptionInterval" AS ENUM ('MONTH', 'YEAR');

CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'CANCELED', 'ENDED');

ALTER TABLE "household" ADD COLUMN "trialEndsAt" TIMESTAMP(3);

CREATE TABLE "subscription" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "source" "SubscriptionSource" NOT NULL,
    "externalId" TEXT NOT NULL,
    "customerId" TEXT,
    "interval" "SubscriptionInterval" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "subscription_householdId_key" ON "subscription"("householdId");

CREATE UNIQUE INDEX "subscription_source_externalId_key" ON "subscription"("source", "externalId");

ALTER TABLE "subscription" ADD CONSTRAINT "subscription_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
