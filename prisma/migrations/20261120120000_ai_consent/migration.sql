-- When each person agreed that their imports are read by Anthropic.
-- Null for everyone at first: existing members are asked on their next import.
ALTER TABLE "user" ADD COLUMN "aiConsentAt" TIMESTAMP(3);
