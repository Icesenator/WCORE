---
type: reference
project: gsheet
status: active
---
# Kraken Sync

## Architecture

`src/41_KRAKEN_SYNC.gs` alimente `CEX - Kraken` directement depuis l'API REST Kraken. Les cles read-only sont stockees dans `UserProperties` et `DocumentProperties` via `SET_KRAKEN_API_KEYS(apiKey, privateKey)`.

## Refresh

- Auto : trigger horaire dedie `UPDATE_KRAKEN_SPOT`, maintenu par `WCORE_AUTO_HEAL`.
- Manuel : `CEX - Kraken!A1` passe par `CEX_MANUAL_REFRESH_WORKER`.
- `INSTALL_KRAKEN_SYNC_TRIGGER()` peut reinstaller le trigger horaire dedie sans watchdog.

Kraken ne fait pas partie de la rotation relay Binance/Bybit/Coinbase/OKX.

## Diagnostic

```javascript
DIAG_KRAKEN_API()
KRAKEN_SYNC_STATUS()
```
