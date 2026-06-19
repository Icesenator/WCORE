# Coinbase Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Coinbase API balances to WCORE through the existing CEX sync architecture.

**Architecture:** Sign Coinbase CDP JWTs in the Node Railway relay, expose `/coinbase`, and consume it from a new Apps Script connector writing `Coinbase Crypto`. Reuse the central CEX watchdog and standard CEX sheet layout.

**Tech Stack:** Google Apps Script, Google Sheets, Node.js `crypto`, Express, Railway relay.

---

### Task 1: Relay Coinbase Endpoint

**Files:**
- Modify: `railway-relay/server.js`
- Modify: `railway-relay/.env.example`
- Modify: `railway-relay/README.md`

- [ ] Add ES256 JWT helpers using Node `crypto`.
- [ ] Add `GET /coinbase?token=...` protected by `RELAY_TOKEN`.
- [ ] Fetch `/api/v3/brokerage/accounts` with pagination.
- [ ] Return `{ ok, ts, spot }` with normalized positive balances.
- [ ] Run `node --check railway-relay/server.js`.

### Task 2: GAS Coinbase Connector

**Files:**
- Create: `src/39_COINBASE_SYNC.gs`

- [ ] Add `COINBASE_SYNC_CONFIG` and version.
- [ ] Add relay setup/clear/get helpers.
- [ ] Add `DIAG_COINBASE_API()`, `SETUP_COINBASE_SHEET()`, `UPDATE_COINBASE_SPOT()`.
- [ ] Add `COINBASE_ON_EDIT()` and fallback `COINBASE_REFRESH_WATCHDOG()`.

### Task 3: WCORE Integration

**Files:**
- Modify: `src/16_REFRESH.gs`
- Modify: `src/17_LISTING.gs`
- Modify: `src/35_BITPANDA_SYNC.gs`

- [ ] Route `COINBASE_ON_EDIT()` from `WCORE_ON_EDIT()`.
- [ ] Skip Coinbase in `_wd_isCexSheet_()`.
- [ ] Include Coinbase in `_isLedgerLike_()`.
- [ ] Let the central CEX watchdog process Coinbase manual requests.

### Task 4: Docs and Verification

**Files:**
- Modify: `docs/cex-sync.md`
- Validate: `scripts/validate-static.js`, `railway-relay/server.js`

- [ ] Document Coinbase connector and relay variables.
- [ ] Run `node --check railway-relay/server.js`.
- [ ] Run `node scripts/validate-static.js`.
