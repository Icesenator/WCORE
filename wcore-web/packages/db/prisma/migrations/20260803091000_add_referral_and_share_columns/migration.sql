-- Adds the seven columns that schema.prisma declares but that no migration ever created.
-- Same root cause as the two missing tables: these shipped through `db push` on production
-- and were never written into the migration history, so a database rebuilt from the
-- migrations alone lacks the referral and scan-sharing features entirely.
--
-- Column types, defaults and nullability are copied verbatim from the DDL Prisma derives
-- from the current schema (`migrate diff --from-empty --to-schema-datamodel`).
--
-- Everything is guarded so this is a strict no-op on production, where the columns,
-- indexes and foreign key already exist.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "referralCode" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "referredById" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "referralEarnings" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "welcomeCompleted" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS "users_referralCode_key" ON "users"("referralCode");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_referredById_fkey') THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_referredById_fkey"
      FOREIGN KEY ("referredById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "wallet_scans" ADD COLUMN IF NOT EXISTS "shareToken" TEXT;
ALTER TABLE "wallet_scans" ADD COLUMN IF NOT EXISTS "sharedAt" TIMESTAMP(3);
ALTER TABLE "wallet_scans" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "wallet_scans_shareToken_key" ON "wallet_scans"("shareToken");
