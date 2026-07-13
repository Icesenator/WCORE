# Kraken CEX Implementation Plan

> **Status 2026-07-13:** Completed/historical. Kraken is present in the runtime and current CEX batch wiring targets `Portefeuille Crypto V2!U2`. Keep this file as implementation provenance, not as active backlog.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Kraken as a harmonized CEX source in the GSheet Apps Script runtime.

**Architecture:** Implement a direct Apps Script Kraken connector, modeled on Bitfinex for signed REST calls and on Binance/Coinbase/OKX for shared CEX queue/status behavior. Integrate it into the central CEX hourly refresh, manual `A1` queue, and `Portefeuille Crypto V2!U2` batch.

**Tech Stack:** Google Apps Script `.gs`, Kraken REST API, existing Node static guard tests.

---

### Task 1: Guard Tests

**Files:**
- Modify: `wcore-gsheet/tests/cex-refresh-load-guard.test.js`

- [ ] Add Kraken expectations to the central CEX test guard.
- [ ] Require `KRAKEN_ON_EDIT` to queue `UPDATE_KRAKEN_SPOT` with label `KRAKEN`.
- [ ] Require `CEX_HOURLY_REFRESH` and `Portefeuille Crypto V2!U2` to include Kraken.
- [ ] Run `npm run test:cex-refresh-load`; expected initial failure before implementation, then pass.

### Task 2: Kraken Connector

**Files:**
- Create: `wcore-gsheet/src/41_KRAKEN_SYNC.gs`

- [ ] Add `KRAKEN_SYNC_CONFIG` with `SHEET: "CEX - Kraken"`, status prop, refresh flag prop, and spreadsheet id.
- [ ] Add `SET_KRAKEN_API_KEYS(apiKey, privateKey)` storing secrets in `UserProperties` and `DocumentProperties` only.
- [ ] Add Kraken private REST signing for `/0/private/Balance`: nonce, POST body, SHA256, HMAC-SHA512, base64 signature.
- [ ] Add balance parsing and ticker normalization.
- [ ] Add `_krakenWriteSheet_`, `UPDATE_KRAKEN_SPOT()`, `KRAKEN_SYNC_STATUS()`, `KRAKEN_ON_EDIT(e)`, and disabled legacy `KRAKEN_REFRESH_WATCHDOG()`.

### Task 3: CEX Integration

**Files:**
- Modify: `wcore-gsheet/src/35_BITPANDA_SYNC.gs`
- Modify: `wcore-gsheet/src/16B_AUTO_HEAL.gs`

- [ ] Add Kraken to `CEX_HOURLY_REFRESH()`.
- [ ] Add Kraken to `Portefeuille Crypto V2!U2` batch enqueue and direct crypto refresh helper.
- [ ] Add `CEX - Kraken` to CEX heartbeat/staleness fallback.
- [ ] Add Kraken legacy trigger name to cleanup only if needed; do not install a Kraken-specific time trigger.

### Task 4: Verification

**Files:**
- Modify as needed only if tests reveal a missed integration.

- [ ] Run `npm run test:cex-refresh-load`.
- [ ] Run `npm run validate:static`.
- [ ] Read `git diff` and ensure no API key/private key literals are present.
- [ ] Do not deploy secrets in source or sheets. User should set a fresh Kraken key with `SET_KRAKEN_API_KEYS(...)` after deploy.
