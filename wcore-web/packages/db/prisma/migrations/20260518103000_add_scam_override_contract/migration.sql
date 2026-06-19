ALTER TABLE "scam_overrides" ADD COLUMN "contract" TEXT;

INSERT INTO "scam_overrides" ("id", "symbol", "contract", "approved", "createdAt", "updatedAt")
VALUES ('scam_neged_base_20260518', 'NEGED', '0x4229c271c19ca5f319fb67b4bc8a40761a6d6299', false, NOW(), NOW())
ON CONFLICT ("symbol") DO UPDATE SET
  "contract" = EXCLUDED."contract",
  "approved" = false,
  "updatedAt" = NOW();
