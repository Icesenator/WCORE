# CEX INFO_TOTAL Design

## Goal

Populate the `INFO_TOTAL` column in `Recap Portfolio` for CEX entries, harmonized with the existing on-chain wallet pattern. Each `CEX - <provider>` sheet ends with a `TOTAL` row computed by the existing pricing cascade, and `Recap Portfolio` reads that row to display the value.

## Scope

- Append a final `TOTAL` row to every CEX sheet after each sync:
  - `CEX - Binance`
  - `CEX - Bitfinex`
  - `CEX - Bybit`
  - `CEX - Coinbase`
  - `CEX - OKX`
  - `CEX - Kraken`
  - `CEX - Bitpanda Crypto`
  - `CEX - Bitpanda Fiat`
  - `CEX - Bitpanda Stocks`
  - `CEX - Bitpanda Commodity`
- Compute the total via the existing pricing cascade in `07_PRICES.gs` (DefiLlama → DexScreener → GeckoTerminal → CoinGecko).
- Add a new `INFO_TOTAL (H)` column to `Recap Portfolio` populated from each CEX sheet's last `TOTAL` row.
- Keep all CEX sync functions otherwise unchanged. Same triggers, same locks, same 4h cadence via `CEX_HOURLY_REFRESH`, same `MASTER_ON_EDIT` A1 checkbox flow.

## Data Flow

1. Each `UPDATE_*_SPOT()` (and the Bitpanda sync functions) writes its balance rows, then calls a shared helper `_cexComputeAndAppendTotal_(sheetName, balances, provider)` before exiting.
2. The helper iterates the just-written balances, calls `PriceManager.computePriceEur(symbol)` for each, multiplies by `balance`, sums into a running total.
3. The helper strips any prior `TOTAL` row (last row whose col A is `"TOTAL"`), then appends one new `TOTAL` row at the bottom of the sheet.
4. After every `LEDGER_ON_CHANGE` event and after each `_ensureLedgerCache_(force)` rebuild, `_setRecapCexInfoTotal_()` walks all `CEX - *` sheets, reads the last `TOTAL` row, and writes the value into `Recap Portfolio!H{n}` for the matching row.

## Pricing Rules

- Use `PriceManager.computePriceEur(symbol)` from `07_PRICES.gs`. The cascade already supports symbol-based lookups (DefiLlama `coingecko:bitcoin` map, CoinGecko `bitcoin` map, DexScreener / GT for ambiguous symbols).
- Stablecoins and fiat follow the existing fast-path: `USDT`, `USDC`, `EUR`, `EURC` are valued at parity (price = 1.0 EUR). No HTTP call for these.
- If `PriceManager` returns `null` for a symbol, skip that line and log `[CEX_TOTAL] skip no-price: <symbol> in <sheet>`. The TOTAL sums only the valued rows, never inflates with 0-priced unknown assets.
- If the pricing cascade throws a quota error, abort the TOTAL write and write `TOTAL | 0.00 | <provider> | [BLOCKED:QUOTA] <stamp>` instead. Honest signal to the user, no optimistic value.

## TOTAL Row Format

Append after the data rows, in the same columns used by the data:

| col A (`cryptocoin_symbol`) | col B (`balance`) | col C (`source`) | col D (`updated_at`) |
|---|---|---|---|
| `TOTAL` | sum of `balance × price_eur` (number, 2 decimals) | `<provider>` (e.g. `binance`, `kraken`) | ISO `yyyy-MM-dd HH:mm:ss` from `Utilities.formatDate(..., "Europe/Paris", ...)`, set as text via `setNumberFormat("@")` |

Stable sync examples:
- Bitpanda Crypto after sync: last data row is the spot asset, then `TOTAL | 8934.12 | bitpanda | 2026-07-03 12:34:56`.
- Bitpanda Stocks uses the same pattern; Buckets kept separate.
- Bitpanda Fiat uses the same pattern; bucket value comes from a parity mapping already handled by `07_PRICES.gs`.

## Recap Portfolio Update

- Existing column structure (per `17_LISTING.gs`): `A` name, `D` `PULSE (B1)`, `E` `FORCEFULL (C1)`, `F` `STATUS (I1)`, `G` `LAST SCAN (J1)`.
- Add a new column `H` titled `INFO_TOTAL` in the header row (`recap.getRange("H1").setValue("INFO_TOTAL")`).
- New helper `_setRecapCexInfoTotal_(recap, ledgerNames)` reads, for each ledger-like name matching `n.indexOf("cex - ") >= 0`, the value at the `TOTAL` row in the corresponding sheet and writes it to `H{i}` where `i` is the row in `Recap Portfolio` (offset 2 since row 1 is the header).
- This helper is called at the end of `_setRecapHyperlinks_()` so that adding/removing a CEX sheet keeps the column aligned.
- The on-chain `INFO_TOTAL` from `I1` is left untouched; `H` is dedicated to the CEX TOTAL row to keep the on-chain path intact (no regression risk).

## Idempotence

- Each sync must not accumulate multiple `TOTAL` rows. The helper first scans from the bottom of the sheet and deletes any trailing row where col A equals `"TOTAL"`, then appends the new one. This handles legacy sheets that may have multiple totals from prior runs.

## Error Handling

- If `PriceManager.computePriceEur` throws for an individual symbol, catch the throw, log, skip the line, continue. One bad symbol does not fail the entire sync.
- If `_cexComputeAndAppendTotal_` itself throws (e.g. SpreadsheetApp access lost), log the error and rethrow so the calling `UPDATE_*_SPOT` records an error status. The data rows already written stay; only the TOTAL row is missing — `Recap Portfolio!H` shows blank for that sheet, which is the correct degraded signal.
- The pricing cascade must run AFTER the balance rows are written but BEFORE the function returns success. If quota is tripped, write the `[BLOCKED:QUOTA]` marker; do not silently leave `H` blank.

## Files Modified

| File | Change |
|---|---|
| `wcore-gsheet/src/35_BITPANDA_SYNC.gs` | Add `_bpComputeAndAppendTotal_(buckets, sheetName, provider)` helper. Call it from the 4 Bitpanda sync paths at the end. |
| `wcore-gsheet/src/36_BINANCE_SYNC.gs` | Add `_binComputeAndAppendTotal_(values, sheetName, provider)`. Call it at the end of `_binWriteSheet_`. |
| `wcore-gsheet/src/37_BITFINEX_SYNC.gs` | Same pattern. |
| `wcore-gsheet/src/38_BYBIT_SYNC.gs` | Same pattern. |
| `wcore-gsheet/src/39_COINBASE_SYNC.gs` | Same pattern. |
| `wcore-gsheet/src/40_OKX_SYNC.gs` | Same pattern. |
| `wcore-gsheet/src/41_KRAKEN_SYNC.gs` | Same pattern. |
| `wcore-gsheet/src/17_LISTING.gs` | Add `INFO_TOTAL` header in `H1`, add `_setRecapCexInfoTotal_()` helper, call it from `_setRecapHyperlinks_()`. |
| `wcore-gsheet/tests/cex-info-total.test.js` | New test file. |

## Test Plan

A new test file `wcore-gsheet/tests/cex-info-total.test.js` covers:

1. **Helper unit tests** for `_cexComputeAndAppendTotal_`:
   - Empty balances list → writes `TOTAL | 0.00 | <provider> | <stamp>`.
   - One stablecoin (USDT 100) → writes `TOTAL | 100.00 | <provider> | <stamp>`.
   - Mixed (BTC 0.5 + USDT 1000) → writes the sum of the two valued lines.
   - Symbol with no resolvable price → skipped, only the valued lines contribute.
   - Two syncs in a row → only one `TOTAL` row remains (idempotence).
   - Quota tripped → writes `TOTAL | 0.00 | <provider> | [BLOCKED:QUOTA] <stamp>`.

2. **Recap Portfolio integration** via a static check on `17_LISTING.gs`:
   - `H1` is set to `INFO_TOTAL`.
   - `_setRecapCexInfoTotal_` is called from `_setRecapHyperlinks_`.

3. **Guard test update** in `wcore-gsheet/tests/cex-refresh-load-guard.test.js`:
   - Verify the existing hourly-per-connector trigger guard still passes after the new helper is added (no regression in the central cadence / per-connector triggers).

## Out of Scope

- No change to the on-chain `INFO_TOTAL` path (driven by `I1=*_REFRESH_STATUS(...)`).
- No change to the `Portefeuille Crypto Details` formulas.
- No change to the CEX 4h cadence or the `CEX_MANUAL_REFRESH_WORKER` 1 min trigger.
- No new external price source — reuse the existing cascade.
- No change to the `A1` checkbox manual refresh path.

## Rollout

1. Implement helper `_cexComputeAndAppendTotal_` + call sites in the 7 CEX sync files.
2. Update `17_LISTING.gs` (header + helper + call).
3. Add `cex-info-total.test.js` and run `npm test` in `wcore-gsheet`.
4. Run `npm run validate:static` to confirm no global function pollution.
5. `safe-push.ps1` once all files are ready; backup folder will be created automatically.
6. Verify in the spreadsheet after push: trigger a manual `UPDATE_BINANCE_SPOT()` then check `CEX - Binance` last row and `Recap Portfolio!H` for `Binance`.
7. Once confirmed, leave the 4h trigger doing the rest; spot-check one sync per provider over the next 24h.
