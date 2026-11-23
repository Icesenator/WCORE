-- Kraken via l'API (P2-DATA-KRAKEN-VIA-API) : etat durable de l'appelant unique de la cle.
-- Indexe par empreinte de la cle (jamais la cle). Nonce persistant, bail, pause. Aucune donnee
-- de solde ni aucun secret. Migration additive : aucune table existante modifiee.
-- Rollback : voir rollback.sql dans ce dossier (DROP TABLE "kraken_call_state").
CREATE TABLE "kraken_call_state" (
    "key_id" TEXT NOT NULL,
    "last_nonce" BIGINT NOT NULL,
    "lease_until_ms" BIGINT,
    "lockout_until_ms" BIGINT,
    "last_call_ms" BIGINT,
    "last_ok_ms" BIGINT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kraken_call_state_pkey" PRIMARY KEY ("key_id")
);
