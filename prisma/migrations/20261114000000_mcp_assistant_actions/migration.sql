-- What connected AI assistants changed, and a daily allowance of MCP
-- requests per person (MCP-PLAN.md, phase 3). New tables only.

-- CreateTable
CREATE TABLE "assistant_action" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "assistant_action_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_quota" (
    "day" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "userId" TEXT NOT NULL,

    CONSTRAINT "assistant_quota_pkey" PRIMARY KEY ("userId","day")
);

-- CreateIndex
CREATE INDEX "assistant_action_userId_createdAt_idx" ON "assistant_action"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "assistant_action" ADD CONSTRAINT "assistant_action_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_quota" ADD CONSTRAINT "assistant_quota_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

