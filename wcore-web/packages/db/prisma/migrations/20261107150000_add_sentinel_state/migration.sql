-- Chain Sentinel : etat durable (cle -> JSON). Migration additive : aucune table existante modifiee.
-- Rollback : voir rollback.sql dans ce dossier (DROP TABLE "sentinel_state").
CREATE TABLE "sentinel_state" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sentinel_state_pkey" PRIMARY KEY ("key")
);
