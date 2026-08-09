-- 20260613120000_add_cex_accounts created "cex_accounts"."updatedAt" with
-- DEFAULT CURRENT_TIMESTAMP, but the schema declares it as @updatedAt, which Prisma
-- maintains from the client and expects to carry no database default. A database
-- rebuilt from the migrations therefore drifted from the schema by exactly this default.
--
-- The sibling column "cex_holdings"."updatedAt" is @default(now()), so its default is
-- legitimate and is left untouched.
--
-- Dropping a default only changes future inserts that omit the column; it rewrites no
-- row. Production was created with `db push` and never had this default, so this is a
-- no-op there, and PostgreSQL accepts DROP DEFAULT on a column that has none.

ALTER TABLE "cex_accounts" ALTER COLUMN "updatedAt" DROP DEFAULT;
