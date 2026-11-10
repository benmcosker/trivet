-- Hiding another household's shared recipes and reviews, and reporting
-- shared content to the admins: Apple's guideline 1.2 for apps where people
-- see each other's content.

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('OFFENSIVE', 'NOT_A_RECIPE', 'COPYRIGHT', 'OTHER');

-- CreateTable
CREATE TABLE "household_block" (
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "household_block_pkey" PRIMARY KEY ("blockerId","blockedId")
);

-- CreateTable
CREATE TABLE "content_report" (
    "id" TEXT NOT NULL,
    "reason" "ReportReason" NOT NULL,
    "note" TEXT,
    "recipeId" TEXT,
    "reviewId" TEXT,
    "reporterId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "content_report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "household_block_blockedId_idx" ON "household_block"("blockedId");

-- CreateIndex
CREATE INDEX "content_report_resolvedAt_createdAt_idx" ON "content_report"("resolvedAt", "createdAt");

-- CreateIndex
CREATE INDEX "content_report_recipeId_idx" ON "content_report"("recipeId");

-- CreateIndex
CREATE INDEX "content_report_reviewId_idx" ON "content_report"("reviewId");

-- AddForeignKey
ALTER TABLE "household_block" ADD CONSTRAINT "household_block_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_block" ADD CONSTRAINT "household_block_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_report" ADD CONSTRAINT "content_report_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_report" ADD CONSTRAINT "content_report_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "recipe_review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_report" ADD CONSTRAINT "content_report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

