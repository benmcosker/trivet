-- When each person agreed to the terms at sign-up. Null for earlier accounts.
ALTER TABLE "user" ADD COLUMN "termsAcceptedAt" TIMESTAMP(3);
