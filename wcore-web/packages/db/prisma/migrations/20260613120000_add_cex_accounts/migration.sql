-- CEX accounts and synced holdings (Binance / Bitpanda)
CREATE TABLE "cex_accounts" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "label" TEXT,
  "encryptedCredentials" JSONB NOT NULL,
  "lastSyncAt" TIMESTAMP(3),
  "lastSyncStatus" TEXT,
  "lastSyncError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "cex_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cex_holdings" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "symbol" TEXT NOT NULL,
  "bucket" TEXT NOT NULL,
  "balance" DOUBLE PRECISION NOT NULL,
  "priceEur" DOUBLE PRECISION,
  "valueEur" DOUBLE PRECISION,
  "source" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "cex_holdings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cex_accounts_userId_provider_key" ON "cex_accounts"("userId", "provider");
CREATE INDEX "cex_accounts_userId_provider_idx" ON "cex_accounts"("userId", "provider");
CREATE UNIQUE INDEX "cex_holdings_accountId_symbol_bucket_key" ON "cex_holdings"("accountId", "symbol", "bucket");
CREATE INDEX "cex_holdings_accountId_idx" ON "cex_holdings"("accountId");
CREATE INDEX "cex_holdings_provider_symbol_idx" ON "cex_holdings"("provider", "symbol");

ALTER TABLE "cex_accounts" ADD CONSTRAINT "cex_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cex_holdings" ADD CONSTRAINT "cex_holdings_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "cex_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
