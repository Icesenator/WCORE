# Multicall3 Backport Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Multicall3 as an optimized EVM RPC transport in `wcore-gsheet` while preserving identical balance decisions and output behavior.

**Architecture:** Add a small Apps Script Multicall3 helper in `05_RPC.gs` that encodes/decodes `tryAggregate(false, calls)`. Wire it into `SimpleBalanceFetcher._scanBatch()` in `09_SIMPLE_ROTATION.gs` as a transport attempt before the existing JSON-RPC batch path, then normalize Multicall3 sub-results back into the existing `{ id, result/error }` format so the current consensus/cache logic remains unchanged.

**Tech Stack:** Google Apps Script `.gs`, JSON-RPC `eth_call`, Multicall3 ABI encoding, existing `Http`, `RpcHealth`, `RpcClient`, `SimpleBalanceFetcher`, Node static validator via `npm test`.

---

## File Map

- Modify: `src/05_RPC.gs`
  - Add `MULTICALL3_VERSION` and a `Multicall3` helper near the RPC client utilities.
  - Add an optional `RpcClient.multicall3()` wrapper if that is less invasive than calling `Multicall3.call()` directly.
  - Do not add cache storage.
- Modify: `src/09_SIMPLE_ROTATION.gs`
  - Update the file changelog/version header for the optimization.
  - Add a local transport branch in `_scanBatch()` that attempts Multicall3 before the current JSON-RPC batch logic.
  - Preserve all existing vote, metadata, fallback, retry, and cache-preservation logic.
- Modify: `src/11_EVM_ENGINE.gs`
  - Add a compact `mc3:used/fallback` diagnostic suffix to `INFO_NATIVE` after scan stats.
- Optional Modify: `scripts/validate-static.js`
  - Only if the validator flags a false positive caused by ABI strings; otherwise leave untouched.
- Do not modify:
  - Ledger sheets, `I2:I`, discovery modules, trigger code, or chain configs unless a chain must explicitly set `RPC.DISABLE_MULTICALL3` after verification.

## Task 1: Add Multicall3 Encode/Decode Helper

**Files:**
- Modify: `src/05_RPC.gs`

- [ ] **Step 1: Add helper constants and pure ABI functions**

Insert after `var RPC_VERSION = "4.15.33";` or immediately before `var RpcClient = {` if that keeps utility code closer to RPC execution.

```javascript
var MULTICALL3_VERSION = "4.15.49";

var Multicall3 = {
  ADDRESS: "0xcA11bde05977b3631167028862bE2a173976CA11",
  TRY_AGGREGATE_SELECTOR: "0xbce38bd7",

  _strip0x: function(hex) {
    return String(hex || "").replace(/^0x/i, "").toLowerCase();
  },

  _leftPad: function(hex, bytes) {
    bytes = bytes || 32;
    return this._strip0x(hex).padStart(bytes * 2, "0");
  },

  _rightPadWord: function(hex) {
    var clean = this._strip0x(hex);
    var padded = Math.ceil(clean.length / 64) * 64;
    return clean.padEnd(padded, "0");
  },

  encodeTryAggregate: function(requireSuccess, calls) {
    calls = calls || [];
    var head = this._leftPad(requireSuccess ? "1" : "0") + this._leftPad("40");
    var arrayLen = this._leftPad(calls.length.toString(16));
    var offsets = [];
    var cursor = calls.length * 32;
    var tails = "";

    for (var i = 0; i < calls.length; i++) {
      var c = calls[i] || {};
      var cleanData = this._strip0x(c.callData);
      var dataLen = cleanData.length / 2;
      var paddedData = this._rightPadWord(cleanData);
      var target = this._leftPad(c.target);
      var structEnc = target + this._leftPad("40") + this._leftPad(dataLen.toString(16)) + paddedData;
      offsets.push(cursor);
      tails += structEnc;
      cursor += structEnc.length / 2;
    }

    var offsetsHex = "";
    for (var j = 0; j < offsets.length; j++) offsetsHex += this._leftPad(offsets[j].toString(16));
    return this.TRY_AGGREGATE_SELECTOR + head + arrayLen + offsetsHex + tails;
  },

  decodeTryAggregateResult: function(hex) {
    var clean = this._strip0x(hex);
    if (clean.length < 128) return [];
    var arrayLen = parseInt(clean.slice(64, 128), 16);
    if (!isFinite(arrayLen) || arrayLen < 0) return [];

    var results = [];
    var tupleStartChar = 128;
    for (var i = 0; i < arrayLen; i++) {
      var headOffsetHex = clean.slice(tupleStartChar + i * 64, tupleStartChar + (i + 1) * 64);
      var headOffset = parseInt(headOffsetHex, 16);
      if (!isFinite(headOffset)) {
        results.push({ success: false, returnData: "0x" });
        continue;
      }
      var resultStart = tupleStartChar + headOffset * 2;
      if (resultStart + 192 > clean.length) {
        results.push({ success: false, returnData: "0x" });
        continue;
      }
      var success = parseInt(clean.slice(resultStart, resultStart + 64), 16) !== 0;
      var bytesLen = parseInt(clean.slice(resultStart + 128, resultStart + 192), 16);
      var dataStart = resultStart + 192;
      var dataEnd = dataStart + bytesLen * 2;
      var data = clean.slice(dataStart, Math.min(dataEnd, clean.length));
      results.push({ success: success, returnData: "0x" + data });
    }
    return results;
  }
};
```

- [ ] **Step 2: Add a diagnostic self-test function**

Add this near the helper. It is not a custom function and does not call HTTP.

```javascript
function DIAG_MULTICALL3_CODEC() {
  var calls = [
    { target: "0x0000000000000000000000000000000000000001", callData: "0x70a082310000000000000000000000001111111111111111111111111111111111111111" },
    { target: "0x0000000000000000000000000000000000000002", callData: "0x313ce567" }
  ];
  var encoded = Multicall3.encodeTryAggregate(false, calls);
  return [
    ["encoded_prefix", encoded.substring(0, 10)],
    ["contains_selector", encoded.indexOf(Multicall3.TRY_AGGREGATE_SELECTOR) === 0 ? "YES" : "NO"],
    ["length_even", encoded.length % 2 === 0 ? "YES" : "NO"]
  ];
}
```

- [ ] **Step 3: Run static validation**

Run: `rtk npm test`

Expected: validation passes with no syntax errors in `05_RPC.gs`.

Do not commit unless the user explicitly asks for a commit.

## Task 2: Add RPC Execution Wrapper

**Files:**
- Modify: `src/05_RPC.gs`

- [ ] **Step 1: Add `Multicall3.call()`**

Add this method inside the `Multicall3` object after `decodeTryAggregateResult`. If Task 1 already closed the object with `};`, replace the final `}` before `};` with the method separator below.

```javascript
  ,
  call: function(rpc, calls, timer, config) {
    if (!rpc) throw new Error("RPC unavailable");
    calls = calls || [];
    if (!calls.length) return [];
    if (config && config.RPC && config.RPC.DISABLE_MULTICALL3) throw new Error("multicall3 disabled");
    if (typeof RpcHealth !== "undefined" && !RpcHealth.isHealthy(rpc, config)) throw new Error("RPC blocked");

    var data = this.encodeTryAggregate(false, calls);
    var timeout = (config && config.TIMEOUTS && config.TIMEOUTS.HTTP_MS) || 2500;
    var resp = Http.post(rpc, {
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to: this.ADDRESS, data: data }, "latest"]
    }, { timeout: timeout, muteHttpExceptions: true }, config);

    if (!resp || resp.getResponseCode() !== 200) {
      if (typeof RpcHealth !== "undefined") RpcHealth.recordFailure(rpc, config);
      throw new Error("multicall3 http " + (resp ? resp.getResponseCode() : "null"));
    }

    var json;
    try { json = JSON.parse(resp.getContentText()); } catch (eParse) {
      if (typeof RpcHealth !== "undefined") RpcHealth.recordFailure(rpc, config);
      throw eParse;
    }
    if (!json || json.error || !json.result) {
      if (typeof RpcHealth !== "undefined") RpcHealth.recordFailure(rpc, config);
      throw new Error("multicall3 rpc error");
    }

    var decoded = this.decodeTryAggregateResult(json.result);
    if (decoded.length !== calls.length) {
      if (typeof RpcHealth !== "undefined") RpcHealth.recordFailure(rpc, config);
      throw new Error("multicall3 result length mismatch");
    }
    if (typeof RpcHealth !== "undefined") RpcHealth.recordSuccess(rpc);
    return decoded;
  }
```

- [ ] **Step 2: Add optional `RpcClient.multicall3()` wrapper**

Inside `var RpcClient = {`, add a method near `batchCall` methods.

```javascript
 multicall3: function(rpc, calls, timer, config) {
  if (typeof Multicall3 === "undefined" || !Multicall3.call) throw new Error("Multicall3 unavailable");
  return Multicall3.call(rpc, calls, timer, config);
 },
```

- [ ] **Step 3: Run static validation**

Run: `rtk npm test`

Expected: validation passes with no syntax errors in `05_RPC.gs`.

Do not commit unless the user explicitly asks for a commit.

## Task 3: Integrate Multicall3 Into `_scanBatch()` Transport

**Files:**
- Modify: `src/09_SIMPLE_ROTATION.gs`
- Modify: `src/11_EVM_ENGINE.gs`

- [ ] **Step 1: Update header/version notes**

At the top of `src/09_SIMPLE_ROTATION.gs`, add a new changelog entry above v4.15.46.

```javascript
 * Version: v4.13.10 -> v4.15.49 (Multicall3 transport optimization)
 *
 * OPTIMIZATION v4.15.49 - MULTICALL3 TRANSPORT:
 * ------------------------------------------------------------
 * ERC20 balanceOf/decimals/symbol/name calls are attempted via
 * Multicall3 tryAggregate(false) first, reducing N JSON-RPC calls
 * to one eth_call per RPC. Results are normalized into the same
 * response map as before, so consensus/cache behavior is unchanged.
 * Existing JSON-RPC batch/chunk/individual paths remain fallback.
```

Also update:

```javascript
var SIMPLE_ROTATION_VERSION = "4.15.49";
```

- [ ] **Step 2: Add request-to-multicall conversion inside `_scanBatch()`**

After `var maxBatchSize = ...;`, add:

```javascript
    var useMulticall3 = !(config && config.RPC && config.RPC.DISABLE_MULTICALL3);
    var multicallRequests = [];
    if (useMulticall3) {
      for (var mc = 0; mc < requests.length; mc++) {
        var req = requests[mc] || {};
        var params = req.params || [];
        var callObj = params[0] || {};
        if (req.method === "eth_call" && callObj.to && callObj.data) {
          multicallRequests.push({ id: req.id, target: callObj.to, callData: callObj.data });
        }
      }
      if (multicallRequests.length !== requests.length) useMulticall3 = false;
    }
```

- [ ] **Step 3: Add Multicall3 transport attempt before JSON-RPC fallback**

Replace the start of the `try` body around the existing transport branch with this structure. Keep the existing fallback branches exactly as they are after the Multicall3 attempt.

```javascript
        var parsed = null;
        var allOk = true;
        var usedMulticall3 = false;

        if (useMulticall3 && typeof RpcClient !== "undefined" && RpcClient.multicall3) {
          try {
            var mcCalls = [];
            for (var mci = 0; mci < multicallRequests.length; mci++) {
              mcCalls.push({ target: multicallRequests[mci].target, callData: multicallRequests[mci].callData });
            }
            var mcResults = RpcClient.multicall3(currentRpc, mcCalls, timer, config);
            if (mcResults && mcResults.length === multicallRequests.length) {
              parsed = [];
              var mcSuccessCount = 0;
              for (var mcr = 0; mcr < mcResults.length; mcr++) {
                var mcResult = mcResults[mcr];
                var originalReq = multicallRequests[mcr];
                if (mcResult && mcResult.success && mcResult.returnData && mcResult.returnData !== "0x") {
                  parsed.push({ id: originalReq.id, result: mcResult.returnData });
                  mcSuccessCount++;
                } else {
                  parsed.push({ id: originalReq.id, error: { message: "multicall3 subcall failed" }, result: null });
                }
              }
              if (mcSuccessCount > 0) {
                usedMulticall3 = true;
              } else {
                parsed = null;
                allOk = false;
              }
            }
          } catch (eMc) {
            parsed = null;
            allOk = false;
          }
        }

        if (!usedMulticall3) {
          allOk = true;
          if (config && config.RPC && config.RPC.DISABLE_JSON_RPC_BATCH && typeof RpcClient !== 'undefined' && RpcClient.batchCallIndividual) {
            try { parsed = RpcClient.batchCallIndividual(currentRpc, requests, timer, config); } catch (eBi) { parsed = null; allOk = false; }
          } else if (maxBatchSize > 0 && requests.length > maxBatchSize && typeof RpcClient !== 'undefined' && RpcClient.batchCallChunked) {
            try { parsed = RpcClient.batchCallChunked(currentRpc, requests, maxBatchSize, timer, config); } catch (eBc) { parsed = null; allOk = false; }
          } else {
            var resp = Http.post(currentRpc, requests, { timeout: httpTimeout, muteHttpExceptions: true }, config);
            if (resp && resp.getResponseCode() === 200) {
              try { parsed = JSON.parse(resp.getContentText()); } catch (eP) { parsed = null; }
            } else {
              allOk = false;
            }
          }
        }
```

- [ ] **Step 4: Verify parsing logic remains unchanged**

Ensure the existing block remains after the transport branch:

```javascript
        if (allOk && parsed) {
          if (parsed && Array.isArray(parsed)) {
            if (typeof RpcHealth !== 'undefined') RpcHealth.recordSuccess(currentRpc);
            rpcSuccess = true;
            successfulRpcCount++;
```

Do not change the `respById`, metadata extraction, balance conversion, vote addition, fallback, or asset update sections.

- [ ] **Step 5: Run static validation**

Run: `rtk npm test`

Expected: validation passes with no syntax errors in `09_SIMPLE_ROTATION.gs`.

Do not commit unless the user explicitly asks for a commit.

## Task 4: Add Minimal Runtime Diagnostics

**Files:**
- Modify: `src/09_SIMPLE_ROTATION.gs`

- [ ] **Step 1: Track Multicall3 usage in batch result**

At the top of `_scanBatch()`, add:

```javascript
    var multicall3UsedCount = 0;
    var multicall3FallbackCount = 0;
```

After a successful Multicall3 transport, increment:

```javascript
                multicall3UsedCount++;
```

Inside `if (!usedMulticall3) {`, before resetting `allOk`, increment only when Multicall3 was attempted:

```javascript
          if (useMulticall3) multicall3FallbackCount++;
```

In the `_scanBatch()` return object, include:

```javascript
multicall3UsedCount: multicall3UsedCount,
multicall3FallbackCount: multicall3FallbackCount
```

- [ ] **Step 2: Surface counters in `fullScan()` aggregation**

In `fullScan()` result initialization, add:

```javascript
      multicall3UsedCount: 0,
      multicall3FallbackCount: 0,
```

After each `batchResult`, aggregate:

```javascript
      result.multicall3UsedCount += batchResult.multicall3UsedCount || 0;
      result.multicall3FallbackCount += batchResult.multicall3FallbackCount || 0;
```

- [ ] **Step 3: Add compact INFO_NATIVE suffix**

In `src/11_EVM_ENGINE.gs`, after the existing fallback/meta suffixes around scan diagnostics, add:

```javascript
  if ((fullScanStats.multicall3UsedCount || 0) > 0 || (fullScanStats.multicall3FallbackCount || 0) > 0) {
  nativeInfo += " mc3:" + (fullScanStats.multicall3UsedCount || 0) + "/" + (fullScanStats.multicall3FallbackCount || 0);
  }
```

This is intentionally diagnostic-only: it changes an info suffix, not balance rows or consensus decisions.

- [ ] **Step 4: Run static validation**

Run: `rtk npm test`

Expected: validation passes.

Do not commit unless the user explicitly asks for a commit.

## Task 5: End-to-End Verification

**Files:**
- No new source changes expected.

- [ ] **Step 1: Run full static validation**

Run: `rtk npm test`

Expected: validation passes.

- [ ] **Step 2: Inspect final diff**

Run: `rtk git diff -- src/05_RPC.gs src/09_SIMPLE_ROTATION.gs src/11_EVM_ENGINE.gs docs/superpowers/specs/2026-05-26-multicall3-backport-design.md docs/superpowers/plans/2026-05-26-multicall3-backport.md`

Expected:

- Multicall3 helper is pure ABI/string logic plus one RPC wrapper.
- `_scanBatch()` falls back to the previous JSON-RPC path.
- No `eth_getLogs`, no discovery cursor, no writes to `I2:I`.

- [ ] **Step 3: Optional Apps Script push and runtime check**

Only if user asks to deploy.

Run: `powershell -File safe-push.ps1`

Expected: clasp push succeeds and `.clasp.json` rootDir is restored.

After push, run a known EVM ledger refresh or diagnostic and check:

- balances unchanged versus previous cache/known values
- `INFO_NATIVE` includes `mc3:x/y` on chains where Multicall3 succeeds
- if Multicall3 fails on a chain, scan still completes through JSON-RPC fallback

Do not commit, push, or deploy unless the user explicitly asks for that action.

## Self-Review Notes

- Spec coverage: Multicall3 helper, integration, fallback, no discovery, and `npm test` verification are covered.
- Placeholder scan: no TBD/TODO/fill-in-later steps remain.
- Type consistency: plan uses `Multicall3.call()`, `RpcClient.multicall3()`, `multicall3UsedCount`, and `multicall3FallbackCount` consistently.
- Scope guard: the plan explicitly excludes `eth_getLogs`, cursor block state, trigger discovery, and `I2:I` mutations.
