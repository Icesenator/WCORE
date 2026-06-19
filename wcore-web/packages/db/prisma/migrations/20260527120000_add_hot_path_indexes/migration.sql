CREATE INDEX IF NOT EXISTS "users_score_idx" ON "users"("score");
CREATE INDEX IF NOT EXISTS "gm_contracts_ownerId_idx" ON "gm_contracts"("ownerId");
CREATE INDEX IF NOT EXISTS "gm_contracts_creatorAddress_idx" ON "gm_contracts"("creatorAddress");
CREATE INDEX IF NOT EXISTS "onchain_gms_userId_createdAt_idx" ON "onchain_gms"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "onchain_gms_contractId_idx" ON "onchain_gms"("contractId");
CREATE INDEX IF NOT EXISTS "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt");
