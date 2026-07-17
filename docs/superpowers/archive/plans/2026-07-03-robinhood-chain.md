# Robinhood Chain Implementation Plan

> **Status 2026-07-13:** Completed/historical. Robinhood Chain is reflected in the current roadmap/audit state. Keep this file as implementation provenance, not as active backlog.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Robinhood Chain mainnet to WCORE GSheet, generated web chain data, and `/dev/deploy` wallet-add metadata.

**Architecture:** `wcore-gsheet/src` remains the source of truth. The web consumes generated chain configs and a generated `/dev/deploy/chain-data.ts` file, with only small hand-maintained lists for deploy selection and explorer URLs.

**Tech Stack:** Google Apps Script chain modules, Node extraction scripts, TypeScript core/web tests.

---

### Task 1: Add RED Tests

**Files:**
- Modify: `wcore-web/packages/core/src/chains/chains.test.ts`
- Modify: `wcore-web/apps/web/app/dev/deploy/chain-params.test.ts`

- [ ] Add a core test asserting `getChain("ROBINHOOD_CHAIN")` has EVM, chainId `4663`, RPC `https://rpc.mainnet.chain.robinhood.com`, and ETH pricing ids.
- [ ] Add a deploy test asserting `buildAddEthereumChainParams(4663)` returns `chainId: "0x1237"`, `chainName: "Robinhood Chain"`, ETH native currency, and the Robinhood RPC.
- [ ] Run the targeted tests and confirm they fail because Robinhood Chain is missing.

### Task 2: Add Canonical GSheet Chain

**Files:**
- Create: `wcore-gsheet/src/ROBINHOOD_CHAIN.gs`

- [ ] Create a standard ChainFactory EVM file using key `ROBINHOOD_CHAIN`.
- [ ] Include standard main functions and diagnostic functions matching existing chain files.
- [ ] Use only validated RPC/native/explorer-neutral chain metadata; do not add unvalidated GT/DEX slugs.

### Task 3: Regenerate Chain Package and Web Deploy Data

**Files:**
- Generated: `wcore-gsheet/dist/chains/ROBINHOOD_CHAIN.ts`
- Modify: `wcore-gsheet/dist/chains/index.ts`
- Modify: `wcore-web/apps/web/app/dev/deploy/DeployClient.tsx`
- Generated: `wcore-web/apps/web/app/dev/deploy/chain-data.ts`
- Modify: `wcore-web/apps/web/lib/explorers.ts`

- [ ] Run `npm run build:chains` from `wcore-gsheet`.
- [ ] Add `ROBINHOOD_CHAIN` to `DEPLOY_CHAIN_KEYS` and `CHAIN_META` in `DeployClient.tsx`.
- [ ] Run `npx tsx scripts/extract-deploy-chain-data.mjs` from `wcore-web`.
- [ ] Add `robinhood_chain` to `EXPLORERS` with `https://robinhoodchain.blockscout.com`.

### Task 4: Verify

**Commands:**
- `npm run validate:static` in `wcore-gsheet`
- `npm run test:phase3-chains` in `wcore-gsheet`
- targeted web tests for chain config and chain params

- [ ] Run all verification commands.
- [ ] Report any failures with exact command output and fix only task-related issues.
