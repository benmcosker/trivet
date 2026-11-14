-- Admin-only log of requests to /api/mcp, kept 14 days (temporary).
-- New table only; drop it to remove the feature.

-- CreateTable
CREATE TABLE "mcp_request_log" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" TEXT NOT NULL,
    "tool" TEXT,
    "arguments" TEXT,
    "status" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL,
    "detail" TEXT,
    "durationMs" INTEGER NOT NULL,
    "clientId" TEXT,
    "userId" TEXT,

    CONSTRAINT "mcp_request_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mcp_request_log_createdAt_idx" ON "mcp_request_log"("createdAt");

-- AddForeignKey
ALTER TABLE "mcp_request_log" ADD CONSTRAINT "mcp_request_log_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

