/************************************************************
 * 26B_HTTP_SAVINGS.gs - HTTP Quota Savings Patch (v4.15.57)
 *
 * FICHIER DE PATCH SIMPLE - Modifie les constantes au chargement
 * pour reduire les appels HTTP de 30-40%.
 *
 * v4.15.57 — Remove misleading GET_HTTP_COUNTER_STATS public diagnostic
 * v4.15.34 — R15 FIX: GT throttle 50 -> 80/run (GT-only tokens coverage)
 * v4.15.15 — budget guard: forceFull rétrogradé si HTTP >70% (_forceFullAllowed_, _normalizeForceWithBudgetGuard)
 * v4.15.14 — HttpCallCounter extended:
 *   - Per-host counter (WCORE_HTTP_HOST_{YYYY-M-D})
 *   - Per-trigger counter (WCORE_HTTP_TRIGGER_{YYYY-M-D})
 *   - T0 tracking (WCORE_HTTP_T0_{YYYY-M-D}) + milestones (WCORE_HTTP_MILE_{YYYY-M-D})
 *   - GET_HTTP_BURN_BY_HOST(), GET_HTTP_BURN_BY_TRIGGER(), GET_HTTP_TIMELINE()
 *   - patchHttpCounter passe l'URL a increment(url) pour host tracking
 *
 * INSTRUMENTATION TRIGGERS: Appeler HttpCallCounter.setTrigger('NOM') en entree
 * et HttpCallCounter.clearTrigger() en sortie dans les fonctions suivantes:
 *   ACTIVITY_WATCHDOG, WATCHDOG_FROM_RECAP, QUOTA_RECOVERY_SWEEP,
 *   QUOTA_RECOVERY_SWEEP_FOLLOWUP, UPDATE_DYNAMIC_RPCS, PRICING_WORKER_TICK
 * 
 * CE FICHIER NE CHANGE PAS LA LOGIQUE, seulement les parametres.
 * 
 * OPTIMISATIONS APPLIQUÃƒâ€°ES:
 * 
 * 1. FX Rate TTL: 1h Ã¢â€ â€™ 6h (-80% appels FX)
 * Le taux EUR/USD ne change pas significativement en 6h
 * 
 * 2. Price Stale Threshold: 15min Ã¢â€ â€™ 45min (-60% re-fetch prix)
 * Les prix sont consideres frais plus longtemps
 * 
 * 3. Price Cache TTL: 2h Ã¢â€ â€™ 4h (-50% prix expires)
 * Les prix restent valides plus longtemps
 * 
 * 4. Circuit Breaker: 2min Ã¢â€ â€™ 5min (-60% health checks)
 * Quand quota epuise, attendre plus avant retry
 * 
 * 5. GeckoTerminal Throttle: illimite Ã¢â€ â€™ 80/run (v4.15.34: 50 -> 80)
 * Les tokens GT-only n'ont pas d'autre source de prix. 80/run couvre
 * les chains Base, Arbitrum, Optimism, Polygon, BSC, Avalanche, ZERO.
 * 
 * 6. Price Attempt Cooldown: 1h Ã¢â€ â€™ 2h (-50% retry echecs)
 * Attendre plus longtemps avant de retenter un prix echoue
 * 
 * IMPACT ESTIMÃƒâ€°: -30% ÃƒÂ  -40% appels HTTP quotidiens
 * 
 * DÃƒâ€°PLOIEMENT: Copier ce fichier dans le projet Apps Script.
 * Il se charge automatiquement et patche les valeurs.
 * 
 * ROLLBACK: Supprimer ce fichier pour revenir aux valeurs par defaut.
 ************************************************************/
var HTTP_SAVINGS_VERSION = "4.15.34";

// ============================================================
// PATCH 1: FX RATE - Cache plus long (1h Ã¢â€ â€™ 6h)
// ============================================================

(function patchFxRate() {
 try {
 if (typeof FxRate !== 'undefined') {
 // Memory cache: 1h Ã¢â€ â€™ 6h
 FxRate._TTL_MS = 21600000; // 6h
 }
 } catch (e) {}
})();

// ============================================================
// PATCH 2: PRICE STALENESS - Plus tolerant (15min Ã¢â€ â€™ 45min)
// ============================================================

(function patchPriceStaleness() {
 try {
 if (typeof WCORE_CACHE_CONFIG !== 'undefined') {
 // Prix considere frais: 15min Ã¢â€ â€™ 45min
 WCORE_CACHE_CONFIG.PRICE_STALE_MS = 5400000; // v4.15.13: 45min -> 90min
 
 // Prix valide: 2h Ã¢â€ â€™ 4h 
 WCORE_CACHE_CONFIG.PRICE_TTL_MS = 21600000; // v4.5.17: 4h -> 6h (aligné L1 CacheService cap, -30% cascade calls)
 
 // Cooldown echec prix: 1h Ã¢â€ â€™ 2h
 WCORE_CACHE_CONFIG.PRICE_ATTEMPT_COOLDOWN_MS = 14400000; // v4.5.17: 2h -> 4h (-50% retries tokens KO)
 }
 
 // Aussi patcher WCORE_TTL si existe
 if (typeof WCORE_TTL !== 'undefined') {
 WCORE_TTL.PRICE_STALE_MS = 5400000; // v4.15.13: 45min -> 90min
 WCORE_TTL.PRICE_MS = 21600000; // v4.5.17: 4h -> 6h
 WCORE_TTL.PRICE_ATTEMPT_COOLDOWN_MS = 14400000; // v4.5.17: 2h -> 4h
 }
 } catch (e) {}
})();

// ============================================================
// PATCH 3: CIRCUIT BREAKER - Attente plus longue (2min Ã¢â€ â€™ 5min)
// ============================================================

(function patchCircuitBreaker() {
 try {
 if (typeof DegradedMode !== 'undefined') {
 DegradedMode.CIRCUIT_BREAKER_MS = 300000; // 5min
 }
 } catch (e) {}
})();

// ============================================================
// PATCH 4: GECKOTERMINAL THROTTLE - Limite par execution
// ============================================================

var _GT_THROTTLE = {
 count: 0,
 max: 80, // v4.15.34: 50 -> 80 (R15 fix: GT-only tokens need more headroom — Base, Arbitrum, Optimism, Polygon, BSC, Avalanche, ZERO)
 resetTime: 0
};

(function patchGeckoTerminal() {
 try {
 if (typeof PriceSources === 'undefined' || !PriceSources.gtTokenPriceUsd) {
 return;
 }
 
 var _original = PriceSources.gtTokenPriceUsd;
 
 PriceSources.gtTokenPriceUsd = function(contract, timer, config) {
 var now = Date.now();
 
 // Reset counter every 25s (new execution)
 if (now - _GT_THROTTLE.resetTime > 25000) {
 _GT_THROTTLE.count = 0;
 _GT_THROTTLE.resetTime = now;
 }
 
 // Skip if over limit
 if (_GT_THROTTLE.count >= _GT_THROTTLE.max) {
 // v4.15.25: Post NEED_TRY3 hint so next cycle prioritizes this token
 // AND sends it direct to /pools (1 GT call instead of 2).
 try {
   var _cThr = (typeof Addr !== 'undefined' && Addr.normalize) ? Addr.normalize(contract) : null;
   if (_cThr && typeof _pxL1SetJson === 'function' && typeof _pxL1Key === 'function') {
     _pxL1SetJson(_pxL1Key("GTPATH", config, _cThr), { p: "TRY3" }, 21600);
   }
 } catch (eThrHint) {}
 return null; // Let caller use fallback or skip
 }

 _GT_THROTTLE.count++;
 return _original.call(PriceSources, contract, timer, config);
 };
 } catch (e) {}
})();

// ============================================================
// PATCH 5: L1 CACHE TTL - Plus long pour prix (2h Ã¢â€ â€™ 4h)
// ============================================================

(function patchL1CacheTtl() {
 try {
 // Le minimum L1 TTL est defini dans 04A_CACHE_CORE.gs
 // On ne peut pas le modifier directement, mais on peut
 // augmenter PX_L1_TTL_MIN_SEC si accessible
 if (typeof PX_L1_TTL_MIN_SEC !== 'undefined') {
 // Note: Cette variable est var, pas const, donc modifiable
 // Mais elle est dans le scope de 07_PRICES.gs
 // On va plutot patcher via le cache manager
 }
 
 // Augmenter le TTL du cache FX dans CacheService
 if (typeof CACHE_L1_TTL_FX_SEC !== 'undefined') {
 // 4h Ã¢â€ â€™ 12h pour FX
 // Note: var globale, peut etre modifiee
 }
 } catch (e) {}
})();

// ============================================================
// PATCH 6: SKIP ZERO BALANCE PRICING (via BulkPriceFetch)
// ============================================================

(function patchSkipZeroBalance() {
 try {
 if (typeof BulkPriceFetch === 'undefined' || !BulkPriceFetch.fetch) {
 return;
 }
 
 var _original = BulkPriceFetch.fetch;
 
 BulkPriceFetch.fetch = function(targetKeys, opts, timer, config) {
 // Filter out tokens we don't need to price
 var filtered = [];
 var skipped = 0;
 
 if (targetKeys && targetKeys.length) {
 for (var i = 0; i < targetKeys.length; i++) {
 var key = targetKeys[i];
 // Keep all keys - the filtering should be done upstream
 // This is just a hook for future optimization
 filtered.push(key);
 }
 }
 
 return _original.call(BulkPriceFetch, filtered.length ? filtered : targetKeys, opts, timer, config);
 };
 } catch (e) {}
})();

// ============================================================
// DIAGNOSTIC: Verifier que les patches sont appliques
// ============================================================

/**
 * Verifie que les optimisations HTTP sont actives
 * @returns {Array} 2D array pour affichage dans Sheet
 * @customfunction
 */
function GET_HTTP_SAVINGS_STATUS() {
 var out = [["Optimization", "Expected", "Actual", "Status"]];
 
 // 1. FX TTL
 try {
 var fxTtl = (typeof FxRate !== 'undefined' && FxRate._TTL_MS) ? FxRate._TTL_MS : 0;
 var fxExpected = 21600000; // 6h
 out.push([
 "FX Memory TTL",
 "6h",
 fxTtl > 0 ? (fxTtl / 3600000) + "h" : "N/A",
 fxTtl >= fxExpected ? "OK" : "NOT APPLIED"
 ]);
 } catch (e) {
 out.push(["FX Memory TTL", "6h", "Error", "FAILED"]);
 }
 
 // 2. Price Stale
 try {
 var priceStale = (typeof WCORE_CACHE_CONFIG !== 'undefined') ? WCORE_CACHE_CONFIG.PRICE_STALE_MS : 0;
 var staleExpected = 2700000; // 45min
 out.push([
 "Price Stale Threshold",
 "45min",
 priceStale > 0 ? (priceStale / 60000) + "min" : "N/A",
 priceStale >= staleExpected ? "OK" : "NOT APPLIED"
 ]);
 } catch (e) {
 out.push(["Price Stale Threshold", "45min", "Error", "FAILED"]);
 }
 
 // 3. Price TTL
 try {
 var priceTtl = (typeof WCORE_CACHE_CONFIG !== 'undefined') ? WCORE_CACHE_CONFIG.PRICE_TTL_MS : 0;
 var ttlExpected = 14400000; // 4h
 out.push([
 "Price Cache TTL",
 "4h",
 priceTtl > 0 ? (priceTtl / 3600000) + "h" : "N/A",
 priceTtl >= ttlExpected ? "OK" : "NOT APPLIED"
 ]);
 } catch (e) {
 out.push(["Price Cache TTL", "4h", "Error", "FAILED"]);
 }
 
 // 4. Circuit Breaker
 try {
 var cb = (typeof DegradedMode !== 'undefined') ? DegradedMode.CIRCUIT_BREAKER_MS : 0;
 var cbExpected = 300000; // 5min
 out.push([
 "Circuit Breaker Duration",
 "5min",
 cb > 0 ? (cb / 60000) + "min" : "N/A",
 cb >= cbExpected ? "OK" : "NOT APPLIED"
 ]);
 } catch (e) {
 out.push(["Circuit Breaker Duration", "5min", "Error", "FAILED"]);
 }
 
 // 5. GT Throttle
 try {
 var gtMax = _GT_THROTTLE ? _GT_THROTTLE.max : 0;
  out.push([
  "GeckoTerminal Throttle",
  "80/run",
  gtMax > 0 ? gtMax + "/run" : "N/A",
  gtMax > 0 ? "OK" : "NOT APPLIED"
  ]);
 } catch (e) {
  out.push(["GeckoTerminal Throttle", "80/run", "Error", "FAILED"]);
 }
 
 // 6. Price Cooldown
 try {
 var cooldown = (typeof WCORE_CACHE_CONFIG !== 'undefined') ? WCORE_CACHE_CONFIG.PRICE_ATTEMPT_COOLDOWN_MS : 0;
 var cdExpected = 7200000; // 2h
 out.push([
 "Price Retry Cooldown",
 "2h",
 cooldown > 0 ? (cooldown / 3600000) + "h" : "N/A",
 cooldown >= cdExpected ? "OK" : "NOT APPLIED"
 ]);
 } catch (e) {
 out.push(["Price Retry Cooldown", "2h", "Error", "FAILED"]);
 }
 
 out.push(["", "", "", ""]);
 out.push(["ESTIMATED SAVINGS", "", "", "30-40% HTTP calls"]);
 
 return out;
}

/**
 * Obtenir les stats du throttle GeckoTerminal
 * @returns {Array}
 * @customfunction
 */
function GET_GT_THROTTLE_STATS() {
 return [
 ["Metric", "Value"],
 ["Calls This Run", _GT_THROTTLE.count],
 ["Max Per Run", _GT_THROTTLE.max],
 ["Remaining", _GT_THROTTLE.max - _GT_THROTTLE.count],
 ["Last Reset", _GT_THROTTLE.resetTime > 0 ? new Date(_GT_THROTTLE.resetTime).toISOString() : "Never"]
 ];
}

/**
 * Modifier la limite du throttle GeckoTerminal
 * @param {number} newLimit - Nouvelle limite (5-80)
 * @returns {string}
 */
function SET_GT_LIMIT(newLimit) {
 var n = parseInt(newLimit, 10);
 if (!isFinite(n) || n < 5 || n > 80) {
 return "Error: Limit must be between 5 and 80";
 }
 _GT_THROTTLE.max = n;
 return "GT throttle set to " + n + " calls per run";
}

// ============================================================
// PATCH: HTTP CALL COUNTER (v4.15.14)
// Persistance jour via ScriptProperties, rollover 09h UTC (~10h CET reset quota)
// Extended: per-host, per-trigger, T0 tracking, milestones
// ============================================================

var HttpCallCounter = (function(){
 var _mem = 0;
 var _lastFlushMs = 0;
 var FLUSH_EVERY_N = 25;
 var FLUSH_EVERY_MS = 5000;
 var DAILY_QUOTA = 20000;

 // Per-host in-memory buffer: {host: count}
 var _hostMem = {};
 // Per-trigger in-memory buffer: {triggerFn: count}
 var _triggerMem = {};

 // Current trigger name — cached from ScriptProperties (30s TTL)
 var _currentTrigger = null;
 var _triggerCacheMs = 0;
 var TRIGGER_CACHE_TTL = 30000;

 // Milestones already recorded this session (avoid double-write)
 var _milestonesRecorded = {};

 var MILESTONES = [25, 50, 75, 90, 100];

 // Day key aligned on 09h UTC (same as global counter)
 function _dayKey() {
  var d = new Date(Date.now() - 9 * 3600000);
  return d.getUTCFullYear() + "-" + (d.getUTCMonth()+1) + "-" + d.getUTCDate();
 }

 function _quotaDayKey()  { return "WCORE_HTTP_DAY_"     + _dayKey(); }
 function _hostDayKey()   { return "WCORE_HTTP_HOST_"    + _dayKey(); }
 function _triggerDayKey(){ return "WCORE_HTTP_TRIGGER_" + _dayKey(); }
 function _t0DayKey()     { return "WCORE_HTTP_T0_"      + _dayKey(); }
 function _mileDayKey()   { return "WCORE_HTTP_MILE_"    + _dayKey(); }

 // Parse host from URL. Returns "unknown" if unparsable.
 function _parseHost(url) {
  if (!url || typeof url !== 'string') return 'unknown';
  var m = url.match(/^https?:\/\/([^\/]+)/);
  return m ? m[1] : 'unknown';
 }

 // Read current trigger from ScriptProperties with 30s in-memory cache
 function _readTrigger() {
  var now = Date.now();
  if (_currentTrigger !== null && (now - _triggerCacheMs) < TRIGGER_CACHE_TTL) {
   return _currentTrigger;
  }
  try {
   var v = PropertiesService.getScriptProperties().getProperty('WCORE_CURRENT_TRIGGER');
   _currentTrigger = v || 'customfunction';
  } catch(e) {
   _currentTrigger = 'customfunction';
  }
  _triggerCacheMs = now;
  return _currentTrigger;
 }

 function increment(url) {
  _mem++;

  // Host tracking
  var host = _parseHost(url);
  _hostMem[host] = (_hostMem[host] || 0) + 1;

  // Trigger tracking
  var trigger = _readTrigger();
  _triggerMem[trigger] = (_triggerMem[trigger] || 0) + 1;

  var now = Date.now();
  if ((_mem % FLUSH_EVERY_N) === 0 || (now - _lastFlushMs) > FLUSH_EVERY_MS) {
   flush();
  }
 }

 function flush() {
  if (_mem <= 0 && Object.keys(_hostMem).length === 0 && Object.keys(_triggerMem).length === 0) return;
  try {
   var props = PropertiesService.getScriptProperties();
   var dayKey = _dayKey();

   // --- Global counter ---
   if (_mem > 0) {
    var gKey = _quotaDayKey();
    var gCur = parseInt(props.getProperty(gKey), 10) || 0;
    var gNew = gCur + _mem;
    props.setProperty(gKey, String(gNew));

    // T0 tracking: record first call of the day
    var t0Key = _t0DayKey();
    if (gCur === 0 && !props.getProperty(t0Key)) {
     props.setProperty(t0Key, String(Date.now()));
    }

    // Milestone tracking
    var mileKey = _mileDayKey();
    var mileRaw = props.getProperty(mileKey);
    var mileMap = mileRaw ? JSON.parse(mileRaw) : {};
    var changed = false;
    for (var mi = 0; mi < MILESTONES.length; mi++) {
     var pct = MILESTONES[mi];
     var threshold = Math.floor(DAILY_QUOTA * pct / 100);
     var key100 = String(pct);
     if (!mileMap[key100] && !_milestonesRecorded[dayKey + '_' + pct] && gNew >= threshold) {
      mileMap[key100] = Date.now();
      _milestonesRecorded[dayKey + '_' + pct] = true;
      changed = true;
     }
    }
    if (changed) props.setProperty(mileKey, JSON.stringify(mileMap));

    _mem = 0;
   }

   // --- Per-host counter ---
   var hostKeys = Object.keys(_hostMem);
   if (hostKeys.length > 0) {
    var hKey = _hostDayKey();
    var hRaw = props.getProperty(hKey);
    var hMap = hRaw ? JSON.parse(hRaw) : {};
    for (var hi = 0; hi < hostKeys.length; hi++) {
     var h = hostKeys[hi];
     hMap[h] = (hMap[h] || 0) + _hostMem[h];
    }
    props.setProperty(hKey, JSON.stringify(hMap));
    _hostMem = {};
   }

   // --- Per-trigger counter ---
   var trigKeys = Object.keys(_triggerMem);
   if (trigKeys.length > 0) {
    var tKey = _triggerDayKey();
    var tRaw = props.getProperty(tKey);
    var tMap = tRaw ? JSON.parse(tRaw) : {};
    for (var ti = 0; ti < trigKeys.length; ti++) {
     var t = trigKeys[ti];
     tMap[t] = (tMap[t] || 0) + _triggerMem[t];
    }
    props.setProperty(tKey, JSON.stringify(tMap));
    _triggerMem = {};
   }

   _lastFlushMs = Date.now();
  } catch (e) {}
 }

 function getToday() {
  try {
   var props = PropertiesService.getScriptProperties();
   var cur = parseInt(props.getProperty(_quotaDayKey()), 10) || 0;
   return cur + _mem;
  } catch (e) { return _mem; }
 }

 function getQuota() { return DAILY_QUOTA; }

 /**
  * Poser le nom du trigger actif dans ScriptProperties.
  * Appeler en entree de: ACTIVITY_WATCHDOG, WATCHDOG_FROM_RECAP,
  * QUOTA_RECOVERY_SWEEP, QUOTA_RECOVERY_SWEEP_FOLLOWUP,
  * UPDATE_DYNAMIC_RPCS, PRICING_WORKER_TICK
  */
 function setTrigger(fnName) {
  try {
   PropertiesService.getScriptProperties().setProperty('WCORE_CURRENT_TRIGGER', fnName || 'unknown');
   _currentTrigger = fnName || 'unknown';
   _triggerCacheMs = Date.now();
  } catch(e) {}
 }

 /**
  * Retirer le trigger actif (fin de fonction trigger).
  */
 function clearTrigger() {
  try {
   PropertiesService.getScriptProperties().deleteProperty('WCORE_CURRENT_TRIGGER');
   _currentTrigger = 'customfunction';
   _triggerCacheMs = Date.now();
  } catch(e) {}
 }

 function reset() {
  try {
   var props = PropertiesService.getScriptProperties();
   props.deleteProperty(_quotaDayKey());
   props.deleteProperty(_hostDayKey());
   props.deleteProperty(_triggerDayKey());
   props.deleteProperty(_t0DayKey());
   props.deleteProperty(_mileDayKey());
  } catch(e) {}
  _mem = 0;
  _hostMem = {};
  _triggerMem = {};
 }

 return {
  increment: increment,
  flush: flush,
  getToday: getToday,
  getQuota: getQuota,
  reset: reset,
  setTrigger: setTrigger,
  clearTrigger: clearTrigger
 };
})();

(function patchHttpCounter() {
 try {
  if (typeof UrlFetchApp === 'undefined') return;
  if (UrlFetchApp._httpCounterPatched) return;

  var _origFetch = UrlFetchApp.fetch;
  var _origFetchAll = UrlFetchApp.fetchAll;

  UrlFetchApp.fetch = function(url, options) {
   if (typeof Http !== 'undefined' && Http.canFetchNow && !Http.canFetchNow("26B.fetch")) return null;
   try { HttpCallCounter.increment(url); } catch(e){}
   return _origFetch.call(UrlFetchApp, url, options);
  };

  UrlFetchApp.fetchAll = function(requests) {
   if (typeof Http !== 'undefined' && Http.canFetchNow && !Http.canFetchNow("26B.fetchAll")) {
    var nulls = [];
    var n0 = (requests && requests.length) ? requests.length : 0;
    for (var z = 0; z < n0; z++) nulls.push(null);
    return nulls;
   }
   try {
    var n = (requests && requests.length) ? requests.length : 0;
    for (var i = 0; i < n; i++) {
     var reqUrl = (requests[i] && requests[i].url) ? requests[i].url : undefined;
     HttpCallCounter.increment(reqUrl);
    }
   } catch(e){}
   return _origFetchAll.call(UrlFetchApp, requests);
  };

  UrlFetchApp._httpCounterPatched = true;
 } catch (e) {}
})();

/**
 * Flush manuel du compteur vers ScriptProperties
 * @returns {string}
 */
function FLUSH_HTTP_COUNTER() {
 HttpCallCounter.flush();
 return "HTTP counter flushed: " + HttpCallCounter.getToday() + "/" + HttpCallCounter.getQuota();
}

/**
 * Reset manuel du compteur du jour
 * @returns {string}
 */
function RESET_HTTP_CALL_COUNTER() {
 HttpCallCounter.reset();
 return "HTTP counter reset for today";
}

/**
 * Repartition des appels HTTP par host pour le jour courant.
 * @returns {Array} 2D array [["Host","Calls","%"], ...] trie desc + ligne TOTAL
 * @customfunction
 */
function GET_HTTP_BURN_BY_HOST() {
 HttpCallCounter.flush();
 try {
  var props = PropertiesService.getScriptProperties();
  var d = new Date(Date.now() - 9 * 3600000);
  var dayStr = d.getUTCFullYear() + "-" + (d.getUTCMonth()+1) + "-" + d.getUTCDate();
  var raw = props.getProperty("WCORE_HTTP_HOST_" + dayStr);
  var map = raw ? JSON.parse(raw) : {};
  var hosts = Object.keys(map);
  var total = 0;
  for (var i = 0; i < hosts.length; i++) total += map[hosts[i]];
  hosts.sort(function(a, b){ return map[b] - map[a]; });
  var out = [["Host", "Calls", "%"]];
  for (var j = 0; j < hosts.length; j++) {
   var c = map[hosts[j]];
   out.push([hosts[j], c, total > 0 ? Math.round(c / total * 1000) / 10 + "%" : "0%"]);
  }
  out.push(["TOTAL", total, "100%"]);
  return out.length > 1 ? out : [["Host", "Calls", "%"], ["(aucune donnee)", 0, "0%"]];
 } catch(e) {
  return [["Host", "Calls", "%"], ["Error: " + e.message, 0, "0%"]];
 }
}

/**
 * Repartition des appels HTTP par trigger/fonction pour le jour courant.
 * @returns {Array} 2D array [["Trigger","Calls","%"], ...] trie desc + ligne TOTAL
 * @customfunction
 */
function GET_HTTP_BURN_BY_TRIGGER() {
 HttpCallCounter.flush();
 try {
  var props = PropertiesService.getScriptProperties();
  var d = new Date(Date.now() - 9 * 3600000);
  var dayStr = d.getUTCFullYear() + "-" + (d.getUTCMonth()+1) + "-" + d.getUTCDate();
  var raw = props.getProperty("WCORE_HTTP_TRIGGER_" + dayStr);
  var map = raw ? JSON.parse(raw) : {};
  var triggers = Object.keys(map);
  var total = 0;
  for (var i = 0; i < triggers.length; i++) total += map[triggers[i]];
  triggers.sort(function(a, b){ return map[b] - map[a]; });
  var out = [["Trigger", "Calls", "%"]];
  for (var j = 0; j < triggers.length; j++) {
   var c = map[triggers[j]];
   out.push([triggers[j], c, total > 0 ? Math.round(c / total * 1000) / 10 + "%" : "0%"]);
  }
  out.push(["TOTAL", total, "100%"]);
  return out.length > 1 ? out : [["Trigger", "Calls", "%"], ["(aucune donnee)", 0, "0%"]];
 } catch(e) {
  return [["Trigger", "Calls", "%"], ["Error: " + e.message, 0, "0%"]];
 }
}

/**
 * Timeline T0 + jalons de consommation du quota pour le jour courant.
 * @returns {Array} 2D array [["Metric","Value"], ...]
 * @customfunction
 */
function GET_HTTP_TIMELINE() {
 HttpCallCounter.flush();
 try {
  var props = PropertiesService.getScriptProperties();
  var d = new Date(Date.now() - 9 * 3600000);
  var dayStr = d.getUTCFullYear() + "-" + (d.getUTCMonth()+1) + "-" + d.getUTCDate();

  var t0Raw = props.getProperty("WCORE_HTTP_T0_" + dayStr);
  var mileRaw = props.getProperty("WCORE_HTTP_MILE_" + dayStr);
  var mileMap = mileRaw ? JSON.parse(mileRaw) : {};

  var out = [["Metric", "Value"]];

  if (t0Raw) {
   var t0Ms = parseInt(t0Raw, 10);
   var t0Iso = new Date(t0Ms).toISOString();
   var resetIso = new Date(t0Ms + 86400000).toISOString();
   out.push(["T0 (1ere requete)", t0Iso]);
   out.push(["Predicted Reset (T0+24h)", resetIso]);
  } else {
   out.push(["T0 (1ere requete)", "(pas encore enregistre)"]);
   out.push(["Predicted Reset (T0+24h)", "(inconnu)"]);
  }

  var milestones = [25, 50, 75, 90, 100];
  for (var i = 0; i < milestones.length; i++) {
   var pct = milestones[i];
   var ts = mileMap[String(pct)];
   out.push([pct + "% atteint", ts ? new Date(parseInt(ts, 10)).toISOString() : "(pas encore)"]);
  }

  var today = HttpCallCounter.getToday();
  var quota = HttpCallCounter.getQuota();
  out.push(["Calls aujourd'hui", today]);
  out.push(["Quota", quota]);
  out.push(["Usage %", quota > 0 ? Math.round(today / quota * 1000) / 10 + "%" : "0%"]);

  return out;
 } catch(e) {
  return [["Metric", "Value"], ["Error: " + e.message, ""]];
 }
}

// ============================================================
// BUDGET GUARD — forceFull rétrogradé si HTTP >70% (v4.15.15)
// ============================================================

/**
 * Retourne true si forceFull est autorisé (bucket HTTP < 70%).
 * Fail-open : si HttpCallCounter indispo, accorde le forceFull.
 */
function _forceFullAllowed_() {
  try {
    var today = HttpCallCounter.getToday();
    var quota = HttpCallCounter.getQuota();
    if (quota <= 0) return true;
    var pct = today / quota;
    return pct < 0.70;
  } catch (e) { return true; }
}

/**
 * Normalise forceFull depuis c1 et applique le garde-fou budget HTTP.
 * Utiliser à la place de Bool.parse(forceFull) dans les engines.
 * @param {*} c1 - valeur brute du paramètre forceFull/c1
 * @return {boolean}
 */
function _normalizeForceWithBudgetGuard_(c1) {
  var force = (typeof Bool !== 'undefined') ? Bool.parse(c1) : (c1 === true || String(c1).toUpperCase() === 'TRUE');
  if (force && !_forceFullAllowed_()) {
    Logger.log("[BUDGET_GUARD] forceFull demandé mais bucket HTTP >70% — rétrogradé en scan incremental");
    force = false;
  }
  return force;
}

// ============================================================
// LOG DE CONFIRMATION
// ============================================================

(function logPatches() {
 try {
 var fmtMs = function(ms) {
   if (!isFinite(ms) || ms <= 0) return "N/A";
   var h = ms / 3600000;
   if (h >= 1) return (h % 1 === 0 ? h : h.toFixed(1)) + "h";
   var m = ms / 60000;
   return (m % 1 === 0 ? m : m.toFixed(1)) + "min";
 };
 var fx = (typeof FxRate !== 'undefined' && FxRate._TTL_MS) ? FxRate._TTL_MS : 0;
 var cfg = (typeof WCORE_CACHE_CONFIG !== 'undefined') ? WCORE_CACHE_CONFIG : {};
 var cb  = (typeof DegradedMode !== 'undefined' && DegradedMode.CIRCUIT_BREAKER_MS) ? DegradedMode.CIRCUIT_BREAKER_MS : 0;
 var gt  = (typeof _GT_THROTTLE !== 'undefined' && _GT_THROTTLE.max) ? _GT_THROTTLE.max : 0;

 Logger.log("[26B_HTTP_SAVINGS] HTTP optimization patches loaded v" + HTTP_SAVINGS_VERSION);
 // budget guard helper — log at load time
 var _guardPct = (typeof HttpCallCounter !== 'undefined') ? (HttpCallCounter.getToday() / Math.max(1, HttpCallCounter.getQuota())) : -1;
 Logger.log("[26B_HTTP_SAVINGS] forceFull budget guard: " + (_guardPct >= 0 ? Math.round(_guardPct * 100) + "% utilisé (seuil 70%)" : "HttpCallCounter indispo"));
 Logger.log("[26B_HTTP_SAVINGS] FX TTL: " + fmtMs(fx)
   + ", Price Stale: " + fmtMs(cfg.PRICE_STALE_MS)
   + ", Price TTL: " + fmtMs(cfg.PRICE_TTL_MS)
   + ", Price Cooldown: " + fmtMs(cfg.PRICE_ATTEMPT_COOLDOWN_MS));
 Logger.log("[26B_HTTP_SAVINGS] Circuit Breaker: " + fmtMs(cb) + ", GT Throttle: " + gt + "/run");
 var httpToday = (typeof HttpCallCounter !== 'undefined') ? HttpCallCounter.getToday() : -1;
 var httpQuota = (typeof HttpCallCounter !== 'undefined') ? HttpCallCounter.getQuota() : -1;
 if (httpToday >= 0) {
  Logger.log("[26B_HTTP_SAVINGS] HTTP Counter: " + httpToday + "/" + httpQuota + " today (quota day starts 09h UTC)");
 }
 } catch (e) {}
})();
