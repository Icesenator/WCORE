-- v0.1.14 GM enhancements
-- Idempotent: safe to run on DB already synced via db push

-- Add creatorAddress to gm_contracts
ALTER TABLE "gm_contracts" ADD COLUMN IF NOT EXISTS "creatorAddress" TEXT;

-- Add tipWei to onchain_gms
ALTER TABLE "onchain_gms" ADD COLUMN IF NOT EXISTS "tipWei" TEXT;

-- Replace single-column unique with composite unique on [chainKey, txHash]
DROP INDEX IF EXISTS "onchain_gms_txHash_key";
CREATE UNIQUE INDEX IF NOT EXISTS "onchain_gms_chainKey_txHash_key" ON "onchain_gms"("chainKey", "txHash");
