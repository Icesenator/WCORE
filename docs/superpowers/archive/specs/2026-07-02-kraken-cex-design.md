# Kraken CEX Connector Design

## Goal

Add Kraken as a first-class CEX source in the GSheet runtime, harmonized with the existing CEX architecture.

## Scope

- Add a new `CEX - Kraken` sheet using the standard CEX format: `A1` checkbox, `B1` canonical last update timestamp, and columns `cryptocoin_symbol`, `balance`, `source`, `updated_at`.
- Add `UPDATE_KRAKEN_SPOT()` with the same status, lock, and write behavior as Binance, Bitfinex, Bybit, Coinbase, and OKX.
- Add `KRAKEN_ON_EDIT(e)` so `CEX - Kraken!A1` queues manual refresh work instead of running inside `onEdit`.
- Include Kraken in the central `CEX_HOURLY_REFRESH()` and the `Portefeuille Crypto V2!U2` crypto CEX batch.
- Add `KRAKEN_SYNC_STATUS()` for diagnostics.

## API And Secrets

- Use Kraken REST API directly from Apps Script, matching the Bitfinex direct-connector pattern.
- Store Kraken API key and private key only through `SET_KRAKEN_API_KEYS(apiKey, privateKey)` in `UserProperties` and `DocumentProperties`.
- Do not store secrets in source code or spreadsheet cells.
- Required Kraken permission is read-only `Funds permissions -> Query`.

## Data Mapping

- Read account balances from Kraken private balance endpoint.
- Keep rows with positive balances only.
- Normalize known stable/fiat variants consistently with other CEX connectors: USD/stable USD to `USDT`, EUR/stable EUR to `EURC`.
- Add Kraken-specific ticker aliases only when needed by observed API symbols.

## Error Handling

- Use `CEX_ACQUIRE_LOCK("KRAKEN")` / `CEX_RELEASE_LOCK("KRAKEN")`.
- Return JSON `{ ok: true/false, ts, ... }` and persist it through `KRAKEN_SYNC_STATUS`.
- On HTTP/API/signature errors, preserve existing sheet contents and write diagnostic status only.

## Tests

- Extend CEX guard tests to require Kraken in manual queue wiring, central refresh, and AC2 batch.
- Add static checks that no Kraken secret literals are present in source.
