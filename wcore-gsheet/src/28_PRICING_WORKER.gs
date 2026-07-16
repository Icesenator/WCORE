// v4.15.33 — LockService dans _dispatchGlobal (07_PRICES), PRICE_STALE_MS aligne 90min, skipDeep anti-duplication GT
// v0.1.28 - tolerate GT batch throttling and add direct GT pool fallback for Base Uniswap v4 microcaps
// v0.1.27 - GT /pools picks deepest priced pool and accepts token_price_usd for Uniswap v4 pools
// v0.1.26 - on-chain V3 fallback for microcaps without indexer coverage
// v0.1.25 - use Recap Chain to target wallet-chain sheets with partial cycles or missing prices first
// v0.1.24 - detect any wallet-chain sheet by suffix+layout, not by wallet brand prefix
// v0.1.23 - prioritize visible gaps across all wallet-chain sheets, not only Ledger - *
// v0.1.22 - open target spreadsheet explicitly when worker runs without UI context
// v0.1.17 - CMC DEX partial runs only cooldown contracts actually attempted
// v0.1.21 - try lightweight CMC DEX before expensive GT for visible gaps
// v0.1.20 - process one visible-missing priority chain per run
// v0.1.19 - lazily resolve ChainFactory registry only for active Ledger chains
// v0.1.18 - chain config index reads ChainFactory registry before globals
// v0.1.16 - quota skips no longer enforce pricing interval after recovery
// v0.1.15 - worker probes stale quota breaker so automatic recovery resumes
// v0.1.14 - CMC DEX fallback for DEX microcaps after Dex/GT misses
// v0.1.13 - unresolved retries are throttled without no-market price sentinels
// v0.1.12 - visible no-market gaps stay blank and respect retry cooldown
// v0.1.3 - instrumentation HttpCallCounter per-trigger

var PRICING_WORKER_VERSION = "4.15.34";

var PRICING_WORKER_CONFIG = {
  ENABLED_KEY: "PRICING_WORKER_ENABLED",
  INTERVAL_KEY: "PRICING_WORKER_INTERVAL_MIN",
  TRIGGER_ID_KEY: "PRICING_WORKER_TRIGGER_ID",
  STATS_KEY: "PRICING_WORKER_STATS",
  DEFAULT_INTERVAL_MIN: 90,
  ACTIVE_ENTRY_MS: 86400000,
  UNRESOLVED_RETRY_MS: 21600000,
  GT_POOLS_MAX_PER_RUN: 8,
  GT_DIRECT_MAX_PER_RUN: 3,
  CMC_DEX_MAX_PER_RUN: 8,
  ONCHAIN_V3_MAX_PER_RUN: 5,
  MAX_PRIORITY_CHAINS_PER_RUN: 1,
  MAX_RUNTIME_MS: 330000,
  CHUNK_SIZE: 200
};

var PRICING_WORKER_SPREADSHEET_ID = "1kxidZZoEM6fXubFpp54fKvzJeXFCSCWCfyMTPNwYRB4";

function _pricingWorkerProps_() {
  return PropertiesService.getScriptProperties();
}

function _pricingWorkerEnabled_() {
  try {
    return _pricingWorkerProps_().getProperty(PRICING_WORKER_CONFIG.ENABLED_KEY) === "true";
  } catch (e) {
    return false;
  }
}

function _pricingWorkerTimer_(startedMs) {
  return {
    elapsed: function() { return Date.now() - startedMs; },
    remaining: function() { return Math.max(0, PRICING_WORKER_CONFIG.MAX_RUNTIME_MS - (Date.now() - startedMs)); },
    isLow: function(ms) { return this.remaining() < (ms || 0); },
    isTimeUp: function() { return this.remaining() <= 0; }
  };
}

function _pricingWorkerQuotaBlocked_() {
  try {
    var qBlocked = false;
    if (typeof QuotaCircuitBreaker !== "undefined" && QuotaCircuitBreaker.isBlocked && QuotaCircuitBreaker.isBlocked()) qBlocked = true;
    if (typeof QuotaCircuitBreaker !== "undefined" && QuotaCircuitBreaker.isTripped && QuotaCircuitBreaker.isTripped()) qBlocked = true;
    if (qBlocked) {
      if (QuotaCircuitBreaker.testOnce && QuotaCircuitBreaker.testOnce()) return false;
      return true;
    }
  } catch (eQuota) {
    return true;
  }
  try {
    if (typeof DegradedMode !== "undefined" && DegradedMode.isActive && DegradedMode.isActive()) return true;
    if (typeof DegradedMode !== "undefined" && DegradedMode.isCircuitBreakerActive && DegradedMode.isCircuitBreakerActive()) return true;
  } catch (eDeg) {}
  return false;
}

function _pricingWorkerQuotaUsed_() {
  try {
    if (typeof HttpCounter !== "undefined" && HttpCounter.count) return HttpCounter.count();
  } catch (eCounter) {}
  try {
    if (typeof GET_HTTP_COUNT_LAST_24H === "function") return GET_HTTP_COUNT_LAST_24H();
  } catch (eFn) {}
  return -1;
}

function _pricingWorkerIntervalMin_() {
  try {
    var n = parseInt(_pricingWorkerProps_().getProperty(PRICING_WORKER_CONFIG.INTERVAL_KEY) || PRICING_WORKER_CONFIG.DEFAULT_INTERVAL_MIN, 10);
    if (!isFinite(n) || n < 1) n = PRICING_WORKER_CONFIG.DEFAULT_INTERVAL_MIN;
    return n;
  } catch (e) {
    return PRICING_WORKER_CONFIG.DEFAULT_INTERVAL_MIN;
  }
}

function _pricingWorkerPreviousStats_() {
  try {
    var raw = _pricingWorkerProps_().getProperty(PRICING_WORKER_CONFIG.STATS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function _pricingWorkerGtBlockedThisRun_() {
  try {
    var root = _pricingWorkerGlobal_();
    return !!root.__WCORE_PRICING_WORKER_GT_BLOCKED;
  } catch (e) {
    return false;
  }
}

function _pricingWorkerSetGtBlocked_() {
  try {
    var root = _pricingWorkerGlobal_();
    root.__WCORE_PRICING_WORKER_GT_BLOCKED = true;
  } catch (e) {}
}

function _pricingWorkerGlobal_() {
  if (typeof globalThis !== "undefined") return globalThis;
  try { return Function("return this")(); } catch (e) {}
  return {};
}

function _pricingWorkerChainKey_(config) {
  try {
    var c = config && config.CHAIN ? config.CHAIN : null;
    var id = c && (c.CHAIN_ID || c.ID || c.NAME || c.CHAIN_NAME);
    return String(id || "unknown").toLowerCase();
  } catch (e) {
    return "unknown";
  }
}

function _pricingWorkerBuildConfigIndex_() {
  var index = {};
  var root = _pricingWorkerGlobal_();
  for (var name in root) {
    if (!root.hasOwnProperty(name)) continue;
    if (String(name).charAt(0) !== "_") continue;
    var obj = root[name];
    if (!obj || typeof obj.getConfig !== "function") continue;
    try {
      var cfg = obj.getConfig();
      if (!cfg || !cfg.CHAIN) continue;
      var key = _pricingWorkerChainKey_(cfg);
      if (key && key !== "unknown") index[key] = cfg;
      if (cfg.CHAIN.NAME) index[String(cfg.CHAIN.NAME).toLowerCase()] = cfg;
    } catch (eCfg) {}
  }
  return index;
}

function _pricingWorkerIndexConfig_(index, cfg, alias) {
  if (!index || !cfg || !cfg.CHAIN) return cfg;
  var key = _pricingWorkerChainKey_(cfg);
  if (key && key !== "unknown") index[key] = cfg;
  if (alias) index[String(alias).toLowerCase()] = cfg;
  if (cfg.CHAIN.NAME) index[String(cfg.CHAIN.NAME).toLowerCase()] = cfg;
  return cfg;
}

function _pricingWorkerResolveConfig_(key, index) {
  var k = String(key || "").toLowerCase();
  if (!k) return null;
  if (index && index[k]) return index[k];
  try {
    if (typeof ChainFactory !== "undefined" && ChainFactory.getRegistry) {
      var reg = ChainFactory.getRegistry() || {};
      var api = reg[String(key).toUpperCase()] || reg[k] || null;
      if (api && typeof api.getConfig === "function") {
        return _pricingWorkerIndexConfig_(index, api.getConfig(), key);
      }
    }
  } catch (eReg) {}
  return null;
}

function _pricingWorkerUnresolvedKey_(chainId, contract) {
  return "PW_UNRESOLVED:" + String(chainId || "").toLowerCase() + ":" + String(contract || "").toLowerCase();
}

function _pricingWorkerIsFreshUnresolved_(chainId, contract) {
  try {
    var v = CacheService.getScriptCache().get(_pricingWorkerUnresolvedKey_(chainId, contract));
    return !!v;
  } catch (e) {
    return false;
  }
}

function _pricingWorkerMarkUnresolved_(chainId, contract) {
  try {
    var retryMs = Number(PRICING_WORKER_CONFIG.UNRESOLVED_RETRY_MS || 21600000);
    var ttlSec = Math.max(60, Math.min(21600, Math.floor(retryMs / 1000)));
    CacheService.getScriptCache().put(_pricingWorkerUnresolvedKey_(chainId, contract), String(Date.now()), ttlSec);
    return true;
  } catch (e) {
    return false;
  }
}

function _pricingWorkerActiveContracts_(force) {
  var entries = [];
  try {
    if (GlobalPriceCache && GlobalPriceCache.getActiveEntries) {
      entries = GlobalPriceCache.getActiveEntries(PRICING_WORKER_CONFIG.ACTIVE_ENTRY_MS);
    }
  } catch (e) {
    entries = [];
  }

  var cfgIndex = _pricingWorkerBuildConfigIndex_();
  var skippedNonEvm = 0;
  var byChain = {};
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    if (!e || !e.chainId || !e.contract) continue;
    var chainId = String(e.chainId).toLowerCase();
    var contract = String(e.contract).toLowerCase();
    if (!chainId || !contract || contract === "native") continue;
    if (!force && _pricingWorkerIsFreshUnresolved_(chainId, contract)) continue;
    // Determine VM type for this chain via config index
    var chainCfg = _pricingWorkerResolveConfig_(chainId, cfgIndex);
    var isEvm = !chainCfg || !chainCfg.CHAIN || !chainCfg.CHAIN.CHAIN_ID || !/^[0-9]+$/.test(String(chainCfg.CHAIN.CHAIN_ID || ""));
    // Prefer explicit VM marker when available (SVM/Cosmos chains have no numeric CHAIN_ID)
    // EVM contracts must match 0x address format; non-EVM chains skip this check
    var isEvmAddress = /^0x[0-9a-f]{40}$/.test(contract);
    if (!isEvmAddress) {
      // For non-EVM chains (SVM mint base58, Cosmos denom), allow through without regex
      // For chains that appear EVM but have non-EVM address, skip explicitly
      if (chainCfg && chainCfg.CHAIN && chainCfg.CHAIN.CHAIN_ID && /^[0-9]+$/.test(String(chainCfg.CHAIN.CHAIN_ID || ""))) {
        // EVM chain with non-EVM-looking contract — skip explicitly
        skippedNonEvm++;
        continue;
      }
      // Non-EVM chain — allow through
    }
    if (!byChain[chainId]) byChain[chainId] = {};
    // v0.1.2: store priced flag (for unpriced-first ordering in _runPricingWorker)
    byChain[chainId][contract] = Number(e.price) > 0 && e.src !== "no-market";
  }
  if (skippedNonEvm > 0) Logger.log("[PricingWorker] skipped_non_evm=" + skippedNonEvm);
  return byChain;
}

function _pricingWorkerSheetPriceState_(rawPrice) {
  if (rawPrice === 0 || rawPrice === "0") return "zero";
  var n = Number(rawPrice || 0);
  if (n > 0 && isFinite(n)) return "positive";
  return "blank";
}

function _pricingWorkerPushPriority_(byChain, chainId) {
  if (!byChain.__priority) byChain.__priority = [];
  for (var i = 0; i < byChain.__priority.length; i++) {
    if (byChain.__priority[i] === chainId) return;
  }
  byChain.__priority.push(chainId);
}

function _pricingWorkerSetPriorityScore_(byChain, chainId, score) {
  if (!byChain || !chainId) return;
  if (!byChain.__priorityScores) byChain.__priorityScores = {};
  var n = Number(score || 0);
  if (!isFinite(n) || n < 0) n = 0;
  if (!byChain.__priorityScores[chainId] || n > byChain.__priorityScores[chainId]) {
    byChain.__priorityScores[chainId] = n;
  }
}

function _pricingWorkerSetContractPriority_(byChain, chainId, contract, score) {
  if (!byChain || !chainId || !contract) return;
  if (!byChain.__contractPriority) byChain.__contractPriority = {};
  if (!byChain.__contractPriority[chainId]) byChain.__contractPriority[chainId] = {};
  var n = Number(score || 0);
  if (!isFinite(n) || n < 0) n = 0;
  var prev = Number(byChain.__contractPriority[chainId][contract] || 0);
  if (n > prev) byChain.__contractPriority[chainId][contract] = n;
}

function _pricingWorkerGetSpreadsheet_() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) return ss;
  } catch (eActive) {}
  try {
    return SpreadsheetApp.openById(PRICING_WORKER_SPREADSHEET_ID);
  } catch (eOpen) {}
  return null;
}

function _pricingWorkerSheetChainLabel_(sheetName) {
  var name = String(sheetName || "").trim();
  if (!name) return "";
  var sep = name.lastIndexOf(" - ");
  if (sep < 0) return "";
  return String(name.substring(sep + 3) || "").trim().toLowerCase();
}

function _pricingWorkerLooksLikeWalletSheet_(values) {
  var rows = values || [];
  var checked = 0;
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i] || [];
    var contract = String(row[3] || "").toLowerCase();
    if (!contract) continue;
    checked++;
    if (!/^0x[0-9a-f]{40}$/.test(contract)) return false;
    if (row.length < 6) return false;
    if (checked >= 3) return true;
  }
  return checked > 0;
}

function _pricingWorkerTargetSheetsFromRecap_(ss) {
  var out = {};
  try {
    if (!ss || !ss.getSheetByName) return out;
     var recap = ss.getSheetByName("Recap Portfolio");
    if (!recap) return out;
    var lastRow = recap.getLastRow ? recap.getLastRow() : 0;
    var lastCol = recap.getLastColumn ? recap.getLastColumn() : 0;
    if (lastRow < 2 || lastCol < 2) return out;
    var header = recap.getRange(1, 1, 1, lastCol).getValues()[0] || [];
    var nameCol = 0;
    var nativeCol = -1;
    for (var h = 0; h < header.length; h++) {
      var key = String(header[h] || "").toLowerCase().trim();
      if (key === "wallet - chain") nameCol = h;
      else if (key === "info_native") nativeCol = h;
    }
    if (nativeCol < 0) return out;
    var rows = recap.getRange(2, 1, lastRow - 1, lastCol).getValues();
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i] || [];
      var name = String(row[nameCol] || "").trim();
      if (!name) continue;
      var infoNative = String(row[nativeCol] || "").toLowerCase();
      if (!infoNative) continue;
      var missingMatch = infoNative.match(/price_missing:(\d+)/);
      var missingCount = missingMatch ? Number(missingMatch[1]) : 0;
      if (infoNative.indexOf("cycle:partial") >= 0 || missingCount > 0) {
        out[name] = {
          missingCount: missingCount,
          partial: infoNative.indexOf("cycle:partial") >= 0
        };
      }
    }
  } catch (eRecap) {}
  return out;
}

function _pricingWorkerMergeSheetContracts_(byChain, force) {
  byChain = byChain || {};
  var cfgIndex = _pricingWorkerBuildConfigIndex_();
  try {
    var ss = _pricingWorkerGetSpreadsheet_();
    if (!ss) return byChain;
    var recapTargets = _pricingWorkerTargetSheetsFromRecap_(ss);
    var hasRecapTargets = Object.keys(recapTargets).length > 0;
    var sheets = ss.getSheets();
    for (var s = 0; s < sheets.length; s++) {
      var sheet = sheets[s];
      var name = sheet.getName ? String(sheet.getName()) : "";
      var recapTarget = hasRecapTargets ? recapTargets[name] : null;
      if (hasRecapTargets && !recapTarget) continue;
      var label = _pricingWorkerSheetChainLabel_(name);
      if (!label) continue;
      var cfg = _pricingWorkerResolveConfig_(label, cfgIndex);
      if (!cfg) continue;
      var chainId = _pricingWorkerChainKey_(cfg);
      if (recapTarget && _pricingWorkerChainHasContracts_(byChain, chainId)) {
        _pricingWorkerSetPriorityScore_(byChain, chainId, recapTarget.missingCount || 0);
        _pricingWorkerPushPriority_(byChain, chainId);
      }
      var lastRow = sheet.getLastRow ? sheet.getLastRow() : 0;
      if (lastRow < 3) continue;
      var values = sheet.getRange(3, 1, Math.min(lastRow - 2, 1000), 7).getValues();
      if (!_pricingWorkerLooksLikeWalletSheet_(values)) continue;
      for (var r = 0; r < values.length; r++) {
        var row = values[r] || [];
        var contract = String(row[3] || "").toLowerCase();
        if (!/^0x[0-9a-f]{40}$/.test(contract)) continue;
        var bal = Number(row[4] || 0);
        if (!(bal > 0)) continue;
        var priceState = _pricingWorkerSheetPriceState_(row[5]);
        // v0.1.13: visible gaps remain partial/blank; unresolved cooldowns
        // only throttle retries and never write price=0 cache entries.
        if (priceState !== "positive" && !force && _pricingWorkerIsFreshUnresolved_(chainId, contract)) continue;
        if (!byChain[chainId]) byChain[chainId] = {};
        if (recapTarget) _pricingWorkerSetPriorityScore_(byChain, chainId, recapTarget.missingCount || 0);
        byChain[chainId][contract] = priceState === "positive";
        if (priceState !== "positive") {
          _pricingWorkerPushPriority_(byChain, chainId);
          _pricingWorkerSetContractPriority_(byChain, chainId, contract, 1000000 + Math.min(999999, Math.floor(bal || 0)));
        }
      }
    }
  } catch (e) {}
  return byChain;
}

function _pricingWorkerHasContracts_(byChain) {
  if (!byChain) return false;
  for (var chainId in byChain) {
    if (!byChain.hasOwnProperty(chainId) || String(chainId).indexOf("__") === 0) continue;
    if (_pricingWorkerChainHasContracts_(byChain, chainId)) return true;
  }
  return false;
}

function _pricingWorkerChainHasContracts_(byChain, chainId) {
  var contracts = byChain && byChain[chainId];
  if (!contracts) return false;
  for (var contract in contracts) {
    if (contracts.hasOwnProperty(contract)) return true;
  }
  return false;
}

function _pricingWorkerChunk_(items, size) {
  var out = [];
  for (var i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function _pxTryLlamaCoins(contracts, timer, config) {
  var out = {};
  try {
    var map = PriceSources.llamaCoinsBatchUsd(contracts, timer, config);
    for (var k in (map || {})) {
      if (!map.hasOwnProperty(k)) continue;
      if (map[k] != null && Number(map[k]) > 0) out[String(k).toLowerCase()] = { priceUsd: Number(map[k]), source: "llama-coins" };
    }
  } catch (e) {}
  return out;
}

function _pxTryDexScreener(contracts, timer, config) {
  try {
    return PriceSources.dexBulkTokens(contracts, timer, config) || {};
  } catch (e) {
    return {};
  }
}

function _pxTryGT(contracts, timer, config) {
  if (_pricingWorkerGtBlockedThisRun_()) return { _rateLimited: true };
  try {
    // v4.15.33: Track all GT-attempted contracts to skip deep re-fetch
    var gtAttempted = {};
    for (var gi = 0; gi < (contracts || []).length; gi++) {
      gtAttempted[String(contracts[gi] || "").toLowerCase()] = true;
    }
    var out = _pricingWorkerGtSimpleBatch_(contracts, timer, config);
    var simpleLimited = !!(out && out._rateLimited);
    if (out && out._rateLimited) delete out._rateLimited;
    var missing = [];
    for (var i = 0; i < (contracts || []).length; i++) {
      var k = String(contracts[i] || "").toLowerCase();
      if (!k || out[k]) continue;
      missing.push(contracts[i]);
    }
    var poolsLimited = false;
    if (missing.length && !(timer && timer.isLow && timer.isLow(45000))) {
      var pools = _pricingWorkerGtPoolsFallback_(missing, timer, config);
      poolsLimited = !!(pools && pools._rateLimited);
      if (pools && pools._rateLimited) delete pools._rateLimited;
      for (var pk in pools) {
        if (!pools.hasOwnProperty(pk) || pk === "_rateLimited") continue;
        out[String(pk).toLowerCase()] = pools[pk];
      }
      var stillMissing = [];
      for (var sm = 0; sm < missing.length; sm++) {
        var smK = String(missing[sm] || "").toLowerCase();
        if (!out[smK]) stillMissing.push(missing[sm]);
      }
      missing = stillMissing;
    }
    var directLimited = false;
    if (missing.length && (simpleLimited || poolsLimited) && !(timer && timer.isLow && timer.isLow(20000))) {
      var direct = _pricingWorkerGtDirectPoolFallback_(missing, timer, config);
      directLimited = !!(direct && direct._rateLimited);
      if (direct && direct._rateLimited) delete direct._rateLimited;
      for (var gx in direct) {
        if (!direct.hasOwnProperty(gx) || gx === "_rateLimited") continue;
        out[String(gx).toLowerCase()] = direct[gx];
      }
      var stillMissingDirect = [];
      for (var sd = 0; sd < missing.length; sd++) {
        var sdK = String(missing[sd] || "").toLowerCase();
        if (!out[sdK]) stillMissingDirect.push(missing[sd]);
      }
      missing = stillMissingDirect;
    }
    if (missing.length && !(timer && timer.isLow && timer.isLow(45000))) {
      var deepMissing = [];
      for (var dm = 0; dm < missing.length; dm++) {
        if (!gtAttempted[String(missing[dm] || "").toLowerCase()]) {
          deepMissing.push(missing[dm]);
        }
      }
      if (deepMissing.length) {
        var deep = BulkPriceFetch.fetch(deepMissing, { dex: false, gt: true, parallelPrices: true }, timer, config) || {};
        for (var dk in deep) {
          if (!deep.hasOwnProperty(dk) || dk === "_rateLimited") continue;
          out[String(dk).toLowerCase()] = deep[dk];
        }
      }
    }
    if ((simpleLimited || poolsLimited || directLimited || _pricingWorkerSourceRateLimited_("geckoterminal")) && !Object.keys(out).length) out._rateLimited = true;
    return out;
  } catch (e) {
    return { _rateLimited: _pricingWorkerSourceRateLimited_("geckoterminal") };
  }
}

function _pxTryCmcDex(contracts, timer, config) {
  try {
    if (!PriceSources || !PriceSources.cmcDexTokenPrices) return {};
    return PriceSources.cmcDexTokenPrices(contracts, timer, config, PRICING_WORKER_CONFIG.CMC_DEX_MAX_PER_RUN) || {};
  } catch (e) {
    return { _rateLimited: _pricingWorkerSourceRateLimited_("dex.coinmarketcap.com") };
  }
}

function _pricingWorkerNeedOnChainContracts_(contracts, config) {
  var out = [];
  try {
    var chainKey = String((config && config.CHAIN && (config.CHAIN.GT_NETWORK || config.CHAIN.CHAIN_ID || config.CHAIN.NAME)) || "unknown").toLowerCase();
    for (var i = 0; i < (contracts || []).length; i++) {
      var c = String(contracts[i] || "").toLowerCase();
      if (!/^0x[0-9a-f]{40}$/.test(c)) continue;
      var hint = (typeof _pxL1GetJson === "function") ? _pxL1GetJson("NEED_ONCHAIN:" + chainKey + ":" + c) : null;
      if (hint && hint.on) out.push(c);
    }
  } catch (e) {}
  return out;
}

function _pxTryOnChainV3Worker(contracts, timer, config) {
  var out = {};
  try {
    if (typeof _pxTryOnChainV3_ !== "function") return out;
    // Skip if this chain has no on-chain V3 spec (use spec check to support multi-chain)
    if (!_pxOnChainV3Spec_(null, config)) return out;
    var max = Number(PRICING_WORKER_CONFIG.ONCHAIN_V3_MAX_PER_RUN || 5);
    if (!isFinite(max) || max < 1) max = 5;
    var tried = 0;
    var totalEligible = 0;
    for (var j = 0; j < (contracts || []).length; j++) {
      if (/^0x[0-9a-f]{40}$/.test(String(contracts[j] || "").toLowerCase())) totalEligible++;
    }
    for (var i = 0; i < (contracts || []).length; i++) {
      if (tried >= max) break;
      if (timer && timer.isLow && timer.isLow(12000)) break;
      var c = String(contracts[i] || "").toLowerCase();
      if (!/^0x[0-9a-f]{40}$/.test(c)) continue;
      tried++;
      var rec = _pxTryOnChainV3_(c, (config && config.CHAIN && (config.CHAIN.GT_NETWORK || config.CHAIN.CHAIN_ID)) || "base", config, timer);
      if (rec && rec.priceUsd != null && Number(rec.priceUsd) > 0) {
        out[c] = { priceUsd: Number(rec.priceUsd), source: rec.source || "onchain-v3" };
      }
    }
    if (totalEligible > tried) out._partial = true;
  } catch (e) {}
  return out;
}

function _pricingWorkerGtSimpleBatch_(contracts, timer, config) {
  var out = {};
  try {
    var net = (typeof _pxGetGtNetwork === "function") ? _pxGetGtNetwork(config) : (config && config.CHAIN && config.CHAIN.GT_NETWORK);
    var base = (typeof _pxGetGtSimpleBaseUrl === "function") ? _pxGetGtSimpleBaseUrl(config) : "https://api.geckoterminal.com/api/v2/simple/networks";
    if (!net || !base) return out;
    var evm = [];
    for (var i = 0; i < (contracts || []).length; i++) {
      var c = String(contracts[i] || "").toLowerCase();
      if (/^0x[0-9a-f]{40}$/.test(c)) evm.push(c);
    }
    for (var p = 0; p < evm.length; p += 30) {
      if (timer && timer.isLow && timer.isLow(45000)) break;
      var batch = evm.slice(p, p + 30);
      var url = base + "/" + encodeURIComponent(net) + "/token_price/" + batch.join("%2C");
      var json = null;
      var code = 0;
      try {
        if (HTTP && HTTP.canFetchNow && !HTTP.canFetchNow("pricing-worker-gt-simple")) {
          out._rateLimited = true;
          return out;
        }
        if (HTTP && HTTP._record) HTTP._record(url, 1);
        var resp = UrlFetchApp.fetch(url, {
          method: "get",
          headers: { accept: "application/json", "User-Agent": "Mozilla/5.0" },
          muteHttpExceptions: true,
          followRedirects: true,
          deadline: 10
        });
        code = resp && resp.getResponseCode ? resp.getResponseCode() : 0;
        if (HTTP) {
          HTTP._lastJsonStatus = code;
          HTTP._lastJsonHost = "api.geckoterminal.com";
        }
        if (code >= 200 && code < 300) json = JSON.parse(resp.getContentText());
      } catch (eFetch) {
        code = 0;
      }
      if (code === 429 || code >= 500 || code === 0) {
        out._rateLimited = true;
        return out;
      }
      var prices = json && json.data && json.data.attributes && json.data.attributes.token_prices;
      if (!prices) continue;
      for (var j = 0; j < batch.length; j++) {
        var addr = batch[j];
        var raw = prices[addr];
        var px = Number(raw);
        if (px > 0 && isFinite(px)) out[addr] = { priceUsd: px, source: "gt-batch" };
      }
    }
  } catch (e) {}
  return out;
}

function _pricingWorkerGtPoolsFallback_(contracts, timer, config) {
  var out = {};
  try {
    var net = (typeof _pxGetGtNetwork === "function") ? _pxGetGtNetwork(config) : (config && config.CHAIN && config.CHAIN.GT_NETWORK);
    var base = (typeof _pxGetGtBaseUrl === "function") ? _pxGetGtBaseUrl(config) : "https://api.geckoterminal.com/api/v2/networks";
    if (!net || !base) return out;
    var max = Number(PRICING_WORKER_CONFIG.GT_POOLS_MAX_PER_RUN || 8);
    if (!isFinite(max) || max < 1) max = 8;
    var tried = 0;
    for (var i = 0; i < (contracts || []).length; i++) {
      if (tried >= max) break;
      if (timer && timer.isLow && timer.isLow(45000)) break;
      var c = String(contracts[i] || "").toLowerCase();
      if (!/^0x[0-9a-f]{40}$/.test(c)) continue;
      tried++;
      var url = base + "/" + encodeURIComponent(net) + "/tokens/" + encodeURIComponent(c) + "/pools?page=1";
      var json = HTTP.getJson(url, { timeoutMs: 20000, headers: { accept: "application/json", "User-Agent": "Mozilla/5.0" }, muteHttpExceptions: true }, config);
      if (_pricingWorkerSourceRateLimited_("geckoterminal")) {
        out._rateLimited = true;
        return out;
      }
      var pools = json && json.data;
      if (!pools || !pools.length) continue;
      var bestPx = null;
      var bestReserve = -1;
      for (var p = 0; p < pools.length; p++) {
        var pool = pools[p];
        var attr = pool && pool.attributes ? pool.attributes : {};
        var rel = pool && pool.relationships ? pool.relationships : {};
        var isBase = rel.base_token && rel.base_token.data && String(rel.base_token.data.id || "").toLowerCase().indexOf(c) >= 0;
        var isQuote = rel.quote_token && rel.quote_token.data && String(rel.quote_token.data.id || "").toLowerCase().indexOf(c) >= 0;
        var px = isBase ? Number(attr.base_token_price_usd) : (isQuote ? Number(attr.quote_token_price_usd) : Number(attr.token_price_usd));
        if (!(px > 0 && isFinite(px))) continue;
        var reserve = Number(attr.reserve_in_usd || 0);
        if (!isFinite(reserve) || reserve < 0) reserve = 0;
        if (bestPx == null || reserve > bestReserve) {
          bestPx = px;
          bestReserve = reserve;
        }
      }
      if (bestPx != null) out[c] = { priceUsd: Number(bestPx), source: "gt-pools" };
    }
  } catch (e) {}
  return out;
}

function _pricingWorkerGtDirectPoolFallback_(contracts, timer, config) {
  var out = {};
  try {
    var net = (typeof _pxGetGtNetwork === "function") ? _pxGetGtNetwork(config) : (config && config.CHAIN && config.CHAIN.GT_NETWORK);
    var base = (typeof _pxGetGtBaseUrl === "function") ? _pxGetGtBaseUrl(config) : "https://api.geckoterminal.com/api/v2/networks";
    if (!net || !base) return out;
    var max = Number(PRICING_WORKER_CONFIG.GT_DIRECT_MAX_PER_RUN || 3);
    if (!isFinite(max) || max < 1) max = 3;
    var tried = 0;
    var limitedHits = 0;
    for (var i = 0; i < (contracts || []).length; i++) {
      if (tried >= max) break;
      if (timer && timer.isLow && timer.isLow(12000)) break;
      var c = String(contracts[i] || "").toLowerCase();
      if (!/^0x[0-9a-f]{40}$/.test(c)) continue;
      tried++;
      var url = base + "/" + encodeURIComponent(net) + "/tokens/" + encodeURIComponent(c) + "/pools?page=1";
      var code = 0;
      var json = null;
      try {
        if (HTTP && HTTP.canFetchNow && !HTTP.canFetchNow("pricing-worker-gt-direct")) {
          limitedHits++;
          continue;
        }
        if (HTTP && HTTP._record) HTTP._record(url, 1);
        var resp = UrlFetchApp.fetch(url, {
          method: "get",
          headers: {
            accept: "application/json, text/plain, */*",
            origin: "https://www.geckoterminal.com",
            referer: "https://www.geckoterminal.com/",
            "User-Agent": "Mozilla/5.0 (compatible; WCORE/4.15)"
          },
          muteHttpExceptions: true,
          followRedirects: true
        });
        code = resp && resp.getResponseCode ? Number(resp.getResponseCode()) : 0;
        try { if (HTTP) { HTTP._lastJsonStatus = code; HTTP._lastJsonHost = "api.geckoterminal.com"; } } catch (eHttpMeta) {}
        if (code >= 200 && code < 300 && resp && resp.getContentText) json = JSON.parse(resp.getContentText());
      } catch (eFetch) {
        code = 0;
      }
      if (code === 429 || code >= 500 || code === 0) {
        limitedHits++;
        continue;
      }
      var pools = json && json.data;
      if (!pools || !pools.length) continue;
      var bestPx = null;
      var bestReserve = -1;
      for (var p = 0; p < pools.length; p++) {
        var pool = pools[p];
        var attr = pool && pool.attributes ? pool.attributes : {};
        var rel = pool && pool.relationships ? pool.relationships : {};
        var isBase = rel.base_token && rel.base_token.data && String(rel.base_token.data.id || "").toLowerCase().indexOf(c) >= 0;
        var isQuote = rel.quote_token && rel.quote_token.data && String(rel.quote_token.data.id || "").toLowerCase().indexOf(c) >= 0;
        var px = isBase ? Number(attr.base_token_price_usd) : (isQuote ? Number(attr.quote_token_price_usd) : Number(attr.token_price_usd));
        if (!(px > 0 && isFinite(px))) continue;
        var reserve = Number(attr.reserve_in_usd || 0);
        if (!isFinite(reserve) || reserve < 0) reserve = 0;
        if (bestPx == null || reserve > bestReserve) {
          bestPx = px;
          bestReserve = reserve;
        }
      }
      if (bestPx != null) {
        out[c] = { priceUsd: Number(bestPx), source: "gt-pools-direct" };
        try { _pxL1SetJson(_pxL1Key("GT", config, c), { u: Number(bestPx) }, PX_L1_TTL_MIN_SEC); } catch (eL1) {}
      }
    }
    if (limitedHits > 0 && !Object.keys(out).length) out._rateLimited = true;
  } catch (e) {}
  return out;
}

function _pricingWorkerSourceRateLimited_(hostNeedle) {
  try {
    var code = HTTP && HTTP._lastJsonStatus;
    var host = String((HTTP && HTTP._lastJsonHost) || "").toLowerCase();
    var limited = Number(code) === 429 && (!hostNeedle || host.indexOf(String(hostNeedle).toLowerCase()) >= 0);
    if (limited && (!hostNeedle || String(hostNeedle).toLowerCase().indexOf("gecko") >= 0)) _pricingWorkerSetGtBlocked_();
    return limited;
  } catch (e) {
    return false;
  }
}

function _pricingWorkerCascadeChunk_(contracts, timer, config, sourceCounts) {
  var out = {};
  var missing = contracts.slice();
  var completedCascade = true;
  var attemptedCmcMisses = [];

  function applyMap(map, fallbackSource) {
    if (map && map._rateLimited) {
      completedCascade = false;
      out._rateLimited = true;
      sourceCounts[fallbackSource + "-rate-limited"] = (sourceCounts[fallbackSource + "-rate-limited"] || 0) + 1;
      return;
    }
    var nextMissing = [];
    for (var i = 0; i < missing.length; i++) {
      var c = String(missing[i]).toLowerCase();
      var rec = map[c] || map[missing[i]];
      var priceUsd = rec && rec.priceUsd != null ? Number(rec.priceUsd) : Number(rec);
      if (priceUsd > 0 && isFinite(priceUsd)) {
        var source = (rec && rec.source) || fallbackSource;
        out[c] = { priceUsd: priceUsd, source: source };
        sourceCounts[source] = (sourceCounts[source] || 0) + 1;
      } else {
        nextMissing.push(missing[i]);
      }
    }
    missing = nextMissing;
  }

  if (missing.length) {
    if (!timer.isLow(45000)) applyMap(_pxTryLlamaCoins(missing, timer, config), "llama-coins");
    else completedCascade = false;
  }
  if (missing.length) {
    if (!timer.isLow(45000)) applyMap(_pxTryDexScreener(missing, timer, config), "dex");
    else completedCascade = false;
  }
  if (missing.length) {
    if (!timer.isLow(45000)) {
      var cmcMap = _pxTryCmcDex(missing, timer, config);
      applyMap(cmcMap, "cmc-dex");
      if (cmcMap && cmcMap._partial) {
        completedCascade = false;
        sourceCounts["cmc-dex-partial"] = (sourceCounts["cmc-dex-partial"] || 0) + 1;
      }
      if (cmcMap && !cmcMap._rateLimited && cmcMap._attemptedContracts && cmcMap._attemptedContracts.length) {
        var stillMissing = {};
        for (var sm = 0; sm < missing.length; sm++) stillMissing[String(missing[sm]).toLowerCase()] = true;
        for (var ac = 0; ac < cmcMap._attemptedContracts.length; ac++) {
          var acAddr = String(cmcMap._attemptedContracts[ac] || "").toLowerCase();
          if (stillMissing[acAddr]) attemptedCmcMisses.push(acAddr);
        }
      }
    }
    else completedCascade = false;
  }
  if (missing.length) {
    if (!timer.isLow(12000)) {
      var hinted = _pricingWorkerNeedOnChainContracts_(missing, config);
      if (hinted.length) applyMap(_pxTryOnChainV3Worker(hinted, timer, config), "onchain-v3");
    } else completedCascade = false;
  }
  if (missing.length) {
    if (!timer.isLow(45000)) applyMap(_pxTryGT(missing, timer, config), "gt");
    else completedCascade = false;
  }
  if (missing.length) {
    if (!timer.isLow(12000)) {
      var onchainMap = _pxTryOnChainV3Worker(missing, timer, config);
      applyMap(onchainMap, "onchain-v3");
      if (onchainMap && onchainMap._partial) {
        completedCascade = false;
        sourceCounts["onchain-v3-partial"] = (sourceCounts["onchain-v3-partial"] || 0) + 1;
      }
    } else completedCascade = false;
  }

  if (completedCascade && missing.length) out._unresolvedContracts = missing.slice();
  else if (!completedCascade && attemptedCmcMisses.length) out._unresolvedContracts = attemptedCmcMisses.slice();

  return out;
}

function _pricingWorkerSaveStats_(stats) {
  try {
    _pricingWorkerProps_().setProperty(PRICING_WORKER_CONFIG.STATS_KEY, JSON.stringify(stats || {}));
  } catch (e) {}
}

function _runPricingWorker(force) {
  // v4.15.34: DISABLED — all wallets use WEB_SCAN (Railway-side pricing).
  // Direct HTTP calls to Llama/DexScreener/GT/CMC/RPCs were consuming
  // ~1440-2304 UrlFetchApp calls/day for a cache no longer consumed.
  return { skipped: "disabled_v4.15.34", reason: "WEB_SCAN handles pricing server-side" };
  var startedMs = Date.now();
  var timer = _pricingWorkerTimer_(startedMs);
  var stats = {
    lastRunMs: startedMs,
    contractsProcessed: 0,
    unresolvedMarked: 0,
    sourceCounts: {},
    quotaUsed: _pricingWorkerQuotaUsed_(),
    durationMs: 0
  };

  try {
    if (!_pricingWorkerEnabled_()) {
      stats.skipped = "disabled";
      return stats;
    }
    if (!force) {
      var prev = _pricingWorkerPreviousStats_();
      var intervalMs = _pricingWorkerIntervalMin_() * 60000;
      if (prev && prev.lastRunMs && prev.skipped !== "quota_or_degraded" && (startedMs - Number(prev.lastRunMs)) < intervalMs) {
        stats.lastRunMs = Number(prev.lastRunMs);
        stats.contractsProcessed = prev.contractsProcessed || 0;
        stats.sourceCounts = prev.sourceCounts || {};
        stats.skipped = "interval_not_due";
        return stats;
      }
    }
    if (_pricingWorkerQuotaBlocked_()) {
      stats.skipped = "quota_or_degraded";
      return stats;
    }

    var configs = _pricingWorkerBuildConfigIndex_();
    var byChain = _pricingWorkerMergeSheetContracts_({}, force);
    var byChainKeys = Object.keys(byChain).filter(function(k) { return k.indexOf("__") !== 0; });
    var sheetOnlyMode = byChainKeys.length > 0 && _pricingWorkerHasContracts_(byChain);
    if (!sheetOnlyMode) {
      byChain = _pricingWorkerMergeSheetContracts_(_pricingWorkerActiveContracts_(force), force);
      sheetOnlyMode = false;
    }
    var priority = byChain.__priority || [];
    var priorityScores = byChain.__priorityScores || {};
    var contractPriority = byChain.__contractPriority || {};
    try { delete byChain.__priority; } catch (ePrioDel) {}
    try { delete byChain.__priorityScores; } catch (ePrioScoreDel) {}
    try { delete byChain.__contractPriority; } catch (eContractPrioDel) {}
    var chainIds = Object.keys(byChain).filter(function(k) { return _pricingWorkerChainHasContracts_(byChain, k); });
    if (priority.length) {
      var pMap = {};
      for (var pi = 0; pi < priority.length; pi++) pMap[priority[pi]] = pi + 1;
      chainIds.sort(function(a, b) {
        var sa = Number(priorityScores[a] || 0);
        var sb = Number(priorityScores[b] || 0);
        if (sa !== sb) return sb - sa;
        var pa = pMap[a] || 999999;
        var pb = pMap[b] || 999999;
        if (pa !== pb) return pa - pb;
        return 0;
      });
      var maxPriorityChains = Number(PRICING_WORKER_CONFIG.MAX_PRIORITY_CHAINS_PER_RUN || 1);
      if (!isFinite(maxPriorityChains) || maxPriorityChains < 1) maxPriorityChains = 1;
      chainIds = chainIds.slice(0, maxPriorityChains);
    }

    for (var c = 0; c < chainIds.length; c++) {
      if (timer.isLow(45000)) break;
      var chainId = chainIds[c];
      var cfg = configs[chainId] || _pricingWorkerResolveConfig_(chainId, configs);
      if (!cfg) continue;

      // v0.1.2: unpriced tokens first, priced ones last — guarantees the
      // GT-throttle budget and timer slice unpriced tokens before stale repriced.
      var _allC = Object.keys(byChain[chainId]);
      var _unpriced = [], _priced = [];
      for (var _ci = 0; _ci < _allC.length; _ci++) {
        if (byChain[chainId][_allC[_ci]]) _priced.push(_allC[_ci]);
        else _unpriced.push(_allC[_ci]);
      }
      var _cp = contractPriority[chainId] || {};
      _unpriced.sort(function(a, b) {
        var sa = Number(_cp[a] || 0);
        var sb = Number(_cp[b] || 0);
        if (sa !== sb) return sb - sa;
        return 0;
      });
      var contracts = sheetOnlyMode ? _unpriced.slice() : _unpriced.concat(_priced);
      var chunks = _pricingWorkerChunk_(contracts, PRICING_WORKER_CONFIG.CHUNK_SIZE);
      for (var ch = 0; ch < chunks.length; ch++) {
        if (timer.isLow(45000) || _pricingWorkerQuotaBlocked_()) break;
        var priced = _pricingWorkerCascadeChunk_(chunks[ch], timer, cfg, stats.sourceCounts);
        for (var addr in priced) {
          if (!priced.hasOwnProperty(addr)) continue;
          if (addr === "_unresolvedContracts") continue;
          var rec = priced[addr];
          if (!rec || !(Number(rec.priceUsd) > 0)) continue;
          if (GlobalPriceCache.savePrice) GlobalPriceCache.savePrice(chainId, addr, Number(rec.priceUsd), rec.source || "pricing-worker");
          else GlobalPriceCache.set(chainId, addr, Number(rec.priceUsd), rec.source || "pricing-worker");
          stats.contractsProcessed++;
        }
        var gtLimited = !!(priced && priced._rateLimited);
        var unresolved = (!gtLimited && priced._unresolvedContracts) ? priced._unresolvedContracts : [];
        for (var nm = 0; nm < unresolved.length; nm++) {
          var nmAddr = String(unresolved[nm] || "").toLowerCase();
          if (!nmAddr || byChain[chainId][nmAddr]) continue;
          if (_pricingWorkerMarkUnresolved_(chainId, nmAddr)) stats.unresolvedMarked++;
        }
      }
    }
  } catch (e) {
    stats.error = String(e.message || e).substring(0, 300);
  } finally {
    stats.quotaUsed = _pricingWorkerQuotaUsed_();
    stats.durationMs = Date.now() - startedMs;
    _pricingWorkerSaveStats_(stats);
    try { HttpCallCounter.clearTrigger(); } catch(e){}
  }

  try { Logger.log("[PRICING_WORKER] " + JSON.stringify(stats)); } catch (eLog) {}
  return stats;
}

function PRICING_WORKER_STATS() {
  try {
    var raw = _pricingWorkerProps_().getProperty(PRICING_WORKER_CONFIG.STATS_KEY);
    return raw ? JSON.parse(raw) : { lastRunMs: 0, contractsProcessed: 0, sourceCounts: {}, quotaUsed: _pricingWorkerQuotaUsed_(), durationMs: 0 };
  } catch (e) {
    return { lastRunMs: 0, contractsProcessed: 0, sourceCounts: {}, quotaUsed: _pricingWorkerQuotaUsed_(), durationMs: 0, error: String(e.message || e) };
  }
}

function DIAG_PRICING_WORKER_QUEUE() {
  var out = [["chainId", "priorityScore", "selected", "contracts"]];
  try {
    var force = true;
    var configs = _pricingWorkerBuildConfigIndex_();
    var byChain = _pricingWorkerMergeSheetContracts_(_pricingWorkerActiveContracts_(force), force);
    var priority = byChain.__priority || [];
    var priorityScores = byChain.__priorityScores || {};
    var contractPriority = byChain.__contractPriority || {};
    try { delete byChain.__priority; } catch (ePrioDel) {}
    try { delete byChain.__priorityScores; } catch (ePrioScoreDel) {}
    try { delete byChain.__contractPriority; } catch (eContractPrioDel) {}
    var chainIds = Object.keys(byChain).filter(function(k) { return _pricingWorkerChainHasContracts_(byChain, k); });
    var pMap = {};
    for (var pi = 0; pi < priority.length; pi++) pMap[priority[pi]] = pi + 1;
    chainIds.sort(function(a, b) {
      var sa = Number(priorityScores[a] || 0);
      var sb = Number(priorityScores[b] || 0);
      if (sa !== sb) return sb - sa;
      var pa = pMap[a] || 999999;
      var pb = pMap[b] || 999999;
      if (pa !== pb) return pa - pb;
      return 0;
    });
    var maxPriorityChains = Number(PRICING_WORKER_CONFIG.MAX_PRIORITY_CHAINS_PER_RUN || 1);
    if (!isFinite(maxPriorityChains) || maxPriorityChains < 1) maxPriorityChains = 1;
    var selectedMap = {};
    for (var si = 0; si < Math.min(maxPriorityChains, chainIds.length); si++) selectedMap[chainIds[si]] = true;
    for (var c = 0; c < chainIds.length; c++) {
      var chainId = chainIds[c];
      var cfg = configs[chainId] || _pricingWorkerResolveConfig_(chainId, configs);
      if (!cfg) continue;
      var _allC = Object.keys(byChain[chainId]);
      var _unpriced = [], _priced = [];
      for (var _ci = 0; _ci < _allC.length; _ci++) {
        if (byChain[chainId][_allC[_ci]]) _priced.push(_allC[_ci]);
        else _unpriced.push(_allC[_ci]);
      }
      var _cp = contractPriority[chainId] || {};
      _unpriced.sort(function(a, b) {
        var sa = Number(_cp[a] || 0);
        var sb = Number(_cp[b] || 0);
        if (sa !== sb) return sb - sa;
        return 0;
      });
      var contracts = _unpriced.concat(_priced);
      out.push([chainId, String(priorityScores[chainId] || 0), selectedMap[chainId] ? "YES" : "NO", contracts.slice(0, 15).join(",")]);
    }
  } catch (e) {
    out.push(["ERROR", String(e.message || e)]);
  }
  return out;
}

function DIAG_PRICING_WORKER_QUEUE_TOP() {
  var out = [["chainId", "priorityScore", "selected", "contracts"]];
  try {
    var force = true;
    var configs = _pricingWorkerBuildConfigIndex_();
    var byChain = _pricingWorkerMergeSheetContracts_(_pricingWorkerActiveContracts_(force), force);
    var priority = byChain.__priority || [];
    var priorityScores = byChain.__priorityScores || {};
    var contractPriority = byChain.__contractPriority || {};
    try { delete byChain.__priority; } catch (ePrioDel) {}
    try { delete byChain.__priorityScores; } catch (ePrioScoreDel) {}
    try { delete byChain.__contractPriority; } catch (eContractPrioDel) {}
    var chainIds = Object.keys(byChain);
    var pMap = {};
    for (var pi = 0; pi < priority.length; pi++) pMap[priority[pi]] = pi + 1;
    chainIds.sort(function(a, b) {
      var sa = Number(priorityScores[a] || 0);
      var sb = Number(priorityScores[b] || 0);
      if (sa !== sb) return sb - sa;
      var pa = pMap[a] || 999999;
      var pb = pMap[b] || 999999;
      if (pa !== pb) return pa - pb;
      return 0;
    });
    var maxPriorityChains = Number(PRICING_WORKER_CONFIG.MAX_PRIORITY_CHAINS_PER_RUN || 1);
    if (!isFinite(maxPriorityChains) || maxPriorityChains < 1) maxPriorityChains = 1;
    var selectedMap = {};
    for (var si = 0; si < Math.min(maxPriorityChains, chainIds.length); si++) selectedMap[chainIds[si]] = true;
    for (var c = 0; c < chainIds.length && c < 5; c++) {
      var chainId = chainIds[c];
      var cfg = configs[chainId] || _pricingWorkerResolveConfig_(chainId, configs);
      if (!cfg) continue;
      var _allC = Object.keys(byChain[chainId]);
      var _unpriced = [], _priced = [];
      for (var _ci = 0; _ci < _allC.length; _ci++) {
        if (byChain[chainId][_allC[_ci]]) _priced.push(_allC[_ci]);
        else _unpriced.push(_allC[_ci]);
      }
      var _cp = contractPriority[chainId] || {};
      _unpriced.sort(function(a, b) {
        var sa = Number(_cp[a] || 0);
        var sb = Number(_cp[b] || 0);
        if (sa !== sb) return sb - sa;
        return 0;
      });
      var contracts = _unpriced.concat(_priced);
      out.push([chainId, String(priorityScores[chainId] || 0), selectedMap[chainId] ? "YES" : "NO", contracts.slice(0, 8).join(",")]);
    }
  } catch (e) {
    out.push(["ERROR", String(e.message || e)]);
  }
  return out;
}

function DIAG_BASE_MISSING_GPC() {
  var contracts = [
    "0x560b0307ffe0efe72fe567f30faacc927a03d5f3", // LARHOC
    "0xba72b8e600145e8d254bd565241a935b130f0112", // WZRD
    "0x9f21cd392ebdb7c1c65e32ba9d1c7d541ec910c6", // MINT
    "0x0dfd116f3b94062de121836550559836efdfec4f", // BARAN
    "0x8b8c85c61d33a7f7df7661ea4e69a34502aafca3", // STRETCH
    "0xf37d0e4ea93aca7e0d3afa9df2a7774cf5bdd583", // JRA
    "0x26095fbf2a0f8332408198e7a89b7d54fae19bb7", // ZAY
    "0x6dcc9dba9b9bd0f4aa486b939df3a7d93d030b07", // BSNOW
    "0xae38dadd58b96926bf521162ebe948b132e29b07"  // ZECM
  ];
  var rows = [["contract", "gpc_usd", "gpc_src", "gpc_ts", "worker_eur", "priceMap_hit", "priceTs_hit"]];
  try {
    var cfg = (typeof _BASE !== "undefined" && _BASE && _BASE.getConfig) ? _BASE.getConfig() : null;
    var chainId = (typeof BaseEngine !== "undefined" && BaseEngine.getGlobalPriceChainId) ? BaseEngine.getGlobalPriceChainId(cfg) : "8453";
    var gpc = (typeof GlobalPriceCache !== "undefined" && GlobalPriceCache.load) ? GlobalPriceCache.load(null, cfg) : {};
    var pm = (gpc && gpc.priceMap) ? gpc.priceMap : {};
    var ptm = (gpc && gpc.priceTsMap) ? gpc.priceTsMap : {};
    var fx = 0.853;
    for (var i = 0; i < contracts.length; i++) {
      var c = String(contracts[i] || "").toLowerCase();
      var fresh = (typeof GlobalPriceCache !== "undefined" && GlobalPriceCache.getFresh) ? GlobalPriceCache.getFresh(chainId, c, 21600000) : null;
      var worker = (typeof BaseEngine !== "undefined" && BaseEngine.getWorkerCachedPriceEur) ? BaseEngine.getWorkerCachedPriceEur(cfg, c, fx, Date.now()) : null;
      rows.push([
        c,
        fresh && fresh.price != null ? String(fresh.price) : "",
        fresh && fresh.src ? String(fresh.src) : "",
        fresh && fresh.ts ? String(fresh.ts) : "",
        worker && worker.priceEur != null ? String(worker.priceEur) : "",
        pm[c] != null ? String(pm[c]) : "",
        ptm[c] != null ? String(ptm[c]) : ""
      ]);
    }
  } catch (e) {
    rows.push(["ERROR", String(e.message || e)]);
  }
  return rows;
}

function DIAG_PRICING_WORKER_SPREADSHEET_ACCESS() {
  var rows = [["step", "status", "details"]];
  try {
    try {
      var active = SpreadsheetApp.getActiveSpreadsheet();
      if (active) rows.push(["getActiveSpreadsheet", "OK", active.getId() + " | " + active.getName()]);
      else rows.push(["getActiveSpreadsheet", "NULL", "no active spreadsheet in this execution context"]);
    } catch (eActive) {
      rows.push(["getActiveSpreadsheet", "ERROR", String(eActive.message || eActive)]);
    }

    try {
      var opened = SpreadsheetApp.openById(PRICING_WORKER_SPREADSHEET_ID);
      if (opened) rows.push(["openById", "OK", opened.getId() + " | " + opened.getName()]);
      else rows.push(["openById", "NULL", "openById returned null"]);
    } catch (eOpen) {
      rows.push(["openById", "ERROR", String(eOpen.message || eOpen)]);
    }

    try {
      var resolved = _pricingWorkerGetSpreadsheet_();
      if (resolved) rows.push(["_pricingWorkerGetSpreadsheet_", "OK", resolved.getId() + " | " + resolved.getName()]);
      else rows.push(["_pricingWorkerGetSpreadsheet_", "NULL", "helper returned null"]);
    } catch (eHelper) {
      rows.push(["_pricingWorkerGetSpreadsheet_", "ERROR", String(eHelper.message || eHelper)]);
    }
  } catch (e) {
    rows.push(["DIAG_PRICING_WORKER_SPREADSHEET_ACCESS", "ERROR", String(e.message || e)]);
  }
  try { console.log("[DIAG_PRICING_WORKER_SPREADSHEET_ACCESS] " + JSON.stringify(rows)); } catch (eLog) {}
  return rows;
}

function DIAG_PRICING_WORKER_BLOCKERS() {
  var rows = [["check", "value", "details"]];
  try {
    var quotaBlocked = false;
    var quotaTripped = false;
    var quotaTestOnce = "";
    try {
      quotaBlocked = !!(typeof QuotaCircuitBreaker !== "undefined" && QuotaCircuitBreaker.isBlocked && QuotaCircuitBreaker.isBlocked());
      quotaTripped = !!(typeof QuotaCircuitBreaker !== "undefined" && QuotaCircuitBreaker.isTripped && QuotaCircuitBreaker.isTripped());
      if (quotaBlocked && typeof QuotaCircuitBreaker !== "undefined" && QuotaCircuitBreaker.testOnce) {
        quotaTestOnce = String(QuotaCircuitBreaker.testOnce());
      }
    } catch (eQuota) {
      rows.push(["QuotaCircuitBreaker", "ERROR", String(eQuota.message || eQuota)]);
    }
    rows.push(["QuotaCircuitBreaker.isBlocked", String(quotaBlocked), quotaTestOnce ? ("testOnce=" + quotaTestOnce) : ""]);
    rows.push(["QuotaCircuitBreaker.isTripped", String(quotaTripped), ""]);

    try {
      var degradedActive = !!(typeof DegradedMode !== "undefined" && DegradedMode.isActive && DegradedMode.isActive());
      rows.push(["DegradedMode.isActive", String(degradedActive), ""]);
    } catch (eDegA) {
      rows.push(["DegradedMode.isActive", "ERROR", String(eDegA.message || eDegA)]);
    }

    try {
      var degradedBreaker = !!(typeof DegradedMode !== "undefined" && DegradedMode.isCircuitBreakerActive && DegradedMode.isCircuitBreakerActive());
      rows.push(["DegradedMode.isCircuitBreakerActive", String(degradedBreaker), ""]);
    } catch (eDegB) {
      rows.push(["DegradedMode.isCircuitBreakerActive", "ERROR", String(eDegB.message || eDegB)]);
    }

    try {
      var httpMode = (typeof WcoreHttpMode !== "undefined" && WcoreHttpMode.getEffectiveMode) ? WcoreHttpMode.getEffectiveMode() : "";
      rows.push(["WcoreHttpMode.getEffectiveMode", String(httpMode || ""), ""]);
    } catch (eMode) {
      rows.push(["WcoreHttpMode.getEffectiveMode", "ERROR", String(eMode.message || eMode)]);
    }

    try {
      rows.push(["_pricingWorkerQuotaBlocked_", String(_pricingWorkerQuotaBlocked_()), ""]);
    } catch (ePW) {
      rows.push(["_pricingWorkerQuotaBlocked_", "ERROR", String(ePW.message || ePW)]);
    }
  } catch (e) {
    rows.push(["DIAG_PRICING_WORKER_BLOCKERS", "ERROR", String(e.message || e)]);
  }
  try { console.log("[DIAG_PRICING_WORKER_BLOCKERS] " + JSON.stringify(rows)); } catch (eLog) {}
  return rows;
}

function DIAG_PRICING_WORKER_BASE_MICROCAPS() {
  var rows = [["contract", "llama", "dex", "cmc", "gt", "gt_direct", "onchain", "gt_source", "gt_direct_source", "onchain_source"]];
  try {
    var contracts = [
      "0x0dfd116f3b94062de121836550559836efdfec4f", // BARAN
      "0xf37d0e4ea93aca7e0d3afa9df2a7774cf5bdd583", // JRA
      "0x26095fbf2a0f8332408198e7a89b7d54fae19bb7"  // ZAY
    ];
    var cfg = (typeof _BASE !== "undefined" && _BASE && _BASE.getConfig) ? _BASE.getConfig() : null;
    var timer = { isLow: function() { return false; }, isTimeUp: function() { return false; } };
    var llama = _pxTryLlamaCoins(contracts, timer, cfg) || {};
    var dex = _pxTryDexScreener(contracts, timer, cfg) || {};
    var cmc = _pxTryCmcDex(contracts, timer, cfg) || {};
    var gt = _pxTryGT(contracts, timer, cfg) || {};
    var gtDirect = _pricingWorkerGtDirectPoolFallback_(contracts, timer, cfg) || {};
    var onchain = _pxTryOnChainV3Worker(contracts, timer, cfg) || {};
    for (var i = 0; i < contracts.length; i++) {
      var c = String(contracts[i]).toLowerCase();
      rows.push([
        c,
        llama[c] && llama[c].priceUsd != null ? String(llama[c].priceUsd) : "",
        dex[c] && dex[c].priceUsd != null ? String(dex[c].priceUsd) : "",
        cmc[c] && cmc[c].priceUsd != null ? String(cmc[c].priceUsd) : "",
        gt[c] && gt[c].priceUsd != null ? String(gt[c].priceUsd) : "",
        gtDirect[c] && gtDirect[c].priceUsd != null ? String(gtDirect[c].priceUsd) : "",
        onchain[c] && onchain[c].priceUsd != null ? String(onchain[c].priceUsd) : "",
        gt[c] && gt[c].source ? String(gt[c].source) : "",
        gtDirect[c] && gtDirect[c].source ? String(gtDirect[c].source) : "",
        onchain[c] && onchain[c].source ? String(onchain[c].source) : ""
      ]);
    }
    if (gt && gt._rateLimited) rows.push(["GT_RATE_LIMITED", "true", "", "", "", "", "", ""]);
    if (gtDirect && gtDirect._rateLimited) rows.push(["GT_DIRECT_RATE_LIMITED", "true", "", "", "", "", "", ""]);
    if (cmc && cmc._rateLimited) rows.push(["CMC_RATE_LIMITED", "true", "", "", "", "", "", ""]);
    if (cmc && cmc._partial) rows.push(["CMC_PARTIAL", "true", "", "", "", "", "", ""]);
    if (onchain && onchain._partial) rows.push(["ONCHAIN_PARTIAL", "true", "", "", "", "", "", ""]);
  } catch (e) {
    rows.push(["ERROR", String(e.message || e), "", "", "", "", "", ""]);
  }
  try { console.log("[DIAG_PRICING_WORKER_BASE_MICROCAPS] " + JSON.stringify(rows)); } catch (eLog) {}
  return rows;
}

function DIAG_PRICING_WORKER_FIRST_CHAIN_FLOW() {
  var rows = [["step", "value", "details"]];
  try {
    var force = true;
    var configs = _pricingWorkerBuildConfigIndex_();
    var byChain = _pricingWorkerMergeSheetContracts_({}, force);
    var byChainKeys = Object.keys(byChain).filter(function(k) { return k.indexOf("__") !== 0; });
    var sheetOnlyMode = byChainKeys.length > 0 && _pricingWorkerHasContracts_(byChain);
    if (!sheetOnlyMode) {
      byChain = _pricingWorkerMergeSheetContracts_(_pricingWorkerActiveContracts_(force), force);
      sheetOnlyMode = false;
    }
    var priority = byChain.__priority || [];
    var priorityScores = byChain.__priorityScores || {};
    var contractPriority = byChain.__contractPriority || {};
    try { delete byChain.__priority; } catch (ePrioDel) {}
    try { delete byChain.__priorityScores; } catch (ePrioScoreDel) {}
    try { delete byChain.__contractPriority; } catch (eContractPrioDel) {}
    var chainIds = Object.keys(byChain);
    rows.push(["sheetOnlyMode", String(sheetOnlyMode), "chainCount=" + chainIds.length]);
    if (priority.length) {
      var pMap = {};
      for (var pi = 0; pi < priority.length; pi++) pMap[priority[pi]] = pi + 1;
      chainIds.sort(function(a, b) {
        var sa = Number(priorityScores[a] || 0);
        var sb = Number(priorityScores[b] || 0);
        if (sa !== sb) return sb - sa;
        var pa = pMap[a] || 999999;
        var pb = pMap[b] || 999999;
        if (pa !== pb) return pa - pb;
        return 0;
      });
      var maxPriorityChains = Number(PRICING_WORKER_CONFIG.MAX_PRIORITY_CHAINS_PER_RUN || 1);
      if (!isFinite(maxPriorityChains) || maxPriorityChains < 1) maxPriorityChains = 1;
      chainIds = chainIds.slice(0, maxPriorityChains);
    }
    rows.push(["selectedChains", chainIds.join(","), ""]);
    if (!chainIds.length) return rows;
    var chainId = chainIds[0];
    var cfg = configs[chainId] || _pricingWorkerResolveConfig_(chainId, configs);
    rows.push(["cfg", cfg ? "OK" : "NULL", chainId]);
    if (!cfg) return rows;

    var allContracts = Object.keys(byChain[chainId] || {});
    var unpriced = [], priced = [];
    for (var i = 0; i < allContracts.length; i++) {
      if (byChain[chainId][allContracts[i]]) priced.push(allContracts[i]);
      else unpriced.push(allContracts[i]);
    }
    var cp = contractPriority[chainId] || {};
    unpriced.sort(function(a, b) {
      var sa = Number(cp[a] || 0);
      var sb = Number(cp[b] || 0);
      if (sa !== sb) return sb - sa;
      return 0;
    });
    var contracts = sheetOnlyMode ? unpriced.slice() : unpriced.concat(priced);
    rows.push(["contracts", String(contracts.length), contracts.slice(0, 10).join(",")]);
    if (!contracts.length) return rows;

    var timer = { isLow: function() { return false; }, isTimeUp: function() { return false; } };
    var sourceCounts = {};
    var chunk = contracts.slice(0, Math.min(contracts.length, 10));
    var pricedMap = _pricingWorkerCascadeChunk_(chunk, timer, cfg, sourceCounts) || {};
    rows.push(["sourceCounts", JSON.stringify(sourceCounts), ""]);
    for (var k in pricedMap) {
      if (!pricedMap.hasOwnProperty(k)) continue;
      rows.push(["priced", k, JSON.stringify(pricedMap[k])]);
    }
    rows.push(["quotaBlockedAfter", String(_pricingWorkerQuotaBlocked_()), ""]);
  } catch (e) {
    rows.push(["ERROR", String(e.message || e), ""]);
  }
  try { console.log("[DIAG_PRICING_WORKER_FIRST_CHAIN_FLOW] " + JSON.stringify(rows)); } catch (eLog) {}
  return rows;
}

function RUN_PRICING_WORKER_FORCE() {
  return _runPricingWorker(true);
}

function INSTALL_PRICING_WORKER_TRIGGER() {
  var props = _pricingWorkerProps_();
  UNINSTALL_PRICING_WORKER_TRIGGER();

  var intervalMin = _pricingWorkerIntervalMin_();
  var triggerMin = 30;
  if (intervalMin <= 1) triggerMin = 1;
  else if (intervalMin <= 5) triggerMin = 5;
  else if (intervalMin <= 10) triggerMin = 10;
  else if (intervalMin <= 15) triggerMin = 15;

  var trigger = ScriptApp.newTrigger("_runPricingWorker")
    .timeBased()
    .everyMinutes(triggerMin)
    .create();

  try {
    if (trigger && trigger.getUniqueId) props.setProperty(PRICING_WORKER_CONFIG.TRIGGER_ID_KEY, trigger.getUniqueId());
  } catch (e) {}

  return "PRICING_WORKER trigger installed every " + triggerMin + " min; worker interval gate=" + intervalMin + " min";
}

function UNINSTALL_PRICING_WORKER_TRIGGER() {
  var props = _pricingWorkerProps_();
  var targetId = "";
  try { targetId = props.getProperty(PRICING_WORKER_CONFIG.TRIGGER_ID_KEY) || ""; } catch (eId) {}

  var removed = 0;
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    var t = triggers[i];
    var match = false;
    try {
      match = t.getHandlerFunction && t.getHandlerFunction() === "_runPricingWorker";
      if (!match && targetId && t.getUniqueId && t.getUniqueId() === targetId) match = true;
    } catch (e) {}
    if (match) {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  }

  try { props.deleteProperty(PRICING_WORKER_CONFIG.TRIGGER_ID_KEY); } catch (eDel) {}
  return "PRICING_WORKER triggers removed: " + removed;
}
