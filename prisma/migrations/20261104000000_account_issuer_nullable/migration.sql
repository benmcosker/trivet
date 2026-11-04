-- Better Auth 1.7.3 stopped writing account.issuer, which 1.7.0 through 1.7.2
-- required. Left NOT NULL, the column rejects every sign-up. Relaxing it is
-- the reversible step the 1.7 upgrade guide gives for Postgres; the column and
-- its (non-unique) index stay until a later cleanup drops them.

-- AlterTable
ALTER TABLE "account" ALTER COLUMN "issuer" DROP NOT NULL;
