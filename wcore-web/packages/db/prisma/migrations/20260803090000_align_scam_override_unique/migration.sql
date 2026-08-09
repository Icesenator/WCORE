-- Moves "scam_overrides" to the composite unique of the schema, @@unique([symbol, contract]).
--
-- On a fresh database the previous migrations leave a UNIQUE index on ("symbol") alone,
-- because 20260518103000_add_scam_override_contract needs it for its `ON CONFLICT ("symbol")`.
-- That index is stricter than the schema and would reject two overrides sharing a symbol
-- on different contracts, so it is replaced here once the "contract" column exists.
--
-- On production the composite index already exists and the symbol-only index never did,
-- so both statements are no-ops.

DROP INDEX IF EXISTS "scam_overrides_symbol_key";

CREATE UNIQUE INDEX IF NOT EXISTS "scam_overrides_symbol_contract_key"
  ON "scam_overrides"("symbol", "contract");
