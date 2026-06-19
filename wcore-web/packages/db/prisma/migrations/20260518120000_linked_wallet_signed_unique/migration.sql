-- Partial unique index: only one user can hold a SIGNED claim on a given address.
-- UNSIGNED rows (view-only claims) are NOT covered — multiple users may claim
-- the same address as view-only until someone signs.
--
-- Why: prevents the "UNSIGNED spoofing" path where any user can pre-claim
-- another user's wallet and have it appear in a wallet-list endpoint that
-- forgets to filter on verificationStatus='SIGNED'.

-- Safety step: if duplicates already exist in production, demote the newer
-- SIGNED rows back to UNSIGNED so the index can be created without error.
-- The oldest SIGNED row (the original verifier) keeps ownership.
UPDATE "linked_wallets" lw
SET "verificationStatus" = 'UNSIGNED'
WHERE "verificationStatus" = 'SIGNED'
  AND EXISTS (
    SELECT 1
    FROM "linked_wallets" older
    WHERE older."address" = lw."address"
      AND older."verificationStatus" = 'SIGNED'
      AND older."createdAt" < lw."createdAt"
  );

CREATE UNIQUE INDEX "linked_wallets_address_signed_unique"
  ON "linked_wallets" ("address")
  WHERE "verificationStatus" = 'SIGNED';
