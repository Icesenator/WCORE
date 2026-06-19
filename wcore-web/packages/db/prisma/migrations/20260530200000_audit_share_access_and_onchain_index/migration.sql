-- Audit 2026-05-30: share access tracking + OnchainGm query index

-- SEC-8: Track share token access (lastAccessedAt + accessCount)
ALTER TABLE "wallet_scans" ADD COLUMN "lastAccessedAt" TIMESTAMP(3);
ALTER TABLE "wallet_scans" ADD COLUMN "accessCount" INTEGER NOT NULL DEFAULT 0;

-- PERF-10: Speed up rebuildChainStreakFromOnchain queries (userId + chainKey)
CREATE INDEX "onchain_gms_userId_chainKey_idx" ON "onchain_gms"("userId", "chainKey");
