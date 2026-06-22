/************************************************************
 * 08_ASSETS.gs - Gestion des assets (multi-chain)
 * 
 * v4.15.1 - STRICT MAJORITY CONSENSUS
 ************************************************************/
var ASSETS_VERSION = "4.15.1";

/************************************************************
 * CHANGELOG:
 * v4.15.1 - STRICT MAJORITY CONSENSUS
 * - Changed consensus from quorum (>= 2) to strict majority (votes * 2 > total)
 * - Applied to getErc20BalancesPriority and getErc20Balances (in-loop + post-loop)
 * - Added totalVotes tracking per token for accurate majority calculation
 * - Prevents 2/4 ties from counting as consensus
 *
 * v4.12.30 - FALSE-ZERO TIE-BREAKING FIX
 * - BUG: With 2 RPCs returning different values (tied votes),
 *   JS object key iteration order made "0" win over real balance
 *   because numeric keys are iterated before string keys in V8
 * - FIX: When bestCount=1 and 2 values, prefer non-zero balance
 * - hasConsensus remains false so caller can apply additional safety
 *
 * v4.12.29 - PARALLEL NATIVE BALANCE FIX (CRITICAL)
 * - Sequential 2 RPCs took 20-30s causing timeouts
 * - FIX: Use parallel RPC calls by default (fetchAllSafe)
 * - Parallel 2 RPCs = ~10-15s (time of slowest, not sum)
 * - NEW: TIME_CRITICAL_MS (8s) - skip RPC if time too low
 * - NEW: PARALLEL_MAX_WAIT_MS (12s) - max wait for parallel
 * - Fallback to sequential only if parallel fails completely
 *
 * v4.12.28 - rrCursor FIX (PHASE 2 DETECTION)
 * - FIXED: rrCursor was always 0 when Priority/NeverScanned consumed all time
 * - REMOVED: v4.12.27 fix that incorrectly mixed allContracts and otherContracts
 * - NEW: phase2Executed flag tracks if Discovery phase actually ran
 * - CLARIFIED: rrCursor is ONLY relative to otherContracts (Discovery tokens)
 * - CORRECT BEHAVIOR: rrCursor=0 with cycle=partial is VALID when Phase 2 did not run
 * - Discovery will resume from saved position when more time is available
 *
 * v4.12.24 - GUARANTEED NEVER_SCANNED EXECUTION
 * - CRITICAL FIX: Moved NEVER_SCANNED phase BEFORE batch priority
 * - NEW: Reserved time budget (4s) guarantees never-scanned tokens get processed
 * - NEW: Phase order is now: Individual Priority â†’ NEVER_SCANNED â†’ Batch Priority â†’ Discovery
 * - FIXED: Tokens in tokenRange that were never scanned are now guaranteed to be reached
 * - Increased NEVER_SCANNED_MAX_PER_RUN from 20 to 30
 * - Reduced PRIORITY_BATCH_MAX_MS from 15000 to 8000 to leave time for discovery
 *
 * v4.12.23 - NEVER_SCANNED TOKENS FIX
 * - NEW: Tokens never attempted (not in attemptTsMap) are HIGH PRIORITY
 * - 3 categories: PRIORITY (has balance) > NEVER_SCANNED > DISCOVERY (round-robin)
 * - Guarantees all tokens in tokensRange get scanned within a few runs
 * - Fixes bug where new tokens were never discovered due to time exhaustion
 *
 * v4.12.22 - UNIFIED CONSENSUS RULE (ITERATIVE) + BLACKLIST
 * - RULE: ALL balance changes require 2+ votes agreeing (majoritÃ© absolue)
 * - ITERATIVE: Keep calling RPCs until consensus OR all exhausted
 * - CACHE AS RPC: Cache counts as 1 vote if no recent transaction
 * - BLACKLIST: RPCs that disagree with consensus get recordFailure()
 * 
 * ALGORITHM:
 * 1. Add cache vote first (if !hasRecentActivity)
 * 2. Call RPC1 â†’ add vote â†’ check for 2+ agreeing
 * 3. If no consensus, call RPC2 â†’ add vote â†’ recheck
 * 4. Continue until consensus OR no more RPCs
 * 5. BLACKLIST RPCs that gave wrong answer
 * 6. No consensus = keep existing state unchanged
 * 
 * EXAMPLES:
 * - Cache=100, RPC1=100 â†’ 2 votes for 100 â†’ consensus! â†’ done
 * - Cache=100, RPC1=0 â†’ no consensus â†’ call RPC2
 * - Cache=100, RPC1=0, RPC2=0 â†’ 2 votes for 0 â†’ consensus â†’ purge â†’ BLACKLIST RPC1 (wrong!)
 * - 1 RPC only + no cache â†’ no consensus â†’ keep existing
 * 
 * CHAIN WITH FEW RPCS:
 * - 2 RPCs available: cache becomes critical tie-breaker
 * - 1 RPC only: must agree with cache, else no change
 *
 * v4.12.12 - SEQUENTIAL MAJORITY CONSENSUS + BLACKLIST
 * v4.12.11 - SCAN DIAGNOSTIC
 * v4.12.10 - RESILIENT MULTI-RPC (fetchAllSafe)
 * v4.12.9 - CONSENSUS FOR ALL TOKENS
 * v4.12.8 - ROTATION OPTIMIZATION
 * v4.12.7 - HOTFIX: Infinite loop prevention
 * v4.12.6 - Round-robin cursor advancement
 * v4.12.5 - Multi-RPC retry for failed batch calls
 * v4.12.4 - Protection anti-purge
 * v4.12.3 - Two-phase scan with priority
 ************************************************************/

// ============================================================
// v4.12.23: ROTATION CONFIG - Tunable parameters
// ============================================================

var ROTATION_CONFIG = {
  // Time budget allocation
  TARGET_BALANCE_PHASE_MS: 22000, // Target time for balance phase (of 30s total)
  SAFE_MARGIN_MS: 2000, // Safety margin before hard cutoff
  
  // Batch timing estimates (will be adapted dynamically)
  BATCH_TIME_ESTIMATE_MS: 800, // Estimated time per batch (adjusted at runtime)
  MIN_BATCH_TIME_MS: 300, // Minimum batch time (fast RPC)
  MAX_BATCH_TIME_MS: 2500, // Maximum batch time (slow RPC)
  
  // Coverage targets
  MIN_BATCHES_PER_RUN: 3, // Minimum batches even with little time
  MAX_BATCHES_ABSOLUTE: 30, // Absolute maximum to prevent runaway
  
  // Priority phase allocation 
  PRIORITY_INDIVIDUAL_MAX: 15, // Max tokens for individual (consensus) scan
  PRIORITY_BATCH_MAX_MS: 8000, // v4.12.24: Max time for batch priority (was 15000)
  
  // v4.12.24: NEVER_SCANNED tokens - GUARANTEED EXECUTION
  // These tokens have NEVER been attempted - they MUST be scanned
  // Moved BEFORE batch priority to guarantee execution
  NEVER_SCANNED_GUARANTEED: true, // Always process never-scanned before batch priority
  NEVER_SCANNED_RESERVED_MS: 4000, // Reserved time budget for never-scanned
  NEVER_SCANNED_MAX_PER_RUN: 30, // Max never-scanned tokens per run (increased)
  NEVER_SCANNED_BATCH_SIZE: 10, // Batch size for never-scanned tokens
  
  // v4.12.36: PURGED TOKEN RESCAN
  // After this TTL, purged tokens are re-categorized as NEVER_SCANNED
  // This prevents tokens from being stuck in low-priority DISCOVERY forever
  // Use case: RPC returned 0 by mistake, token should be retried with priority
  PURGED_RESCAN_TTL_MS: 6 * 3600 * 1000 // 6 hours - after this, retry as NEVER_SCANNED
};

// ============================================================
// ASSET MANAGER
// ============================================================

var AssetManager = {
  
  upsert: function(assetByKey, asset) {
    if (!asset || !asset.contract) return;
    var key = (asset.contract === "native") ? "native" : Addr.normalize(asset.contract);
    if (!key) return;
    
    var existing = assetByKey[key];
    if (!existing) {
      assetByKey[key] = { symbol: asset.symbol || "", name: asset.name || "", contract: key, balance: asset.balance };
      if (Num.isValidPositive(asset.price_eur)) assetByKey[key].price_eur = asset.price_eur;
      return;
    }
    
    var prevBal = Num.parse(existing.balance);
    var newBal = Num.parse(asset.balance);
    if (newBal != null && newBal >= 0 && (prevBal == null || newBal !== prevBal)) existing.balance = asset.balance;
    if (!existing.symbol && asset.symbol) existing.symbol = asset.symbol;
    if (!existing.name && asset.name) existing.name = asset.name;
    if (!Num.isValidPositive(existing.price_eur) && Num.isValidPositive(asset.price_eur)) existing.price_eur = asset.price_eur;
  },
  
  /**
   * v4.12.20 FIX: Safe purge with consensus requirement
   */
  purgeIfZero: function(assetByKey, contract, balance, purgedTsMap, balanceTsMap, nowMs, hasConsensus) {
    if (!assetByKey || !contract) return;
    var key = Addr.normalize(contract);
    if (!key) return;
    
    var isZero = false;
    var n = Num.parse(balance);
    if (n != null) isZero = (n === 0);
    else {
      var s = String(balance || "").trim().replace(/\s+/g, "").replace(",", ".");
      if (s && /^0+(\.0+)?$/.test(s)) isZero = true;
    }
    if (!isZero) return;
    
    var existing = assetByKey[key];
    var hadPositiveBalance = existing && Num.isPositive(existing.balance);
    
    if (existing) {
      existing.balance = 0;
    }
    
    if (hadPositiveBalance && !hasConsensus) {
      return;
    }
    
    delete assetByKey[key];
    if (purgedTsMap) purgedTsMap[key] = nowMs;
    if (balanceTsMap) balanceTsMap[key] = 0;
  },
  
  toArray: function(assetByKey) {
    var out = [];
    Obj.forEach(assetByKey, function(key, asset) {
      if (!asset || !asset.contract) return;
      out.push({ contract: asset.contract, symbol: asset.symbol || "", name: asset.name || "", balance: asset.balance, price_eur: asset.price_eur });
    });
    return out;
  },
  
  normalizeMetadata: function(assets) {
    if (!assets || !assets.length) return;
    for (var i = 0; i < assets.length; i++) {
      var a = assets[i];
      if (!a) continue;
      a.symbol = a.symbol ? String(a.symbol).trim() : "";
      a.name = a.name ? String(a.name).trim() : "";
    }
  },
  
  filterForCache: function(assets) {
    if (!assets || !assets.length) return [];
    var out = [];
    for (var i = 0; i < assets.length; i++) {
      var a = assets[i];
      if (!a || !a.contract) continue;
      if (a.contract === "native") { out.push(a); continue; }
      if (Num.isPositive(a.balance)) out.push(a);
    }
    return out;
  }
};

// ============================================================
// BALANCE FETCHER
// ============================================================

var BalanceFetcher = {
  SELECTOR_BALANCE_OF: "0x70a08231",
  
  // v4.12.29: Time threshold below which we skip RPC and use cache
  TIME_CRITICAL_MS: 8000,
  
  // v4.12.29: Maximum time to wait for parallel calls
  PARALLEL_MAX_WAIT_MS: 12000,
  
  _batchTimings: [],
  _avgBatchMs: ROTATION_CONFIG.BATCH_TIME_ESTIMATE_MS,
  
  _updateBatchTiming: function(elapsedMs) {
    this._batchTimings.push(elapsedMs);
    if (this._batchTimings.length > 10) {
      this._batchTimings.shift();
    }
    if (this._batchTimings.length > 0) {
      var sum = 0;
      for (var i = 0; i < this._batchTimings.length; i++) {
        sum += this._batchTimings[i];
      }
      this._avgBatchMs = Math.round(sum / this._batchTimings.length);
      this._avgBatchMs = Math.max(ROTATION_CONFIG.MIN_BATCH_TIME_MS, 
        Math.min(ROTATION_CONFIG.MAX_BATCH_TIME_MS, this._avgBatchMs));
    }
  },
  
  _calculateMaxBatches: function(remainingMs, safeSaveMargin) {
    var availableMs = remainingMs - safeSaveMargin - 500;
    if (availableMs <= 0) return 0;
    
    var effectiveBatchMs = Math.round(this._avgBatchMs * 1.2);
    var calculated = Math.floor(availableMs / effectiveBatchMs);
    
    return Math.max(ROTATION_CONFIG.MIN_BATCHES_PER_RUN, 
      Math.min(ROTATION_CONFIG.MAX_BATCHES_ABSOLUTE, calculated));
  },

  /**
   * v4.12.29: PARALLEL-FIRST Native Balance Fetcher
   * 
   * CRITICAL CHANGE: Uses parallel RPC calls by default because:
   * 1. Google Apps Script IGNORES timeout parameter in UrlFetchApp.fetch()
   * 2. Sequential 2 RPCs = 20-30s (each can take 10-15s)
   * 3. Parallel 2 RPCs = 10-15s (only slowest RPC matters)
   * 
   * @param {string} address - Wallet address
   * @param {string} userRpc - User-provided RPC (optional)
   * @param {Object} timer - Timer object with remaining() method
   * @param {number} rpcCount - Number of RPCs for consensus (default: 2)
   * @param {Object} config - Chain configuration
   * @returns {Object} {balance, hasConsensus, method} or null
   */
  getNativeBalance: function(address, userRpc, timer, rpcCount, config) {
    rpcCount = Math.min(rpcCount || 2, 2);
    
    // v4.12.29: Time-critical mode - if less than 8s remaining, skip RPC
    // The caller (EVM_ENGINE) will use cached balance as fallback
    if (timer && timer.remaining() < this.TIME_CRITICAL_MS) {
      return { balance: null, hasConsensus: false, skipped: 'time_critical', method: 'skipped' };
    }
    
    // v4.12.29: Reduce to single RPC if time is tight but not critical
    if (timer && timer.remaining() < 15000) {
      rpcCount = 1;
    }
    
    // v4.12.29: PARALLEL FIRST - faster because Google ignores timeouts
    try {
      var result = this._getNativeParallel(address, userRpc, timer, rpcCount, config);
      if (result) {
        result.method = result.method || 'parallel';
        return result;
      }
    } catch (parallelErr) {
      // Parallel failed completely - try sequential as fallback
    }
    
    // v4.12.29: Sequential fallback - only if we still have time
    if (timer && timer.remaining() > this.TIME_CRITICAL_MS) {
      try {
        var seqResult = this._getNativeSequential(address, userRpc, timer, 1, config);
        if (seqResult) {
          seqResult.method = 'sequential_fallback';
          return seqResult;
        }
      } catch (seqErr) {
        // Both methods failed
      }
    }
    
    return null;
  },
  
  /**
   * v4.15.50: Cold-start RPC probe.
   * When NO candidate RPC has health data yet, all appear "healthy" and
   * pickForConsensus may pick dead RPCs listed first, ignoring a working one
   * further down. Probe all candidates in parallel with eth_blockNumber
   * (NOT eth_chainId — some Blockscout proxies return null for chainId) and
   * mark dead ones as failed so the next pickForConsensus excludes them.
   * Runs at most once per execution per chain.
   */
  _coldProbeFlag: {},

  _coldStartProbeIfNeeded: function(userRpc, config, timer) {
    try {
      var chainId = (config && config.CHAIN && config.CHAIN.CHAIN_ID) || 0;
      if (this._coldProbeFlag[chainId]) return;

      // Skip under time/quota pressure
      if (timer && timer.remaining() < 6000) return;
      if (typeof QuotaCircuitBreaker !== 'undefined' && QuotaCircuitBreaker.isTripped && QuotaCircuitBreaker.isTripped()) return;

      // Gather ALL candidates (request a large count to see the full list)
      var candidates = RpcSelector.pickForConsensus(userRpc, 5, config);
      if (!candidates || candidates.length < 2) { this._coldProbeFlag[chainId] = true; return; }

      // Cold-start = none of the candidates has health state yet
      var anyKnown = false;
      for (var i = 0; i < candidates.length; i++) {
        if (RpcHealth._state && RpcHealth._state[candidates[i]]) { anyKnown = true; break; }
      }
      if (anyKnown) { this._coldProbeFlag[chainId] = true; return; }

      var timeoutMs = (config && config.TIMEOUTS && config.TIMEOUTS.FAST_FAIL_MS) || 4000;
      var requests = [];
      for (var j = 0; j < candidates.length; j++) {
        requests.push({
          url: candidates[j], method: "post", contentType: "application/json",
          payload: JSON.stringify({ jsonrpc: "2.0", id: j, method: "eth_blockNumber", params: [] }),
          muteHttpExceptions: true, timeout: timeoutMs
        });
      }
      var responses = Http.fetchAllSafe(requests, config);
      for (var k = 0; k < responses.length; k++) {
        var rpcUrl = candidates[k];
        var resp = responses[k];
        var ok = false;
        try {
          if (resp && resp.getResponseCode() === 200) {
            var json = JSON.parse(resp.getContentText());
            if (json && !json.error && json.result != null) ok = true;
          }
        } catch (eParse) {}
        if (ok) RpcHealth.recordSuccess(rpcUrl);
        else RpcHealth.recordFailure(rpcUrl, config);
      }
      this._coldProbeFlag[chainId] = true;
    } catch (e) {
      // Probe is best-effort; never block the scan on probe errors
      try { var cid = (config && config.CHAIN && config.CHAIN.CHAIN_ID) || 0; this._coldProbeFlag[cid] = true; } catch (e2) {}
    }
  },

  /**
   * v4.12.29: Enhanced Parallel Native Balance Fetcher
   * 
   * Uses Http.fetchAllSafe() to call multiple RPCs simultaneously.
   * All requests complete in the time of the SLOWEST single RPC.
   */
  _getNativeParallel: function(address, userRpc, timer, rpcCount, config) {
    var fastFailMs = (config && config.TIMEOUTS && config.TIMEOUTS.FAST_FAIL_MS) || 4000;
    var httpTimeout = (config && config.TIMEOUTS && config.TIMEOUTS.HTTP_MS) || fastFailMs;
    var effectiveTimeout = Math.min(fastFailMs, httpTimeout);

    // v4.15.50: Eliminate dead RPCs before consensus selection on cold-start
    this._coldStartProbeIfNeeded(userRpc, config, timer);
    
    // v4.12.29: Request more RPCs than needed for redundancy
    var requestCount = Math.min(rpcCount + 2, 5);
    var rpcList = RpcSelector.pickForConsensus(userRpc, requestCount, config);
    var maxReq = Math.min(rpcList.length, rpcCount + 1);
    
    if (!rpcList.length) {
      throw new Error("no RPCs available");
    }
    
    // Check time budget
    var minTimeNeeded = Math.min(effectiveTimeout, this.PARALLEL_MAX_WAIT_MS) + 2000;
    if (timer && timer.remaining() < minTimeNeeded) {
      throw new Error("insufficient time: " + timer.remaining() + "ms < " + minTimeNeeded + "ms");
    }
    
    // Build parallel requests
    var requests = [];
    for (var i = 0; i < maxReq; i++) {
      requests.push({
        url: rpcList[i], 
        method: "post", 
        contentType: "application/json",
        payload: JSON.stringify({ 
          jsonrpc: "2.0", 
          id: i, 
          method: "eth_getBalance", 
          params: [String(address), "latest"] 
        }),
        muteHttpExceptions: true,
        timeout: effectiveTimeout
      });
    }
    
    // Execute parallel calls
    var t0 = Date.now();
    var responses = Http.fetchAllSafe(requests, config);
    var fetchTime = Date.now() - t0;

    // Parse responses
    var values = [];
    var rpcToValue = {};
    var nativeDecimals = (config && config.CHAIN && config.CHAIN.NATIVE_DECIMALS) || 18;
    
    for (var k = 0; k < responses.length; k++) {
      var rpcUsed = rpcList[k];
      try {
        var resp = responses[k];
        if (!resp) {
          RpcHealth.recordFailure(rpcUsed, config);
          continue;
        }
        
        var code = resp.getResponseCode();
        if (code !== 200) { 
          RpcHealth.recordFailure(rpcUsed, config); 
          continue; 
        }
        
        var json = JSON.parse(resp.getContentText());
        if (!json || json.error || !json.result) { 
          RpcHealth.recordFailure(rpcUsed, config); 
          continue; 
        }
        
        var raw = BigInt(json.result);
        var val = BigNum.toDecimal(raw, nativeDecimals);
        RpcHealth.recordSuccess(rpcUsed);
        values.push(val);
        rpcToValue[rpcUsed] = val;
      } catch (e) { 
        RpcHealth.recordFailure(rpcUsed, config); 
      }
    }
    
    // No valid responses
    if (!values.length) {
      throw new Error("all " + maxReq + " RPCs failed (" + fetchTime + "ms)");
    }
    
    // Single response - no consensus possible
    if (values.length === 1) {
      return { 
        balance: values[0], 
        hasConsensus: false, 
        method: 'parallel_single',
        rpcCount: 1,
        fetchTimeMs: fetchTime
      };
    }
    
    // Find consensus among multiple responses
    var counts = {};
    for (var v = 0; v < values.length; v++) {
      var key = String(values[v]);
      counts[key] = (counts[key] || 0) + 1;
    }
    
    var best = null, bestCount = 0;
    for (var bk in counts) {
      if (counts[bk] > bestCount) { 
        bestCount = counts[bk]; 
        best = parseFloat(bk); 
      }
    }
    
    // v4.12.30: When tied votes (2 RPCs, 2 different values), prefer non-zero
    // False-zero from bad RPCs is far more common than real zero-balance
    // hasConsensus will still be false, so EVM_ENGINE can reject if needed
    if (bestCount === 1 && values.length === 2) {
      var nonZeroVal = null;
      for (var nz = 0; nz < values.length; nz++) {
        if (values[nz] > 0) { nonZeroVal = values[nz]; break; }
      }
      if (nonZeroVal != null) {
        best = nonZeroVal;
      }
    }
    
    // Blacklist RPCs that disagreed with consensus
    if (bestCount >= 2) {
      for (var rpc in rpcToValue) {
        if (String(rpcToValue[rpc]) !== String(best)) {
          RpcHealth.recordFailure(rpc, config);
        }
      }
    }
    
    return { 
      balance: best, 
      hasConsensus: bestCount >= 2, 
      method: 'parallel',
      rpcCount: values.length,
      fetchTimeMs: fetchTime
    };
  },

  // v4.12.28: Sequential method - used as fallback only
  _getNativeSequential: function(address, userRpc, timer, rpcCount, config) {
    var fastFailMs = (config && config.TIMEOUTS && config.TIMEOUTS.FAST_FAIL_MS) || 4000;
    var httpTimeout = (config && config.TIMEOUTS && config.TIMEOUTS.HTTP_MS) || fastFailMs;
    var effectiveTimeout = Math.min(fastFailMs, httpTimeout);
    var nativeDecimals = (config && config.CHAIN && config.CHAIN.NATIVE_DECIMALS) || 18;
    
    var rpcList = RpcSelector.pickForConsensus(userRpc, 5, config);
    if (!rpcList || !rpcList.length) {
      rpcList = userRpc ? [userRpc] : [];
    }
    if (!rpcList.length) return null;
    
    var values = [];
    var rpcToValue = {};
    
    for (var i = 0; i < rpcList.length && values.length < rpcCount; i++) {
      if (timer && timer.remaining() < (effectiveTimeout + 500)) break;
      
      var rpc = rpcList[i];
      try {
        var hex = RpcClient.call(rpc, "eth_getBalance", [String(address), "latest"], timer, 1, config);
        if (hex) {
          var raw = BigInt(hex);
          var val = BigNum.toDecimal(raw, nativeDecimals);
          values.push(val);
          rpcToValue[rpc] = val;
          RpcHealth.recordSuccess(rpc);
          
          if (values.length >= 2) {
            if (values[0] === values[1]) {
              return { balance: values[0], hasConsensus: true };
            }
          }
        }
      } catch (e) {
        RpcHealth.recordFailure(rpc, config);
      }
    }
    
    if (!values.length) return null;
    if (values.length === 1) return { balance: values[0], hasConsensus: false };
    
    var counts = {};
    for (var v = 0; v < values.length; v++) {
      var key = String(values[v]);
      counts[key] = (counts[key] || 0) + 1;
    }
    
    var best = null, bestCount = 0;
    for (var bk in counts) {
      if (counts[bk] > bestCount) { bestCount = counts[bk]; best = parseFloat(bk); }
    }
    
    if (bestCount >= 2) {
      var chosenKey = String(best);
      for (var rpcUrl in rpcToValue) {
        if (String(rpcToValue[rpcUrl]) !== chosenKey) {
          RpcHealth.recordFailure(rpcUrl, config);
        }
      }
    }
    
    return { balance: best, hasConsensus: bestCount >= 2 };
  },
  
  /**
   * Get ERC20 balances with PRIORITY mode (individual consensus per token)
   */
  getErc20BalancesPriority: function(rpc, walletAddress, contracts, assetByKey, balanceTsMap, attemptTsMap, purgedTsMap, metaMap, nowMs, timer, budget, config, hasRecentActivity) {
    var updated = 0;
    var attempted = 0;
    if (!walletAddress || !contracts || !contracts.length) return { updated: updated, attempted: attempted };
    
    var safeSaveMargin = (config && config.TIMEOUTS && config.TIMEOUTS.SAFE_SAVE_MARGIN_MS) || 1500;
    var decimalsFallback = (config && config.LIMITS && config.LIMITS.DECIMALS_FALLBACK) || 18;
    var addr = String(walletAddress).toLowerCase();
    
    var allRpcs = RpcSelector.pickForConsensus(rpc, 5, config);
    if (!allRpcs || allRpcs.length === 0) {
      allRpcs = rpc ? [rpc] : [];
    }
    if (allRpcs.length === 0) {
      return { updated: updated, attempted: attempted };
    }
    
    for (var i = 0; i < contracts.length; i++) {
      if (timer && timer.remaining() < (safeSaveMargin + 400)) break;
      
      var contract = Addr.normalize(contracts[i]);
      if (!contract || contract === "native") continue;
      
      attempted++;
      var meta = TokenMeta.get(rpc, contract, metaMap, nowMs, timer, budget, config);
      var decimals = (meta && Num.isValid(meta.decimals)) ? meta.decimals : decimalsFallback;
      var callData = this.SELECTOR_BALANCE_OF + Addr.pad32(addr);
      
      var existingAsset = assetByKey[contract];
      var cachedBalance = existingAsset ? Num.parse(existingAsset.balance) : null;
      var cacheCanVote = !hasRecentActivity && cachedBalance !== null;
      
      var balanceVotes = {};
      var rpcToBalance = {};
      var totalVotes = 0;
      var rpcIndex = 0;
      var hasConsensus = false;
      var chosenBalance = null;

      if (cacheCanVote) {
        var cacheKey = String(cachedBalance);
        balanceVotes[cacheKey] = (balanceVotes[cacheKey] || 0) + 1;
        totalVotes = 1;
      }

      while (rpcIndex < allRpcs.length && !hasConsensus) {
        if (timer && timer.remaining() < (safeSaveMargin + 400)) break;

        var currentRpc = allRpcs[rpcIndex];
        rpcIndex++;

        try {
          var hex = RpcClient.call(currentRpc, "eth_call", [{ to: contract, data: callData }, "latest"], timer, 1, config);
          if (hex) {
            var rawBal = BigInt(hex || "0x0");
            var bal = BigNum.toDecimal(rawBal, decimals);
            var balKey = String(bal);

            balanceVotes[balKey] = (balanceVotes[balKey] || 0) + 1;
            totalVotes++;
            rpcToBalance[currentRpc] = bal;
            RpcHealth.recordSuccess(currentRpc);

            // v4.15.1: True strict majority — votes > totalVotes / 2
            if (balanceVotes[balKey] * 2 > totalVotes) {
              hasConsensus = true;
              chosenBalance = bal;
            }
          }
        } catch (e) {
          RpcHealth.recordFailure(currentRpc, config);
        }
      }

      if (!hasConsensus) {
        var maxVotes = 0;
        for (var bk in balanceVotes) {
          if (balanceVotes[bk] > maxVotes) {
            maxVotes = balanceVotes[bk];
            chosenBalance = parseFloat(bk);
          }
        }
        // v4.15.1: True strict majority
        hasConsensus = (totalVotes > 0 && maxVotes * 2 > totalVotes);
      }
      
      if (hasConsensus && chosenBalance !== null) {
        var chosenKey = String(chosenBalance);
        for (var rpcUrl in rpcToBalance) {
          if (String(rpcToBalance[rpcUrl]) !== chosenKey) {
            RpcHealth.recordFailure(rpcUrl, config);
          }
        }
      }
      
      if (!hasConsensus) {
        continue;
      }
      
      balanceTsMap[contract] = nowMs;
      
      if (!Num.isPositive(chosenBalance)) {
        AssetManager.purgeIfZero(assetByKey, contract, chosenBalance, purgedTsMap, balanceTsMap, nowMs, true);
        continue;
      }
      
      AssetManager.upsert(assetByKey, { contract: contract, symbol: meta.symbol || "", name: meta.name || "", balance: chosenBalance });
      updated++;
    }
    
    return { updated: updated, attempted: attempted };
  },
  
  /**
   * Get ERC20 balances in batch mode with UNIFIED CONSENSUS
   * v4.12.23: Added isNeverScanned parameter for relaxed consensus on new tokens
   */
  getErc20Balances: function(rpc, walletAddress, contracts, assetByKey, balanceTsMap, attemptTsMap, purgedTsMap, metaMap, nowMs, timer, budget, config, hasRecentActivity, isNeverScannedBatch) {
    var updated = 0;
    var attempted = 0;
    if (!walletAddress || !contracts || !contracts.length) return { updated: updated, attempted: attempted };
    
    var safeSaveMargin = (config && config.TIMEOUTS && config.TIMEOUTS.SAFE_SAVE_MARGIN_MS) || 1500;
    var decimalsFallback = (config && config.LIMITS && config.LIMITS.DECIMALS_FALLBACK) || 18;
    var addr = String(walletAddress).toLowerCase();
    
    var allRpcs = RpcSelector.pickForConsensus(rpc, 5, config);
    if (!allRpcs || allRpcs.length === 0) {
      allRpcs = rpc ? [rpc] : [];
    }
    if (allRpcs.length === 0) {
      return { updated: updated, attempted: attempted };
    }
    
    var requests = [];
    var validContracts = [];
    
    for (var i = 0; i < contracts.length; i++) {
      if (timer && timer.remaining() < (safeSaveMargin + 300)) break;
      
      var contract = Addr.normalize(contracts[i]);
      if (!contract || contract === "native") continue;
      
      attempted++;
      // v4.12.23: Mark as attempted NOW so we don't retry forever
      if (attemptTsMap) attemptTsMap[contract] = nowMs;
      
      var callData = this.SELECTOR_BALANCE_OF + Addr.pad32(addr);
      requests.push({
        jsonrpc: "2.0",
        id: i,
        method: "eth_call",
        params: [{ to: contract, data: callData }, "latest"]
      });
      validContracts.push(contract);
    }
    
    if (!requests.length) return { updated: updated, attempted: attempted };
    
    var tokenVotes = {};
    for (var v = 0; v < validContracts.length; v++) {
      var c = validContracts[v];
      tokenVotes[c] = { balanceVotes: {}, rpcToBalance: {}, hasConsensus: false, chosenBalance: null, totalVotes: 0 };

      var existingAsset = assetByKey[c];
      var cachedBalance = existingAsset ? Num.parse(existingAsset.balance) : null;
      if (!hasRecentActivity && cachedBalance !== null) {
        var cacheKey = String(cachedBalance);
        tokenVotes[c].balanceVotes[cacheKey] = 1;
        tokenVotes[c].totalVotes = 1;
      }
    }
    
    var httpTimeout = (config && config.TIMEOUTS && config.TIMEOUTS.HTTP_MS) || 2500;
    var rpcIndex = 0;
    
    while (rpcIndex < allRpcs.length) {
      if (timer && timer.remaining() < (safeSaveMargin + 1000)) break;
      
      var allHaveConsensus = true;
      for (var tc in tokenVotes) {
        if (!tokenVotes[tc].hasConsensus) {
          allHaveConsensus = false;
          break;
        }
      }
      if (allHaveConsensus) break;
      
      var currentRpc = allRpcs[rpcIndex];
      rpcIndex++;
      
      try {
        var resp = Http.post(currentRpc, requests, { timeout: httpTimeout, muteHttpExceptions: true }, config);
        
        if (resp && resp.getResponseCode() === 200) {
          var parsed = JSON.parse(resp.getContentText());
          if (parsed && Array.isArray(parsed)) {
            RpcHealth.recordSuccess(currentRpc);
            
            for (var j = 0; j < validContracts.length; j++) {
              var contract = validContracts[j];
              var tv = tokenVotes[contract];
              
              if (tv.hasConsensus) continue;
              
              var res = parsed[j];
              if (res && !res.error && res.result) {
                var hex = res.result || "0x0";
                if (hex === "0x") hex = "0x0";
                
                try {
                  var meta = TokenMeta.get(rpc, contract, metaMap, nowMs, timer, budget, config);
                  var decimals = (meta && Num.isValid(meta.decimals)) ? meta.decimals : decimalsFallback;
                  
                  var rawBal = BigInt(hex);
                  var bal = BigNum.toDecimal(rawBal, decimals);
                  var balKey = String(bal);
                  
                  tv.balanceVotes[balKey] = (tv.balanceVotes[balKey] || 0) + 1;
                  tv.totalVotes = (tv.totalVotes || 0) + 1;
                  tv.rpcToBalance[currentRpc] = bal;

                  // v4.15.1: True strict majority — votes > totalVotes / 2
                  // Before: >= 2 was a quorum, not a majority (2/4 is a tie, not a win)
                  if (tv.balanceVotes[balKey] * 2 > tv.totalVotes) {
                    tv.hasConsensus = true;
                    tv.chosenBalance = bal;
                  }
                } catch (e) {}
              }
            }
          } else {
            RpcHealth.recordFailure(currentRpc, config);
          }
        } else {
          RpcHealth.recordFailure(currentRpc, config);
        }
      } catch (e) {
        RpcHealth.recordFailure(currentRpc, config);
      }
    }
    
    // Process final results for each token
    for (var j2 = 0; j2 < validContracts.length; j2++) {
      var contract = validContracts[j2];
      var tv = tokenVotes[contract];
      
      // If no consensus yet, find max votes
      if (!tv.hasConsensus) {
        var maxVotes = 0;
        for (var bk in tv.balanceVotes) {
          if (tv.balanceVotes[bk] > maxVotes) {
            maxVotes = tv.balanceVotes[bk];
            tv.chosenBalance = parseFloat(bk);
          }
        }
        // v4.15.1: True strict majority — maxVotes must be > half of totalVotes
        tv.hasConsensus = (tv.totalVotes > 0 && maxVotes * 2 > tv.totalVotes);

        // v4.12.23: NEVER_SCANNED RELAXED CONSENSUS
        // For tokens that have never been scanned, accept single RPC if balance > 0
        // These tokens have nothing to lose (no existing balance to protect)
        if (!tv.hasConsensus && isNeverScannedBatch && maxVotes >= 1) {
          var singleVoteBalance = tv.chosenBalance;
          if (singleVoteBalance > 0) {
            tv.hasConsensus = true;
            // Note: we accept single vote only for POSITIVE balances
            // Zero balances still require consensus to avoid false negatives
          }
        }
      }
      
      // Blacklist RPCs that disagree with consensus
      if (tv.hasConsensus && tv.chosenBalance !== null) {
        var chosenKey = String(tv.chosenBalance);
        for (var rpcUrl in tv.rpcToBalance) {
          if (String(tv.rpcToBalance[rpcUrl]) !== chosenKey) {
            RpcHealth.recordFailure(rpcUrl, config);
          }
        }
      }
      
      if (!tv.hasConsensus) {
        continue;
      }
      
      balanceTsMap[contract] = nowMs;
      
      if (!Num.isPositive(tv.chosenBalance)) {
        AssetManager.purgeIfZero(assetByKey, contract, tv.chosenBalance, purgedTsMap, balanceTsMap, nowMs, true);
        continue;
      }
      
      var meta = TokenMeta.get(rpc, contract, metaMap, nowMs, timer, budget, config);
      AssetManager.upsert(assetByKey, { contract: contract, symbol: meta.symbol || "", name: meta.name || "", balance: tv.chosenBalance });
      updated++;
    }
    
    return { updated: updated, attempted: attempted };
  },
  
  /**
   * Full scan with improved batch management
   * v4.12.23: Added NEVER_SCANNED phase - tokens never attempted get HIGH PRIORITY
   */
  fullScan: function(rpc, walletAddress, allContracts, assetByKey, balanceTsMap, attemptTsMap, purgedTsMap, metaMap, nowMs, timer, budget, rrCursor, config, hasRecentActivity) {
    var result = { 
      did: false, scanned: 0, batches: 0, 
      rrCursor: rrCursor || 0,
      fullCycleComplete: false, tokensCovered: 0,
      maxBatchesCalculated: 0,
      avgBatchMs: this._avgBatchMs,
      priorityTokens: 0,
      discoveryTokens: 0,
      // v4.12.23: Track never-scanned tokens
      neverScannedTokens: 0,
      neverScannedProcessed: 0,
      // v4.12.28: Flag to track if Phase 2 (Discovery) actually executed
      phase2Executed: false
    };
    
    if (!walletAddress || !allContracts || !allContracts.length) {
      result.exitReason = "NO_CONTRACTS";
      return result;
    }
    
    var safeSaveMargin = (config && config.TIMEOUTS && config.TIMEOUTS.SAFE_SAVE_MARGIN_MS) || 1500;
    
    if (timer && timer.remaining() < (safeSaveMargin + 2000)) {
      result.exitReason = "TIME_LOW";
      result.timerRemaining = timer.remaining();
      return result;
    }
    
    var effectiveRpc = rpc;
    if (!effectiveRpc) {
      if (typeof RpcSelector !== 'undefined' && RpcSelector.pickBest) {
        effectiveRpc = RpcSelector.pickBest(null, config);
      }
      if (!effectiveRpc && config && config.RPC && config.RPC.ENDPOINTS && config.RPC.ENDPOINTS.length) {
        effectiveRpc = config.RPC.ENDPOINTS[0];
      }
    }
    if (!effectiveRpc) {
      result.exitReason = "NO_RPC";
      return result;
    }
    result.rpcFound = true;
    
    var maxTokensPerCall = (config && config.LIMITS && config.LIMITS.MAX_TOKENS_PER_CALL) || 10;
    var batchSize = Math.max(1, Math.min(budget.maxTokensPerCall || 3, maxTokensPerCall));
    
    // ============================================================
    // v4.12.36: CATEGORIZE TOKENS INTO 3 GROUPS (with PURGE TTL)
    // 1. PRIORITY: Has existing balance (refresh these first)
    // 2. NEVER_SCANNED: Not attempted OR purged > 6h ago (HIGH PRIORITY!)
    // 3. DISCOVERY: Recently scanned/purged but no balance (round-robin)
    // 
    // v4.12.36 FIX: Tokens purged > PURGED_RESCAN_TTL_MS ago are re-categorized
    // as NEVER_SCANNED to retry with high priority. This prevents tokens from
    // being stuck in low-priority DISCOVERY forever after an RPC glitch.
    // ============================================================
    var priorityContracts = [];
    var neverScannedContracts = [];
    var otherContracts = [];
    var priceMap = (budget && budget.priceMap) || {};
    var purgedRescanTtl = ROTATION_CONFIG.PURGED_RESCAN_TTL_MS || (6 * 3600 * 1000);
    
    for (var i = 0; i < allContracts.length; i++) {
      var addrNorm = Addr.normalize(allContracts[i]);
      if (!addrNorm) continue;
      
      var hasBalance = assetByKey && assetByKey[addrNorm] && Num.isPositive(assetByKey[addrNorm].balance);
      
      // v4.12.36: Check timestamps with TTL for purgedTsMap
      var attemptTs = (attemptTsMap && attemptTsMap[addrNorm]) || 0;
      var balanceTs = (balanceTsMap && balanceTsMap[addrNorm]) || 0;
      var purgedTs = (purgedTsMap && purgedTsMap[addrNorm]) || 0;
      
      // v4.12.36: Purge is only "valid" if recent (< TTL)
      // After TTL expires, treat as NEVER_SCANNED to retry with priority
      var isPurgeRecent = purgedTs > 0 && (nowMs - purgedTs) < purgedRescanTtl;
      var isPurgeExpired = purgedTs > 0 && (nowMs - purgedTs) >= purgedRescanTtl;
      
      // wasEverAttempted = has recent attempt/balance OR recent purge
      // Expired purges don't count - we want to retry those
      var wasEverAttempted = attemptTs > 0 || balanceTs > 0 || isPurgeRecent;
      
      if (hasBalance) {
        // Token has balance - priority refresh
        var asset = assetByKey[addrNorm];
        var bal = Num.parse(asset.balance) || 0;
        var price = Num.parse(asset.price_eur) || Num.parse(priceMap[addrNorm]) || 0;
        var value = bal * price;
        priorityContracts.push({ addr: addrNorm, value: value });
      } else if (!wasEverAttempted || isPurgeExpired) {
        // v4.12.36: NEVER SCANNED or EXPIRED PURGE - retry with HIGH PRIORITY!
        // This catches tokens that were purged by mistake (RPC glitch)
        neverScannedContracts.push(addrNorm);
      } else {
        // Recently scanned/purged, no balance - low priority round-robin
        otherContracts.push(addrNorm);
      }
    }
    
    result.priorityTokens = priorityContracts.length;
    result.neverScannedTokens = neverScannedContracts.length;
    result.discoveryTokens = otherContracts.length;
    
    // Sort priority by value (highest first)
    priorityContracts.sort(function(a, b) { return b.value - a.value; });
    
    var sortedPriorityAddrs = [];
    for (var sp = 0; sp < priorityContracts.length; sp++) {
      sortedPriorityAddrs.push(priorityContracts[sp].addr);
    }
    
    var maxIndividual = ROTATION_CONFIG.PRIORITY_INDIVIDUAL_MAX;
    if (priorityContracts.length > 30) {
      maxIndividual = Math.min(10, Math.floor(priorityContracts.length * 0.3));
    }
    
    var individualContracts = sortedPriorityAddrs.slice(0, maxIndividual);
    var batchPriorityContracts = sortedPriorityAddrs.slice(maxIndividual);
    
    // ============================================================
    // PHASE 1: Priority tokens (individual consensus scan for top value)
    // ============================================================
    var phase1Start = Date.now();
    
    if (individualContracts.length > 0 && timer.remaining() > (safeSaveMargin + 1000)) {
      var priorityResult = this.getErc20BalancesPriority(effectiveRpc, walletAddress, individualContracts, assetByKey, balanceTsMap, attemptTsMap, purgedTsMap, metaMap, nowMs, timer, budget, config, hasRecentActivity);
      if (typeof priorityResult === 'object') {
        result.scanned += priorityResult.updated;
        result.tokensCovered += priorityResult.attempted;
      } else {
        result.scanned += priorityResult;
        result.tokensCovered += individualContracts.length;
      }
      result.batches++;
    }
    
    // ============================================================
    // PHASE 1b: NEVER_SCANNED TOKENS (v4.12.24 - GUARANTEED EXECUTION!)
    // Moved BEFORE batch priority to ensure new tokens are discovered
    // These tokens have NEVER been attempted - they MUST be scanned
    // ============================================================
    if (neverScannedContracts.length > 0 && timer.remaining() > (safeSaveMargin + 1500)) {
      var neverScannedMax = ROTATION_CONFIG.NEVER_SCANNED_MAX_PER_RUN;
      var neverScannedBatchSize = ROTATION_CONFIG.NEVER_SCANNED_BATCH_SIZE;
      var neverScannedIdx = 0;
      var neverScannedStart = Date.now();
      var neverScannedReserved = ROTATION_CONFIG.NEVER_SCANNED_RESERVED_MS || 4000;
      
      while (neverScannedIdx < neverScannedContracts.length && neverScannedIdx < neverScannedMax) {
        if (timer.remaining() < (safeSaveMargin + 800)) break;
        
        var batchStart2 = Date.now();
        var neverScannedSlice = neverScannedContracts.slice(neverScannedIdx, neverScannedIdx + neverScannedBatchSize);
        if (!neverScannedSlice.length) break;
        
        // v4.12.24: Pass isNeverScannedBatch=true for relaxed consensus
        var nsResult = this.getErc20Balances(effectiveRpc, walletAddress, neverScannedSlice, assetByKey, balanceTsMap, attemptTsMap, purgedTsMap, metaMap, nowMs, timer, budget, config, hasRecentActivity, true);
        
        this._updateBatchTiming(Date.now() - batchStart2);
        
        if (typeof nsResult === 'object') {
          result.scanned += nsResult.updated;
          result.tokensCovered += nsResult.attempted;
          result.neverScannedProcessed += nsResult.attempted;
          if (nsResult.attempted === 0) break;
          neverScannedIdx += nsResult.attempted;
        } else {
          result.scanned += nsResult;
          result.tokensCovered += neverScannedSlice.length;
          result.neverScannedProcessed += neverScannedSlice.length;
          neverScannedIdx += neverScannedSlice.length;
        }
        result.batches++;
        
        // v4.12.24: Check if we've used our reserved time budget
        var neverScannedElapsed = Date.now() - neverScannedStart;
        if (neverScannedElapsed > neverScannedReserved && neverScannedIdx >= Math.min(10, neverScannedContracts.length)) {
          // Processed at least 10 or all, can move on
          break;
        }
      }
    }
    
    // ============================================================
    // PHASE 1c: Batch priority tokens (remaining priority with balance)
    // v4.12.24: Now runs AFTER never-scanned, with stricter time limit
    // ============================================================
    var priorityIdx = 0;
    var priorityPhaseCompleted = false;
    var priorityBatchStart = Date.now();
    var priorityBatchMaxMs = ROTATION_CONFIG.PRIORITY_BATCH_MAX_MS || 8000;
    
    while (priorityIdx < batchPriorityContracts.length) {
      if (timer.remaining() < (safeSaveMargin + 500)) break;
      
      var priorityElapsed = Date.now() - priorityBatchStart;
      // v4.12.24: Stricter time limit to leave room for discovery
      var shouldBreakForDiscovery = (
        priorityElapsed > priorityBatchMaxMs && 
        otherContracts.length > 0 &&
        priorityIdx >= Math.ceil(batchPriorityContracts.length * 0.7)
      );
      
      if (shouldBreakForDiscovery) {
        break;
      }
      
      var batchStart = Date.now();
      var prioritySlice = batchPriorityContracts.slice(priorityIdx, priorityIdx + batchSize);
      if (!prioritySlice.length) break;
      
      var batchResult = this.getErc20Balances(effectiveRpc, walletAddress, prioritySlice, assetByKey, balanceTsMap, attemptTsMap, purgedTsMap, metaMap, nowMs, timer, budget, config, hasRecentActivity, false);
      
      this._updateBatchTiming(Date.now() - batchStart);
      
      if (typeof batchResult === 'object') {
        result.scanned += batchResult.updated;
        result.tokensCovered += batchResult.attempted;
        if (batchResult.attempted === 0) break;
        priorityIdx += batchResult.attempted;
      } else {
        result.scanned += batchResult;
        result.tokensCovered += prioritySlice.length;
        priorityIdx += prioritySlice.length;
      }
      result.batches++;
    }
    
    priorityPhaseCompleted = (priorityIdx >= batchPriorityContracts.length);
    
    // ============================================================
    // PHASE 2: Round-robin for discovery (tokens already scanned but no balance)
    // ============================================================
    if (otherContracts.length > 0 && timer.remaining() > (safeSaveMargin + 1500)) {
      // v4.12.28: Mark that Phase 2 actually executed
      result.phase2Executed = true;
      
      var otherCursor = Num.isValid(rrCursor) ? (rrCursor % otherContracts.length) : 0;
      if (otherCursor < 0) otherCursor = 0;
      
      var remainingMs = timer.remaining();
      var maxOtherBatches = this._calculateMaxBatches(remainingMs, safeSaveMargin);
      result.maxBatchesCalculated = maxOtherBatches;
      result.avgBatchMs = this._avgBatchMs;
      
      var otherBatches = 0;
      var totalOtherAttempted = 0;
      var startCursor = otherCursor;
      
      while (otherBatches < maxOtherBatches) {
        if (timer.remaining() < (safeSaveMargin + 800)) break;
        
        var batchStart3 = Date.now();
        var otherSlice = Arr.pickRoundRobin(otherContracts, otherCursor, batchSize);
        if (!otherSlice.length) break;
        var prevCursor = otherCursor;
        
        var otherResult = this.getErc20Balances(effectiveRpc, walletAddress, otherSlice, assetByKey, balanceTsMap, attemptTsMap, purgedTsMap, metaMap, nowMs, timer, budget, config, hasRecentActivity, false);
        
        var batchElapsed = Date.now() - batchStart3;
        this._updateBatchTiming(batchElapsed);
        
        var actualAttempted = otherSlice.length;
        if (typeof otherResult === 'object') {
          result.scanned += otherResult.updated;
          actualAttempted = otherResult.attempted;
          if (actualAttempted === 0) break;
        } else {
          result.scanned += otherResult;
        }
        
        otherCursor = (otherCursor + actualAttempted) % otherContracts.length;
        result.tokensCovered += actualAttempted;
        totalOtherAttempted += actualAttempted;
        
        result.batches++;
        otherBatches++;
        
        if (otherCursor <= startCursor && totalOtherAttempted >= otherContracts.length) {
          result.fullCycleComplete = true;
          break;
        }
        
        if (totalOtherAttempted >= otherContracts.length) {
          result.fullCycleComplete = true;
          break;
        }
      }
      result.rrCursor = otherCursor;
    }
    
    // v4.12.28 FIX: rrCursor is relative to otherContracts (Discovery tokens)
    // Only advance when Phase 2 actually executed. When Priority/NeverScanned
    // consume all time, rrCursor should NOT advance - this is correct behavior.
    // The cursor will resume from the same position on next run when more time is available.
    // NOTE: Removed v4.12.27 logic that incorrectly used allContracts.length
    // The cursor is ONLY relevant for Discovery rotation, not global coverage.
    
    if (result.tokensCovered >= allContracts.length) {
      result.fullCycleComplete = true;
    }
    
    result.did = true;
    return result;
  }
};
