-- Backfills the two tables that the schema maps but that no migration ever created:
-- "scam_overrides" and "tickets". Without them `prisma migrate deploy` fails on an
-- empty database at 20260518103000_add_scam_override_contract, which alters
-- "scam_overrides" directly. Staging from scratch and disaster recovery were
-- therefore both broken.
--
-- Production was created with `db push` and later baselined, so both tables already
-- exist there with their final shape. Each block is guarded on the table being
-- absent so this migration is a strict no-op on any database that already has them.
--
-- "scam_overrides" is intentionally created WITHOUT the "contract" column and with a
-- UNIQUE index on ("symbol") alone: the next migration adds that column and relies on
-- `ON CONFLICT ("symbol")`. The composite unique of the final schema is installed
-- afterwards by 20260803090000_align_scam_override_unique.

DO $$
BEGIN
  IF to_regclass('public.scam_overrides') IS NULL THEN
    CREATE TABLE "scam_overrides" (
        "id" TEXT NOT NULL,
        "symbol" TEXT NOT NULL,
        "approved" BOOLEAN NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,

        CONSTRAINT "scam_overrides_pkey" PRIMARY KEY ("id")
    );

    CREATE UNIQUE INDEX "scam_overrides_symbol_key" ON "scam_overrides"("symbol");
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.tickets') IS NULL THEN
    CREATE TABLE "tickets" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "description" TEXT NOT NULL,
        "type" TEXT NOT NULL DEFAULT 'bug',
        "status" TEXT NOT NULL DEFAULT 'open',
        "response" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,

        CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
    );

    CREATE INDEX "tickets_userId_status_idx" ON "tickets"("userId", "status");

    ALTER TABLE "tickets" ADD CONSTRAINT "tickets_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
