/************************************************************
 * 09_SIMPLE_ROTATION.gs - Simplified Token Rotation System
 *
 * Version: v4.13.10 -> v4.15.49 (Multicall3 transport optimization)
 *
 * OPTIMIZATION v4.15.49 - MULTICALL3 TRANSPORT:
 * ------------------------------------------------------------
 * ERC20 balanceOf/decimals/symbol/name calls are attempted via
 * Multicall3 tryAggregate(false) first, reducing N JSON-RPC calls
 * to one eth_call per RPC. Results are normalized into the same
 * response map as before, so consensus/cache behavior is unchanged.
 * Existing JSON-RPC batch/chunk/individual paths remain fallback.
 *
 * FIX v4.15.46 - RPC ZERO OVER SKIPPED CACHE:
 * ─────────────────────────────────────────────────────────────
 * If cache was deliberately excluded from voting (suspect metadata,
 * freshly refreshed decimals, microscopic artifact), a single successful
 * RPC balanceOf=0 must purge stale positive cache. Previously Scenario 4
 * kept cached positives on partial RPC failure, leaving evacuated tokens
 * stuck when only one ZERO RPC still answered.
 *
 * FIX v4.15.43 - MICRO-BALANCE CACHE VOTE + DECIMALS GUARD:
 * ─────────────────────────────────────────────────────────────
 * 1. skipCacheVote now triggers for ANY microscopic balance (< 1e-12),
 *    not only when metaMap has invalid decimals. Previously when metaMap
 *    had valid decimals (6) but cache held E-12 value from wrong-decimal
 *    run, the cache still voted and PREFER_CACHE_ON_DISAGREE kept it.
 * 2. Decimals computation in _scanBatch now requires !decimalsSuspect
 *    before trusting metaMap. A non-suspect 18-dec fallback no longer
 *    blocks the TOKEN_DECIMALS config override.
 * 3. Fresh metaMap entries created via symbol/name paths (without
 *    decimals verification) now default to decimalsSuspect=true.
 *
 * OPTIMIZATION in v4.13.10:
 * ─────────────────────────────────────────────────────────────
 * HTTP QUOTA: Initial RPC pick reduced from 4 to 2. With cache
 *      as 1 vote (no activity), consensus is: cache + 1 RPC = 2
 *      → early exit after 1 HTTP call. With activity: 2 RPCs.
 *      If 2 RPCs disagree, a backup RPC is pulled automatically
 *      (same mechanism as failure retry). Estimated savings:
 *      ~2000-4000 HTTP/day on active wallets.
 * ─────────────────────────────────────────────────────────────
 *
 * OPTIMIZATION in v4.13.9:
 * ─────────────────────────────────────────────────────────────
 * HTTP QUOTA: Balance TTL increased from 24h to 48h. For wallets
 *      with no recent activity (nonce unchanged), cached balances
 *      are reused for 48h instead of 24h. This halves RPC balance
 *      calls for inactive wallets (~1000-1500 HTTP/day savings).
 *      Active wallets (nonce changed) still rescan immediately.
 * ─────────────────────────────────────────────────────────────
 *
 * OPTIMIZATION in v4.13.8:
 * ─────────────────────────────────────────────────────────────
 * HTTP QUOTA: _scanBatch now includes decimals() calls in the
 *      SAME JSON-RPC batch as balanceOf() calls. Previously,
 *      each token without cached decimals triggered a separate
 *      TokenMeta.get() → _fetchDecimals() → individual RPC call.
 *      With 10 tokens per batch, this saves up to 10 HTTP calls
 *      per batch (100% reduction for decimals fetching).
 *
 *      Responses are parsed by request ID for O(1) lookup.
 *      Decimals are extracted from the first successful RPC
 *      and stored in metaMap for subsequent consensus rounds.
 * ─────────────────────────────────────────────────────────────
 *
 * FIX in v4.13.7:
 * ─────────────────────────────────────────────────────────────
 * BUG: On chains with 1 RPC (e.g. MegaETH), when RPC returns
 *      balance=0 and cache has a positive balance, the fallback
 *      logic ALWAYS preferred cache ("PREFER_CACHE_ON_DISAGREE").
 *      This made it impossible to purge zero-balance tokens on
 *      single-RPC chains - tokens stuck indefinitely.
 *
 * FIX: When RPC explicitly returns 0 (valid balanceOf response,
 *      not an error) and cache has a positive balance, prefer
 *      RPC zero. A 0x000...0 response is authoritative.
 * ─────────────────────────────────────────────────────────────
 *
 * FIX in v4.13.3:
 * ─────────────────────────────────────────────────────────────
 * BUG: When RPCs fail (e.g. cloudflare "Internal error", ankr
 *      "Unauthorized"), they waste consensus slots. With 3 RPCs
 *      selected (maxRpcs cap) and 2 failing, only 1 valid vote
 *      remains. Cache vote + 1 RPC = tie → stale balance stuck.
 *      (Observed: USDC 0 on Ethereum despite real balance 3.595)
 * 
 * FIX 1: RPC RETRY - When an RPC fails during batch scan, pull
 *        a backup from the full healthy endpoint pool (up to 3
 *        extra retries). Ethereum has 11 endpoints; no reason
 *        to stop at 3 when 2 fail.
 * 
 * FIX 2: EFFECTIVE COUNT - Pass successfulRpcCount (not total
 *        selected) to fallback logic. Error RPCs don't count
 *        against consensus - they simply didn't participate.
 * 
 * Result: cache=0, cloudflare=ERR, publicnode=3.595,
 *         ankr=ERR → retry drpc=3.595 → consensus 3.595 ✓
 * ─────────────────────────────────────────────────────────────
 * 
 * FIX in v4.13.2:
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * BUG: When some RPCs fail (e.g. cloudflare "Internal error")
 *      and token has no cache history, the single valid RPC
 *      vote was silently dropped because no fallback scenario
 *      covered "totalVotes < totalRpcsAvailable, no cache".
 *      This caused newly added tokens to NEVER appear.
 * 
 * FIX: Added Scenario 4 in getConsensusBalanceWithFallback:
 *      Accept single POSITIVE balance when RPCs partially failed
 *      and no cached balance exists. Zero balances from single
 *      votes are still rejected (conservative - prevents purge).
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * 
 * FIX in v4.13.1:
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * BUG: cycleComplete was NEVER true when tokens > MAX_CONTRACTS
 *      because it checked (contracts.length >= total) which is
 *      impossible when total > 30.
 * 
 * FIX: Now detects when cursor wraps around to start position,
 *      which correctly indicates a full rotation cycle.
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * 
 * REPLACES: Complex budget profiles (MINIMAL/CONSERVATIVE/NORMAL/AGGRESSIVE),
 *           ChainBudgetStats, BudgetStats history, EMA/P90 calculations
 * 
 * NEW MODEL:
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * 1. Each refresh: Native + X contracts from tokenRange
 * 2. X = calculated dynamically based on time remaining
 * 3. Round-robin cursor advances through all contracts
 * 4. Balances valid until: new transaction OR 48h TTL
 * 5. Cache counts as RPC vote if no recent activity (consensus)
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * 
 * CONSENSUS MODEL (PRESERVED):
 * - If hasRecentActivity=false â†’ cache balance = 1 RPC vote
 * - Need 2+ matching votes for consensus
 * - Protects against single RPC returning stale/wrong data
 * - NEW: Accept single positive vote when RPCs partially failed (no cache)
 * 
 * DEPENDENCIES: 02_UTILS.gs
 ************************************************************/
var SIMPLE_ROTATION_VERSION = "4.15.49";

// ============================================================
// AUTO-REGISTRATION (v4.13.10)
// ============================================================
if (typeof ModuleRegistry !== 'undefined') {
  ModuleRegistry.register("SIMPLE_ROTATION", SIMPLE_ROTATION_VERSION, {
    description: "RPC retry on failure with effective count consensus",
    dependencies: ["UTILS"]
  });
}

// ============================================================
// CONFIGURATION
// ============================================================

var SIMPLE_ROTATION_CONFIG = {
  // Time estimates (ms)
  MS_PER_CONTRACT: 150,      // ~150ms per ERC20 balance check (batch avg)
  MS_NATIVE: 500,            // ~500ms for native balance (2 RPCs)
  MS_OVERHEAD: 1500,         // Cache save, output building
  MS_RESERVE: 2000,          // Safety margin
  
  // Contract limits per run
  MIN_CONTRACTS: 3,          // Minimum contracts to scan
  MAX_CONTRACTS: 30,         // Maximum contracts per run
  
  // TTL
  BALANCE_TTL_MS: 48 * 60 * 60 * 1000,  // 48h - balance validity (v4.13.9: was 24h)
  
  // Batch size for RPC calls
  BATCH_SIZE: 10             // Contracts per RPC batch call
};

// ============================================================
// SIMPLE ROTATION MODULE
// ============================================================

var SimpleRotation = {
  
  /**
   * Calculate how many contracts to scan this run
   * Based purely on time remaining
   * 
   * @param {Object} timer - Timer with remaining() method
   * @param {Object} config - Chain config (optional overrides)
   * @returns {number} Number of contracts to scan
   */
  calculateContractsToScan: function(timer, config) {
    var remaining = timer ? timer.remaining() : 15000;
    
    // Get config values with defaults
    var msPerContract = SIMPLE_ROTATION_CONFIG.MS_PER_CONTRACT;
    var msNative = SIMPLE_ROTATION_CONFIG.MS_NATIVE;
    var msOverhead = SIMPLE_ROTATION_CONFIG.MS_OVERHEAD;
    var msReserve = SIMPLE_ROTATION_CONFIG.MS_RESERVE;
    var minContracts = SIMPLE_ROTATION_CONFIG.MIN_CONTRACTS;
    var maxContracts = SIMPLE_ROTATION_CONFIG.MAX_CONTRACTS;
    
    // Override from config if present
    if (config && config.ROTATION) {
      if (config.ROTATION.MS_PER_CONTRACT) msPerContract = config.ROTATION.MS_PER_CONTRACT;
      if (config.ROTATION.MIN_CONTRACTS) minContracts = config.ROTATION.MIN_CONTRACTS;
      if (config.ROTATION.MAX_CONTRACTS) maxContracts = config.ROTATION.MAX_CONTRACTS;
    }
    
    // Calculate available time for contracts
    var available = remaining - msNative - msOverhead - msReserve;
    if (available <= 0) return minContracts;
    
    var calculated = Math.floor(available / msPerContract);
    
    // Clamp to bounds
    return Math.max(minContracts, Math.min(calculated, maxContracts));
  },
  
  /**
   * Get the next slice of contracts to scan (round-robin)
   * 
   * v4.13.1 FIX: cycleComplete now correctly tracks when cursor wraps around
   * 
   * @param {Array} allContracts - All contract addresses
   * @param {number} cursor - Current position in rotation
   * @param {number} count - Number of contracts to get
   * @returns {Object} { contracts: [...], nextCursor: N, cycleComplete: bool }
   */
  getContractSlice: function(allContracts, cursor, count) {
    if (!allContracts || !allContracts.length) {
      return { contracts: [], nextCursor: 0, total: 0, cycleComplete: true };
    }
    
    var total = allContracts.length;
    var startCursor = (cursor || 0) % total;
    count = Math.min(count, total);  // Can't scan more than total
    
    var contracts = [];
    var pos = startCursor;
    
    for (var i = 0; i < count; i++) {
      contracts.push(allContracts[pos]);
      pos = (pos + 1) % total;
    }
    
    // v4.13.1 FIX: Cycle is complete when:
    // 1. We scan ALL contracts in one run (total <= MAX_CONTRACTS), OR
    // 2. nextCursor wraps around to/past the start position (round-robin complete)
    //
    // Example with 55 tokens, cursor starts at 0:
    // - Run 1: start=0, scan 30, next=30, wrapped=false â†’ partial
    // - Run 2: start=30, scan 25 (30â†’54), next=55%55=0 â†’ DONE!
    //   Because we started at 30 and ended at 0, we wrapped around.
    //
    // Example with 55 tokens, cursor starts at 30:
    // - Run 1: start=30, scan 30, next=60%55=5
    //   5 < 30 means we wrapped past 0 â†’ DONE!
    
    var cycleComplete = false;
    
    if (contracts.length >= total) {
      // Scanned all in one run
      cycleComplete = true;
    } else if (startCursor > 0 && pos <= startCursor && pos < startCursor) {
      // Started mid-list and nextCursor is before startCursor
      // This means we wrapped around through position 0
      cycleComplete = true;
    } else if (startCursor > 0 && pos === 0) {
      // Started mid-list and landed exactly on 0
      cycleComplete = true;
    } else if (startCursor === 0 && contracts.length > 0 && pos === 0) {
      // Edge case: started at 0, scanned some, ended at 0 (full wrap)
      // This only happens if we scanned exactly `total` contracts
      cycleComplete = true;
    }
    
    return {
      contracts: contracts,
      nextCursor: pos,
      total: total,
      scanned: contracts.length,
      cycleComplete: cycleComplete,
      startCursor: startCursor  // For debugging
    };
  },
  
  /**
   * Check if a contract needs to be rescanned
   * 
   * @param {string} contract - Contract address
   * @param {Object} balanceTsMap - Map of contract â†’ last scan timestamp
   * @param {boolean} hasRecentActivity - True if wallet has new transactions
   * @param {number} nowMs - Current timestamp
   * @returns {boolean} True if needs rescan
   */
  needsRescan: function(contract, balanceTsMap, hasRecentActivity, nowMs) {
    // New transaction detected â†’ rescan everything
    if (hasRecentActivity) return true;
    
    // Never scanned
    var ts = balanceTsMap ? balanceTsMap[contract] : null;
    if (!ts) return true;
    
    // TTL expired (48h)
    var age = nowMs - ts;
    if (age > SIMPLE_ROTATION_CONFIG.BALANCE_TTL_MS) return true;
    
    return false;
  },
  
  /**
   * Filter contracts that need scanning based on TTL and activity
   * 
   * @param {Array} contracts - Contracts to check
   * @param {Object} balanceTsMap - Timestamp map
   * @param {boolean} hasRecentActivity - Activity detected
   * @param {number} nowMs - Current time
   * @returns {Object} { needScan: [...], fresh: [...] }
   */
  categorizeContracts: function(contracts, balanceTsMap, hasRecentActivity, nowMs) {
    var needScan = [];
    var fresh = [];
    
    for (var i = 0; i < contracts.length; i++) {
      var c = contracts[i];
      if (this.needsRescan(c, balanceTsMap, hasRecentActivity, nowMs)) {
        needScan.push(c);
      } else {
        fresh.push(c);
      }
    }
    
    return { needScan: needScan, fresh: fresh };
  },
  
  /**
   * Main entry: Get contracts to scan this run
   * Combines time calculation with round-robin selection
   * 
   * @param {Array} allContracts - All configured contracts
   * @param {number} cursor - Current rotation position
   * @param {Object} timer - Timer object
   * @param {Object} config - Chain config
   * @returns {Object} Scan plan
   */
  plan: function(allContracts, cursor, timer, config) {
    if (!allContracts || !allContracts.length) {
      return {
        contracts: [],
        nextCursor: 0,
        maxContracts: 0,
        total: 0,
        timeAvailable: timer ? timer.remaining() : 0
      };
    }
    
    var maxContracts = this.calculateContractsToScan(timer, config);
    var slice = this.getContractSlice(allContracts, cursor, maxContracts);
    
    return {
      contracts: slice.contracts,
      nextCursor: slice.nextCursor,
      maxContracts: maxContracts,
      total: slice.total,
      scanned: slice.scanned,
      cycleComplete: slice.cycleComplete,
      timeAvailable: timer ? timer.remaining() : 0
    };
  }
};

// ============================================================
// CONSENSUS HELPER (for cache-as-RPC voting)
// ============================================================

var ConsensusHelper = {
  
  /**
   * Add cache as a vote if no recent activity
   * 
   * @param {Object} votes - Vote map { balance_string: count }
   * @param {*} cachedBalance - Balance from cache
   * @param {boolean} hasRecentActivity - True if new tx detected
   */
  addCacheVote: function(votes, cachedBalance, hasRecentActivity) {
    // Only count cache as vote if no recent activity
    if (hasRecentActivity) return;
    if (cachedBalance === null || cachedBalance === undefined) return;
    
    var key = String(cachedBalance);
    votes[key] = (votes[key] || 0) + 1;
  },
  
  /**
   * Add RPC result as a vote
   * 
   * @param {Object} votes - Vote map
   * @param {*} balance - Balance from RPC
   */
  addRpcVote: function(votes, balance) {
    if (balance === null || balance === undefined) return;
    var key = String(balance);
    votes[key] = (votes[key] || 0) + 1;
  },
  
  /**
   * Check if consensus reached (2+ matching votes)
   * 
   * @param {Object} votes - Vote map
   * @returns {Object} { hasConsensus: bool, balance: value, voteCount: N }
   */
  checkConsensus: function(votes) {
    var bestKey = null;
    var bestCount = 0;
    var totalVotes = 0;
    
    for (var key in votes) {
      totalVotes += votes[key];
      if (votes[key] > bestCount) {
        bestCount = votes[key];
        bestKey = key;
      }
    }
    
    if (bestCount >= 2 && bestKey !== null) {
      return {
        hasConsensus: true,
        balance: parseFloat(bestKey),
        voteCount: bestCount,
        totalVotes: totalVotes
      };
    }
    
    return { 
      hasConsensus: false, 
      balance: bestKey !== null ? parseFloat(bestKey) : null, 
      voteCount: bestCount,
      totalVotes: totalVotes,
      // Store best candidate for fallback
      bestCandidate: bestKey !== null ? parseFloat(bestKey) : null
    };
  },
  
  /**
   * Get consensus balance, with FALLBACK for limited RPC scenarios
   * 
   * Fallback rules (when consensus impossible):
   * - 1 RPC only: Accept single RPC result (no choice)
   * - 2 RPCs disagree + no cache: Accept most recent RPC (last one called)
   * - 2 RPCs disagree + cache available: Prefer cache (conservative)
   * 
   * @param {Object} votes - Vote map
   * @param {number} minVotes - Minimum votes needed (default: 2)
   * @param {Object} options - { allowFallback: bool, cachedBalance: number|null, totalRpcsAvailable: number }
   * @returns {Object} { balance: value, hasConsensus: bool, isFallback: bool, fallbackReason: string }
   */
  getConsensusBalanceWithFallback: function(votes, minVotes, options) {
    minVotes = minVotes || 2;
    options = options || {};
    var allowFallback = options.allowFallback !== false; // default true
    var cachedBalance = options.cachedBalance;
    var totalRpcsAvailable = options.totalRpcsAvailable || 99;
    
    var result = this.checkConsensus(votes);
    
    // Normal consensus achieved
    if (result.hasConsensus && result.voteCount >= minVotes) {
      return {
        balance: result.balance,
        hasConsensus: true,
        isFallback: false,
        fallbackReason: null
      };
    }
    
    // No consensus - check if fallback is appropriate
    if (!allowFallback) {
      return {
        balance: null,
        hasConsensus: false,
        isFallback: false,
        fallbackReason: "FALLBACK_DISABLED"
      };
    }
    
    // === FALLBACK SCENARIOS ===
    var zeroKey = String(0);
    var rpcVotedZero = votes[zeroKey] && votes[zeroKey] >= 1;
    var cacheIsPositive = cachedBalance !== null && cachedBalance > 0;

    // v4.15.46: If the cache was deliberately excluded from consensus, do not
    // resurrect it in the partial-failure fallback. A successful balanceOf=0 is
    // the only trustworthy value left for this token.
    if (rpcVotedZero && cacheIsPositive && options.cacheVoteSkipped === true) {
      return {
        balance: 0,
        hasConsensus: false,
        isFallback: true,
        fallbackReason: "RPC_ZERO_OVER_SKIPPED_CACHE"
      };
    }
    
    // Scenario 1: Only 1 RPC available - accept it (no choice)
    if (totalRpcsAvailable <= 1 && result.totalVotes >= 1) {
      return {
        balance: result.bestCandidate,
        hasConsensus: false,
        isFallback: true,
        fallbackReason: "SINGLE_RPC"
      };
    }
    
    // Scenario 2: Limited RPCs (2) and they disagree
    // v4.13.7 FIX: When RPC explicitly returns 0 (not an error - a valid balanceOf response),
    // prefer the RPC zero over stale cache. A balanceOf returning 0x000...0 is authoritative.
    // Previously, cache ALWAYS won on disagree for chains with 1 RPC, making it impossible
    // to purge zero-balance tokens (e.g. USDm on MegaETH stuck for days).
    if (totalRpcsAvailable <= 2 && result.totalVotes >= 2 && !result.hasConsensus) {
      // Check if RPC voted zero while cache voted positive
      if (rpcVotedZero && cacheIsPositive) {
        // RPC explicitly says balance is 0 - trust the RPC over stale cache
        return {
          balance: 0,
          hasConsensus: false,
          isFallback: true,
          fallbackReason: "RPC_ZERO_OVER_STALE_CACHE"
        };
      }

      // v4.15.44 FIX: Symmetric case — RPC voted positive while cache is zero.
      // A successful balanceOf returning a positive value is authoritative.
      // Previously, PREFER_CACHE_ON_DISAGREE below would keep stale zero cache,
      // making it impossible to recover tokens that were temporarily missing
      // from cache (e.g. after cache clear, new deploy, or transient RPC zero).
      var cacheIsZero = cachedBalance !== null && cachedBalance === 0;
      if (cacheIsZero && result.bestCandidate !== null && result.bestCandidate > 0) {
        return {
          balance: result.bestCandidate,
          hasConsensus: false,
          isFallback: true,
          fallbackReason: "RPC_POSITIVE_OVER_ZERO_CACHE"
        };
      }

      // If we have cached balance that matches one of the votes, prefer cache (conservative)
      if (cachedBalance !== null) {
        var cacheKey = String(cachedBalance);
        if (votes[cacheKey] && votes[cacheKey] >= 1) {
          return {
            balance: cachedBalance,
            hasConsensus: false,
            isFallback: true,
            fallbackReason: "PREFER_CACHE_ON_DISAGREE"
          };
        }
      }
      // No cache match - accept best candidate (majority of 1)
      return {
        balance: result.bestCandidate,
        hasConsensus: false,
        isFallback: true,
        fallbackReason: "LIMITED_RPCS_DISAGREE"
      };
    }
    
    // Scenario 3: All RPCs called but still no consensus (rare edge case)
    if (result.totalVotes >= totalRpcsAvailable && result.bestCandidate !== null) {
      return {
        balance: result.bestCandidate,
        hasConsensus: false,
        isFallback: true,
        fallbackReason: "ALL_RPCS_NO_CONSENSUS"
      };
    }
    
    // Scenario 4 (v4.13.2): Partial RPC failure - some RPCs failed, got 1 valid vote
    // This covers new tokens (no cache) when e.g. 1 of 3 RPCs responds successfully.
    // Accept POSITIVE balances only - zero from single vote could be false-zero (conservative)
    if (result.totalVotes >= 1 && result.totalVotes < totalRpcsAvailable && result.bestCandidate !== null) {
      var candidateIsPositive = result.bestCandidate > 0;
      if (candidateIsPositive) {
        return {
          balance: result.bestCandidate,
          hasConsensus: false,
          isFallback: true,
          fallbackReason: "PARTIAL_RPC_FAILURE_POSITIVE"
        };
      }
      // Zero balance from single vote when RPCs failed - don't trust it
      // Keep cached value (if any) or skip update entirely
      if (cachedBalance !== null && cachedBalance > 0) {
        return {
          balance: cachedBalance,
          hasConsensus: false,
          isFallback: true,
          fallbackReason: "PARTIAL_RPC_FAILURE_KEEP_CACHE"
        };
      }
    }
    
    // No valid fallback
    return {
      balance: null,
      hasConsensus: false,
      isFallback: false,
      fallbackReason: "INSUFFICIENT_DATA"
    };
  },
};

// ============================================================
// ACTIVITY DETECTION (simplified)
// ============================================================

var ActivityDetector = {
  
  /**
   * Check if wallet has recent activity
   * Uses nonce (EVM) or signature count (SVM) from cache
   * 
   * @param {Object} cache - Wallet cache
   * @param {number} currentNonce - Current nonce from RPC
   * @returns {boolean} True if activity detected
   */
  hasActivity: function(cache, currentNonce) {
    if (!cache) return true;  // No cache = assume activity
    
    var cachedNonce = cache.nonce || cache.txCount || 0;
    
    // Nonce increased = new transaction
    if (currentNonce > cachedNonce) return true;
    
    return false;
  },
  
  /**
   * Get nonce/tx count for EVM wallet
   * 
   * @param {string} rpc - RPC endpoint
   * @param {string} address - Wallet address
   * @param {Object} timer - Timer
   * @param {Object} config - Config
   * @returns {number} Transaction count
   */
  getEvmNonce: function(rpc, address, timer, config) {
    try {
      if (typeof RpcClient !== 'undefined' && RpcClient.call) {
        var result = RpcClient.call(rpc, "eth_getTransactionCount", [address, "latest"], timer, 1, config);
        if (result) return parseInt(result, 16) || 0;
      }
    } catch (e) {}
    return 0;
  }
};

// ============================================================
// INFO_ROT OUTPUT (for diagnostics)
// ============================================================

var RotationInfo = {
  
  /**
   * Format rotation info for INFO_ROT output row
   * 
   * @param {Object} plan - Result from SimpleRotation.plan()
   * @param {boolean} hasActivity - Activity detected
   * @returns {string} Formatted info string
   */
  format: function(plan, hasActivity) {
    if (!plan) return "rot=N/A";
    
    var parts = [];
    parts.push("cursor=" + (plan.nextCursor || 0) + "/" + (plan.total || 0));
    parts.push("scanned=" + (plan.scanned || 0));
    parts.push("timeAvail=" + (plan.timeAvailable || 0) + "ms");
    
    if (plan.cycleComplete) {
      parts.push("cycle=COMPLETE");
    }
    
    if (hasActivity) {
      parts.push("activity=YES");
    }
    
    return parts.join("; ");
  }
};

// ============================================================
// EXPORTS (for backward compatibility)
// ============================================================

// Stub for removed BudgetStats (returns empty)
var BudgetStats = BudgetStats || {
  load: function() { return null; },
  save: function() { /* no-op */ }
};

// Stub for removed ChainBudgetStats (returns empty)
var ChainBudgetStats = ChainBudgetStats || {
  _key: function(config) { return "DEPRECATED"; },
  load: function() { return null; },
  save: function() { /* no-op */ },
  percentile: function() { return 0; }
};

// Stub for removed DynamicBudget
var DynamicBudget = DynamicBudget || {
  compute: function(address, cache, force, trig, timer, config) {
    // Return simplified budget object
    var plan = SimpleRotation.plan([], 0, timer, config);
    return {
      profileName: "SIMPLE",
      dueFullScan: !!force,
      dueFullPrice: !!force,
      allowFullScan: true,
      allowRotation: true,
      maxTokensPerCall: plan.maxContracts || 10,
      maxRefreshPerRun: plan.maxContracts || 10,
      maxPriceLookups: 8
    };
  }
};

// ============================================================
// SIMPLE BALANCE FETCHER (EVM)
// Replaces complex BalanceFetcher.fullScan with simpler logic
// ============================================================

var SimpleBalanceFetcher = {
  
  SELECTOR_BALANCE_OF: "0x70a08231",
  
  /**
   * SIMPLIFIED fullScan - Main entry point for EVM token scanning
   * 
   * Logic:
   * 1. Calculate how many contracts we can scan (time-based)
   * 2. Pick next N contracts in round-robin
   * 3. Batch query RPC with consensus (cache counts as vote if no activity)
   * 4. Update balances and timestamps
   * 
   * @param {string} rpc - RPC endpoint
   * @param {string} wallet - Wallet address
   * @param {Array} allContracts - All contract addresses from tokenRange
   * @param {Object} assetByKey - Current assets map
   * @param {Object} balanceTsMap - Balance timestamps
   * @param {Object} attemptTsMap - Attempt timestamps
   * @param {Object} purgedTsMap - Purge timestamps
   * @param {Object} metaMap - Token metadata
   * @param {number} nowMs - Current timestamp
   * @param {Object} timer - Timer object
   * @param {number} rrCursor - Current rotation cursor
   * @param {Object} config - Chain config
   * @param {boolean} hasRecentActivity - True if new tx detected
   * @returns {Object} Scan results
   */
  fullScan: function(rpc, wallet, allContracts, assetByKey, balanceTsMap, attemptTsMap, purgedTsMap, metaMap, nowMs, timer, rrCursor, config, hasRecentActivity) {
    var result = {
      did: false,
      scanned: 0,
      batches: 0,
      tokensCovered: 0,
      rrCursor: rrCursor || 0,
      fullCycleComplete: false,
      exitReason: null,
      total: allContracts ? allContracts.length : 0,
      metaSymbolUpdated: 0,
      metaNameUpdated: 0,
      multicall3UsedCount: 0,
      multicall3FallbackCount: 0
    };
    
    if (!allContracts || !allContracts.length) {
      result.exitReason = "NO_CONTRACTS";
      return result;
    }
    
    if (!wallet) {
      result.exitReason = "NO_WALLET";
      return result;
    }
    
    var safeSaveMargin = (config && config.TIMEOUTS && config.TIMEOUTS.SAFE_SAVE_MARGIN_MS) || 1500;
    
    // Check time
    if (timer && timer.remaining() < (safeSaveMargin + 1000)) {
      result.exitReason = "NO_TIME";
      return result;
    }
    
    // Get effective RPC
    var effectiveRpc = rpc;
    if (!effectiveRpc && config && config.RPC && config.RPC.ENDPOINTS && config.RPC.ENDPOINTS.length) {
      effectiveRpc = config.RPC.ENDPOINTS[0];
    }
    if (!effectiveRpc) {
      result.exitReason = "NO_RPC";
      return result;
    }
    
    // === PLAN: Calculate how many contracts to scan ===
    var plan = SimpleRotation.plan(allContracts, rrCursor, timer, config);
    var contractsToScan = plan.contracts;
    
    if (!contractsToScan.length) {
      result.exitReason = "PLAN_EMPTY";
      return result;
    }
    
    // === SCAN: Process contracts in batches ===
    var batchSize = SIMPLE_ROTATION_CONFIG.BATCH_SIZE;
    var walletAddr = String(wallet).toLowerCase();
    var decimalsFallback = (config && config.LIMITS && config.LIMITS.DECIMALS_FALLBACK) || 18;
    
    var idx = 0;
    while (idx < contractsToScan.length) {
      if (timer && timer.remaining() < (safeSaveMargin + 500)) break;
      
      var batch = contractsToScan.slice(idx, idx + batchSize);
      if (!batch.length) break;
      
      var batchResult = this._scanBatch(
        effectiveRpc, walletAddr, batch, assetByKey, 
        balanceTsMap, metaMap, nowMs, timer, config, 
        hasRecentActivity, decimalsFallback
      );
      
      result.scanned += batchResult.updated;
      result.tokensCovered += batchResult.attempted;
      result.batches++;
      result.metaSymbolUpdated += batchResult.metaSymbolUpdated || 0;
      result.metaNameUpdated += batchResult.metaNameUpdated || 0;
      result.multicall3UsedCount += batchResult.multicall3UsedCount || 0;
      result.multicall3FallbackCount += batchResult.multicall3FallbackCount || 0;
      
      idx += batch.length;
    }
    
    // Update cursor
    result.rrCursor = plan.nextCursor;
    
    // v4.13.1 FIX: Use plan.cycleComplete which now correctly tracks wrap-around
    // v4.15.16 FIX: Only if ALL contracts in the plan were actually processed
    // (timer may have expired mid-cycle, leaving some unscanned)
    result.fullCycleComplete = plan.cycleComplete && (idx >= contractsToScan.length);
    result.did = true;
    
    return result;
  },
  
  /**
   * Scan a batch of contracts with consensus voting
   * Cache counts as 1 vote if no recent activity
   * 
   * @private
   */
  _scanBatch: function(rpc, wallet, contracts, assetByKey, balanceTsMap, metaMap, nowMs, timer, config, hasRecentActivity, decimalsFallback) {
    var updated = 0;
    var attempted = 0;
    var metaSymbolUpdated = 0;
    var metaNameUpdated = 0;
    var multicall3UsedCount = 0;
    var multicall3FallbackCount = 0;
    
    // Get initial RPCs for consensus
    // v4.13.10: Reduced from 4 to 2 — cache counts as vote when no activity,
    // so cache+1 RPC = consensus. If RPCs disagree, backup is pulled below.
    var rpcList = [];
    if (typeof RpcSelector !== 'undefined' && RpcSelector.pickForConsensus) {
      rpcList = RpcSelector.pickForConsensus(rpc, 2, config);
    }
    if (!rpcList.length) rpcList = rpc ? [rpc] : [];
    if (!rpcList.length) return { updated: 0, attempted: 0, noRpc: true };
    
    // v4.13.3: Build backup pool from ALL healthy endpoints not in initial list
    // When an RPC fails, we pull a replacement instead of losing a consensus slot
    var triedRpcs = {};
    for (var tr = 0; tr < rpcList.length; tr++) triedRpcs[rpcList[tr]] = true;
    
    var backupRpcs = [];
    var allEndpoints = (config && config.RPC && config.RPC.ENDPOINTS) || [];
    for (var bp = 0; bp < allEndpoints.length; bp++) {
      var ep = allEndpoints[bp];
      if (!triedRpcs[ep] && typeof RpcHealth !== 'undefined' && RpcHealth.isHealthy(ep, config)) {
        backupRpcs.push(ep);
      }
    }
    
    // Build batch request
    // v4.13.8: BATCH DECIMALS with balanceOf — eliminates per-token HTTP for decimals
    // Instead of calling TokenMeta.get() → _fetchDecimals() → separate RPC per token,
    // decimals() calls are included in the SAME batch as balanceOf(). 0 extra HTTP.
    var requests = [];
    var validContracts = [];
    var balanceOfIdx = {};  // contract -> index in requests[] for balanceOf response
    var decimalsIdx = {};   // contract -> index in requests[] for decimals response
    var symbolIdx = {};     // contract -> index in requests[] for symbol response
    var nameIdx = {};       // contract -> index in requests[] for name response
    var SELECTOR_DECIMALS = "0x313ce567";
    var SELECTOR_SYMBOL = "0x95d89b41";
    var SELECTOR_NAME = "0x06fdde03";
    var decimalsMax = (config && config.LIMITS && config.LIMITS.DECIMALS_SANITY_MAX) || 36;
    var metaRefreshMs = (config && config.CACHE && config.CACHE.META_REFRESH_MS) || 259200000;

    for (var i = 0; i < contracts.length; i++) {
      var contract = Addr.normalize(contracts[i]);
      if (!contract || contract === "native") continue;

      attempted++;

      // balanceOf() call
      balanceOfIdx[contract] = requests.length;
      requests.push({
        jsonrpc: "2.0",
        id: requests.length,
        method: "eth_call",
        params: [{ to: contract, data: this.SELECTOR_BALANCE_OF + Addr.pad32(wallet) }, "latest"]
      });
      validContracts.push(contract);

      // Check if this token needs decimals fetched via RPC
      var existingMeta = metaMap ? metaMap[contract] : null;
      var needDecimals = false;
      var needSymbol = !existingMeta || !existingMeta.symbol;
      var needName = !existingMeta || !existingMeta.name;
      if (!existingMeta) {
        needDecimals = true;
      } else {
        var _d = existingMeta.decimals;
        var _dOk = (_d !== null && _d !== undefined && !isNaN(_d) && _d >= 0 && _d <= decimalsMax);
        if (!_dOk || existingMeta.decimalsSuspect) needDecimals = true;
        if (!needDecimals && metaRefreshMs > 0) {
          var _lf = existingMeta.lastFetchMs || 0;
          if (!_lf || (nowMs - _lf) > metaRefreshMs) needDecimals = true;
        }
      }

      if (needDecimals) {
        decimalsIdx[contract] = requests.length;
        requests.push({
          jsonrpc: "2.0",
          id: requests.length,
          method: "eth_call",
          params: [{ to: contract, data: SELECTOR_DECIMALS }, "latest"]
        });
      }
      if (needSymbol) {
        symbolIdx[contract] = requests.length;
        requests.push({
          jsonrpc: "2.0",
          id: requests.length,
          method: "eth_call",
          params: [{ to: contract, data: SELECTOR_SYMBOL }, "latest"]
        });
      }
      if (needName) {
        nameIdx[contract] = requests.length;
        requests.push({
          jsonrpc: "2.0",
          id: requests.length,
          method: "eth_call",
          params: [{ to: contract, data: SELECTOR_NAME }, "latest"]
        });
      }
    }

    if (!validContracts.length) return { updated: 0, attempted: 0 };
    
    // Initialize votes for each token (cache as first vote if no activity)
    // Also store cached balance for fallback scenarios
    var tokenVotes = {};
    var tokenCachedBalances = {};  // Store for fallback logic
    var tokenCacheVoteSkipped = {}; // Cache intentionally excluded from consensus
    
    for (var v = 0; v < validContracts.length; v++) {
      var c = validContracts[v];
      tokenVotes[c] = {};
      tokenCachedBalances[c] = null;
      tokenCacheVoteSkipped[c] = false;
      
      // Get cached balance (always store for fallback, even with activity)
      var existingAsset = assetByKey ? assetByKey[c] : null;
      if (existingAsset && existingAsset.balance !== undefined) {
        var cachedBalance = Num.parse(existingAsset.balance);
        tokenCachedBalances[c] = cachedBalance;
        
        // v4.15.28 FIX: Don't let a suspect cache block balance correction.
        // If decimals were just refreshed or previously fell back to 18,
        // the cached balance was likely computed with wrong decimals (e.g.
        // 2.83E-12 instead of 2.83). In that case the cache must not vote.
        var skipCacheVote = false;
        if (metaMap && metaMap[c]) {
          if (metaMap[c].decimalsSuspect) skipCacheVote = true;
          if (metaMap[c].lastFetchMs === nowMs) skipCacheVote = true;
        }
        // v4.15.43 FIX: Always skip cache vote for microscopic balances.
        // A balance < 1e-12 is virtually always a decimal fallback artifact
        // (e.g. 6-decimal token computed with 18 decimals), NEVER a real balance.
        // Even if metaMap has valid-looking decimals, the cached balance itself
        // proves it was computed with wrong decimals. Do NOT let such a value
        // vote — it can win via PREFER_CACHE_ON_DISAGREE on single-RPC chains.
        var isMicroBalance = cachedBalance !== null && cachedBalance > 0 && cachedBalance < 1e-12;
        if (!skipCacheVote && isMicroBalance) skipCacheVote = true;
        tokenCacheVoteSkipped[c] = skipCacheVote;
        
        // Add cache as vote ONLY if no recent activity AND cache looks trustworthy
        if (!hasRecentActivity && cachedBalance !== null && !skipCacheVote) {
          ConsensusHelper.addCacheVote(tokenVotes[c], cachedBalance, false);
        }
      }
    }
    
    // Query RPCs until consensus - EARLY EXIT when all tokens have 2+ matching votes
    var httpTimeout = (config && config.TIMEOUTS && config.TIMEOUTS.HTTP_MS) || 2500;
    var safeSaveMargin = (config && config.TIMEOUTS && config.TIMEOUTS.SAFE_SAVE_MARGIN_MS) || 1500;
    // v4.15.20: Some RPC providers (e.g. drpc.org free tier) cap JSON-RPC batches.
    // Split requests into chunks of MAX_BATCH_SIZE and merge responses transparently.
    var maxBatchSize = (config && config.RPC && config.RPC.MAX_BATCH_SIZE) || 0;
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
    
    // v4.13.3: Track successful vs failed RPCs
    var successfulRpcCount = 0;
    var rpcRetries = 0;  // backup RPCs pulled in
    var rpcIdx = 0;
    var maxAttempts = rpcList.length + 3; // Cap: initial list + max 3 backup retries
    
    while (rpcIdx < rpcList.length && rpcIdx < maxAttempts) {
      if (timer && timer.remaining() < (safeSaveMargin + 500)) break;
      
      // EARLY EXIT: Check if all tokens already have consensus (cache + previous RPCs)
      // This saves HTTP calls when cache agrees with first RPC
      var allHaveConsensus = true;
      for (var tc in tokenVotes) {
        var check = ConsensusHelper.checkConsensus(tokenVotes[tc]);
        if (!check.hasConsensus) {
          allHaveConsensus = false;
          break;
        }
      }
      if (allHaveConsensus) {
        // All tokens have 2+ matching votes - no need for more RPC calls
        break;
      }
      
      var currentRpc = rpcList[rpcIdx];
      rpcIdx++;
      
      var rpcSuccess = false;
      
      try {
        var parsed = null;
        var allOk = true;
        var usedMulticall3 = false;
        var attemptedMulticall3 = false;

        if (useMulticall3 && typeof RpcClient !== "undefined" && RpcClient.multicall3) {
          try {
            attemptedMulticall3 = true;
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
                multicall3UsedCount++;
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
          if (attemptedMulticall3) multicall3FallbackCount++;
          allOk = true;
          if (config && config.RPC && config.RPC.DISABLE_JSON_RPC_BATCH && typeof RpcClient !== 'undefined' && RpcClient.batchCallIndividual) {
            // Some providers return stale balanceOf() values only for JSON-RPC array batches.
            // Keep Apps Script parallelism, but send one JSON-RPC object per HTTP POST.
            try { parsed = RpcClient.batchCallIndividual(currentRpc, requests, timer, config); } catch (eBi) { parsed = null; allOk = false; }
          } else if (maxBatchSize > 0 && requests.length > maxBatchSize && typeof RpcClient !== 'undefined' && RpcClient.batchCallChunked) {
            // v4.15.29: shared chunked JSON-RPC batching keeps quota guards in one place.
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

        if (allOk && parsed) {
          if (parsed && Array.isArray(parsed)) {
            if (typeof RpcHealth !== 'undefined') RpcHealth.recordSuccess(currentRpc);
            rpcSuccess = true;
            successfulRpcCount++;
            
            // v4.13.8: Build response map by id for direct index lookup
            var respById = {};
            for (var ri = 0; ri < parsed.length; ri++) {
              var r = parsed[ri];
              if (r && r.id !== undefined) respById[r.id] = r;
            }

            // v4.13.8: Extract decimals from batch (only on first successful RPC)
            if (successfulRpcCount === 1) {
              for (var dc in decimalsIdx) {
                var dRes = respById[decimalsIdx[dc]];
                if (dRes && !dRes.error && dRes.result && dRes.result !== "0x") {
                  try {
                    var dVal = parseInt(dRes.result, 16);
                    if (!isNaN(dVal) && dVal >= 0 && dVal <= decimalsMax) {
                      if (!metaMap[dc]) metaMap[dc] = { symbol: "", name: "", decimals: decimalsFallback, lastSeenMs: nowMs, lastFetchMs: 0, decimalsSuspect: false };
                      metaMap[dc].decimals = dVal;
                      metaMap[dc].lastFetchMs = nowMs;
                      metaMap[dc].decimalsSuspect = false;
                    }
                  } catch (eD) {}
                }
              }
              for (var sc in symbolIdx) {
                var sRes = respById[symbolIdx[sc]];
                if (sRes && !sRes.error && sRes.result && sRes.result !== "0x") {
                  try {
                    var sym = (typeof AbiDecode !== 'undefined' && AbiDecode.decodeStringOrBytes32)
                      ? AbiDecode.decodeStringOrBytes32(sRes.result)
                      : "";
                    if (sym) {
                      // v4.15.43: decimalsSuspect=true — decimals not fetched yet,
                      // fallback may be wrong. TOKEN_DECIMALS config can override later.
                      if (!metaMap[sc]) metaMap[sc] = { symbol: "", name: "", decimals: decimalsFallback, lastSeenMs: nowMs, lastFetchMs: 0, decimalsSuspect: true };
                      metaMap[sc].symbol = sym;
                      metaMap[sc].lastSeenMs = nowMs;
                      metaSymbolUpdated++;
                    }
                  } catch (eS) {}
                }
              }
              for (var ncName in nameIdx) {
                var nRes = respById[nameIdx[ncName]];
                if (nRes && !nRes.error && nRes.result && nRes.result !== "0x") {
                  try {
                    var nm = (typeof AbiDecode !== 'undefined' && AbiDecode.decodeStringOrBytes32)
                      ? AbiDecode.decodeStringOrBytes32(nRes.result)
                      : "";
                    if (nm) {
                      // v4.15.43: decimalsSuspect=true — decimals not fetched yet,
                      // fallback may be wrong. TOKEN_DECIMALS config can override later.
                      if (!metaMap[ncName]) metaMap[ncName] = { symbol: "", name: "", decimals: decimalsFallback, lastSeenMs: nowMs, lastFetchMs: 0, decimalsSuspect: true };
                      metaMap[ncName].name = nm;
                      metaMap[ncName].lastSeenMs = nowMs;
                      metaNameUpdated++;
                    }
                  } catch (eN) {}
                }
              }
            }

            for (var j = 0; j < validContracts.length; j++) {
              var contract = validContracts[j];
              var res = respById[balanceOfIdx[contract]];

              if (res && !res.error && res.result) {
                var hex = res.result || "0x0";
                if (hex === "0x") hex = "0x0";

                try {
                  // Get decimals: prefer verified metaMap, but skip suspect entries
                  // (v4.15.43 FIX: require !decimalsSuspect — a non-suspect 18-dec
                  //  fallback blocks the TOKEN_DECIMALS config override entirely)
                  var _meta = metaMap ? metaMap[contract] : null;
                  var _explicitDecimals = (config && config.RPC && config.RPC.TOKEN_DECIMALS) ? config.RPC.TOKEN_DECIMALS[contract] : null;
                  var decimals = Num.isValid(_explicitDecimals) ? _explicitDecimals
                    : ((_meta && Num.isValid(_meta.decimals) && !_meta.decimalsSuspect) ? _meta.decimals
                    : decimalsFallback);

                  var rawBal = BigInt(hex);
                  var bal = BigNum.toDecimal(rawBal, decimals);

                  ConsensusHelper.addRpcVote(tokenVotes[contract], bal);
                } catch (e) {}
              }
            }
          } else {
            if (typeof RpcHealth !== 'undefined') RpcHealth.recordFailure(currentRpc, config);
          }
        } else {
          if (typeof RpcHealth !== 'undefined') RpcHealth.recordFailure(currentRpc, config);
        }
      } catch (e) {
        if (typeof RpcHealth !== 'undefined') RpcHealth.recordFailure(currentRpc, config);
      }
      
      // v4.13.3: RPC failed → pull a backup replacement into the queue
      // Error RPCs should not reduce consensus capacity
      if (!rpcSuccess && backupRpcs.length > 0) {
        var replacement = backupRpcs.shift();
        rpcList.push(replacement);
        triedRpcs[replacement] = true;
        rpcRetries++;
      }

      // v4.13.10: RPC succeeded but some tokens still lack consensus
      // Pull a backup to resolve disagreement (not just on failure)
      if (rpcSuccess && rpcIdx >= rpcList.length && backupRpcs.length > 0) {
        var needMore = false;
        for (var nc in tokenVotes) {
          if (!ConsensusHelper.checkConsensus(tokenVotes[nc]).hasConsensus) {
            needMore = true;
            break;
          }
        }
        if (needMore) {
          var extraRpc = backupRpcs.shift();
          rpcList.push(extraRpc);
          triedRpcs[extraRpc] = true;
          rpcRetries++;
        }
      }
    }
    
    // v4.13.3: Use SUCCESSFUL RPC count (not total selected) for fallback decisions
    // Error RPCs must not count against consensus - they simply didn't participate
    var effectiveRpcCount = successfulRpcCount + (hasRecentActivity ? 0 : 1); // +1 for cache vote slot
    
    // Apply consensus results (with fallback for limited RPC scenarios)
    var fallbackCount = 0;
    for (var k = 0; k < validContracts.length; k++) {
      var contract = validContracts[k];
      
      // Use fallback-aware consensus for chains with few RPCs
      var consensus = ConsensusHelper.getConsensusBalanceWithFallback(
        tokenVotes[contract], 
        2,  // minVotes
        {
          allowFallback: true,
          cachedBalance: tokenCachedBalances[contract],
          cacheVoteSkipped: tokenCacheVoteSkipped[contract],
          totalRpcsAvailable: effectiveRpcCount
        }
      );
      
      if (consensus.hasConsensus || consensus.isFallback) {
        if (consensus.isFallback) fallbackCount++;
        
        balanceTsMap[contract] = nowMs;
        
        if (!Num.isPositive(consensus.balance)) {
          // Zero balance - purge from assets
          if (typeof AssetManager !== 'undefined') {
            AssetManager.purgeIfZero(assetByKey, contract, consensus.balance, null, balanceTsMap, nowMs, true);
          }
        } else {
          // Positive balance - upsert
          var meta = metaMap ? metaMap[contract] : null;
          if (typeof AssetManager !== 'undefined') {
            AssetManager.upsert(assetByKey, {
              contract: contract,
              symbol: (meta && meta.symbol) || "",
              name: (meta && meta.name) || "",
              balance: consensus.balance
            });
          }
          updated++;
        }
      }
      // No consensus AND no valid fallback = keep cached value (don't update timestamp)
    }
    
    return { updated: updated, attempted: attempted, fallbackCount: fallbackCount, rpcRetries: rpcRetries, metaSymbolUpdated: metaSymbolUpdated, metaNameUpdated: metaNameUpdated, multicall3UsedCount: multicall3UsedCount, multicall3FallbackCount: multicall3FallbackCount };
  }
};

// ============================================================
// BACKWARD COMPATIBILITY WRAPPER
// Replace old BalanceFetcher.fullScan calls
// ============================================================

// Store original BalanceFetcher if it exists
var _originalBalanceFetcher = (typeof BalanceFetcher !== 'undefined') ? BalanceFetcher : null;

// Create wrapper that uses simplified version
var BalanceFetcherSimplified = {
  
  /**
   * Wrapper for fullScan that matches old signature but uses simplified logic
   * Old signature: fullScan(rpc, wallet, allContracts, assetByKey, balanceTsMap, attemptTsMap, purgedTsMap, metaMap, nowMs, timer, budget, rrCursor, config, hasRecentActivity)
   */
  fullScan: function(rpc, wallet, allContracts, assetByKey, balanceTsMap, attemptTsMap, purgedTsMap, metaMap, nowMs, timer, budget, rrCursor, config, hasRecentActivity) {
    // Use simplified version
    return SimpleBalanceFetcher.fullScan(
      rpc, wallet, allContracts, assetByKey, 
      balanceTsMap, attemptTsMap, purgedTsMap, metaMap,
      nowMs, timer, rrCursor, config, hasRecentActivity
    );
  },
  
  // Delegate other methods to original if available
  getNativeBalance: function(address, userRpc, timer, rpcCount, config) {
    if (_originalBalanceFetcher && _originalBalanceFetcher.getNativeBalance) {
      return _originalBalanceFetcher.getNativeBalance(address, userRpc, timer, rpcCount, config);
    }
    return null;
  }
};
