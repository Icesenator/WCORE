# Coinbase Sync Design

## Goal

Add a Coinbase CEX connector that fills a new `Coinbase Crypto` sheet and lets `Portefeuille Crypto Details` consume Coinbase balances through the same CEX pattern used by Binance, Bitfinex, and Bybit.

## Scope

- Read Coinbase Advanced Trade/CDP account balances.
- Output only positive balances.
- Use the standard CEX sheet shape: `A=cryptocoin_symbol`, `B=balance`, `C=source`, `D=updated_at`.
- Refresh manually through `Coinbase Crypto!A1` and the existing central `BITPANDA_REFRESH_WATCHDOG()`.
- Keep Coinbase secrets out of Apps Script source, spreadsheet cells, logs, and git.

## Architecture

Coinbase CDP keys require ES256 JWT signing. Apps Script has no native ES256/JWT signer, so Coinbase authentication is implemented in the existing Railway `cex-relay`, using Node `crypto`. Apps Script stores only the relay URL/token and calls `GET /coinbase?token=...`.

The GAS connector mirrors `36_BINANCE_SYNC.gs`/`37_BITFINEX_SYNC.gs`: setup, diag, update, onEdit, fallback manual watchdog, status storage, and sheet writer.

## Data Flow

1. User checks `Coinbase Crypto!A1`.
2. `WCORE_ON_EDIT()` routes to `COINBASE_ON_EDIT()`.
3. The handler sets a manual request flag and visible `B1=REQUEST: <ts>`.
4. `BITPANDA_REFRESH_WATCHDOG()` detects the request and calls `UPDATE_COINBASE_SPOT()`.
5. GAS calls Railway `/coinbase`.
6. Railway signs Coinbase requests with the CDP private key, fetches brokerage accounts, normalizes balances, and returns `spot` rows.
7. GAS writes rows to `Coinbase Crypto`.

## Symbol Normalization

For spreadsheet consistency, Coinbase USD/stable USD balances are grouped into `USDT`; EUR/EUR-stable balances are grouped into `EURC`. Other tickers stay uppercase.

## Integration Points

- `railway-relay/server.js`: add Coinbase JWT signer and `/coinbase` endpoint.
- `railway-relay/.env.example` and README: document `COINBASE_API_KEY_NAME` and `COINBASE_PRIVATE_KEY`.
- `src/39_COINBASE_SYNC.gs`: new connector.
- `src/16_REFRESH.gs`: route `COINBASE_ON_EDIT()` and skip Coinbase CEX sheet in on-chain watchdog.
- `src/17_LISTING.gs`: include `Coinbase Crypto` in Recap display.
- `src/35_BITPANDA_SYNC.gs`: central watchdog handles Coinbase manual requests.
- `docs/cex-sync.md`: update architecture docs.

## Verification

- `node scripts/validate-static.js` passes.
- `node --check railway-relay/server.js` passes.
- `Coinbase Crypto!A1` can queue a refresh without touching other business cells.
- `Coinbase Crypto!B1` becomes a timestamp or visible error after watchdog execution.
