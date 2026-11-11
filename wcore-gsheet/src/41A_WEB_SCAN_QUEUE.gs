/************************************************************
 * 41A_WEB_SCAN_QUEUE.gs - Bounded status path for delegated scans
 *
 * v4.16.97 - 2026-11-11 : une demande forcee (C1) passe devant les demandes automatiques,
 *   a l'admission comme au drain. File pleine de 40 entrees AUTO plus anciennes : la
 *   demande forcee d'un onglet scanne recemment etait reportee (QUEUE_DEFERRED) sans fin.
 *   La regle anti-famine (attente > TTL : FIFO) reste prioritaire.
 * v4.16.91 - 2026-11-10 : restaure 4.16.86 (fenetre d'ACK 45 min, recu b/s) et
 *   4.16.89 (DEGRADED prouve : q=0, nx=+30 min), effaces du LIVE le 07/11, sur la base
 *   LIVE 4.16.90 (verrou 3000 ms) + C1 (plafond 8, reserve de quota) inchangee.
 * v4.16.89 - Back off proven DEGRADED scans and reset their admission age.
 * v4.16.85 - Root cause of the 2026-10-22 Ethereum/Gnosis outage:
 *   REFRESH_STATUS is a custom function with a 30 s hard deadline. It performed
 *   a synchronous POST to /api/gsheet/scan (discovery + balances + pricing) and
 *   UrlFetchApp offers no client timeout. When the API took longer than the
 *   remaining budget, Google killed the function ("Exceeded maximum execution
 *   time"), the response was lost, WalletCache was never written, and the next
 *   recalculation retried the same doomed call: J1 froze while B1 kept pulsing.
 *   A generic kill/exception inside that same payload path also explains the
 *   Gnosis "Internal error executing the custom function.".
 *
 *   Fix: the custom function never starts an unbounded fetch. It records the
 *   request in a short-lived queue and returns a cache-only status. The scan is
 *   executed by WATCHDOG_FROM_RECAP (installable trigger, 6 min budget) which
 *   calls back into the chain status with the queue-draining flag set.
 *
 * Invariants preserved:
 *   - QUEUED != SCAN_SUCCESS : the marker never claims a fresh balance.
 *   - Entry eviction only delays a refresh; the next recalculation re-queues.
 *   - Quota breaker, budget admission, per-wallet lease and cache-write failure
 *     handling stay in _webScanWallet_, they are not bypassed here.
 *   - No retry storm: dedup per chain+wallet, bounded attempts, per-entry
 *     backoff and a cooldown after terminal failure.
 ************************************************************/

var GSHEET_WEB_SCAN_QUEUE_VERSION = "4.16.97-force-priority";
// 2026-11-09 : retablit 4.16.88 (efface du LIVE avant le 07/11). Le watchdog impulse ~10 B1 a la fois ;
// leurs cellules s'inscrivent en parallele pendant que le drain tient le ScriptLock. Avec 250 ms
// (GSHEET_WEB_SCAN_LOCK_WAIT_MS du scan), elles perdaient le verrou : [REFRESH_QUEUE_ERROR], puis
// une rotation complete perdue. Une mutation de file est minuscule ; une fonction personnalisee a 30 s.
var GSHEET_WEB_SCAN_QUEUE_LOCK_WAIT_MS = 3000;
var GSHEET_WEB_SCAN_QUEUE_KEY = "WCORE_WEB_SCAN_QUEUE_V1";
var GSHEET_WEB_SCAN_QUEUE_MAX_ITEMS = 40;
var GSHEET_WEB_SCAN_QUEUE_TTL_SEC = 6 * 3600;
var GSHEET_WEB_SCAN_QUEUE_MAX_ATTEMPTS = 3;
var GSHEET_WEB_SCAN_QUEUE_BACKOFF_MS = 5 * 60 * 1000;
// v4.16.89: delay retries after a proven degraded cache rewrite.
var GSHEET_WEB_SCAN_QUEUE_DEGRADED_RETRY_MS = 30 * 60 * 1000;
var GSHEET_WEB_SCAN_QUEUE_FAILURE_COOLDOWN_MS = 15 * 60 * 1000;
var GSHEET_WEB_SCAN_QUEUE_MIN_SCAN_MS = 20 * 1000;
// v4.16.86: I1 recalculates only on the next B1 pulse (WD_PULSE_MIN = 30 min, one watchdog
// cycle of slack). A shorter window expired before any cell could read the ACK.
var GSHEET_WEB_SCAN_QUEUE_ACK_WINDOW_MS = 45 * 60 * 1000;
// 2026-11-07 (C1) : plafond par passage de drain, 3 -> 8. Le budget de temps reste la vraie
// borne : aucun scan n'est lance si le temps restant est inferieur a MIN_SCAN_MS ou a 1,5 fois
// le scan le plus long deja observe dans ce passage ; un refus de quota arrete le passage.
var GSHEET_WEB_SCAN_QUEUE_DRAIN_MAX_PER_RUN = 8;
var GSHEET_WEB_SCAN_QUEUE_DRAIN_TRIGGER = "QUEUE_DRAIN";
var _WCORE_WEB_SCAN_QUEUE_DRAINING = false;
// Set by the EVM status path (11_EVM_ENGINE) after a drained scan rereads the cache.
var _WCORE_WEB_SCAN_QUEUE_PROOF = null;

// Opaque source label (FNV-1a), no wallet in diagnostics or watchdog output.
function _webScanQueueOpaque_(value) {
  var h = 2166136261, s = String(value || "");
  for (var i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16);
}
function _webScanQueueRevision_(tokens, force, trigger) {
  return JSON.stringify([tokens || [], force ? 1 : 0, force ? String(trigger || "") : ""]);
}
// Packed cache dates are script-timezone strings with second precision.
// Parse local format via GAS Utilities, never Date.parse/local host assumptions.
function _webScanQueueTimestamp_(raw) {
  var ts = 0;
  try {
    if (typeof raw === "number") ts = raw;
    else if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)) {
      var parsed = Utilities.parseDate(raw, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
      ts = parsed.getTime();
      if (Format.datetime(ts) !== raw) return 0;
    } else if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(raw)) ts = new Date(raw).getTime();
  } catch (eStamp) { return 0; }
  return isFinite(ts) && ts > 0 && ts <= Date.now() ? ts : 0;
}
function _webScanQueueAck_(address, tokens, force, config, trigger, stamp) {
  var id = _webScanChainKey_(config).toUpperCase() + "|" + String(address).toLowerCase();
  var receipt = _webScanQueueReceipt_(id);
  // Read-only, idempotent hint shared by all cells with this revision. Never
  // write a consumed flag: CacheService get/put is not an atomic consumption.
  // Force requests have the same conservative expiry; a new trigger changes v.
  return !!(receipt && receipt.l === "OK" && receipt.q > 0 && receipt.s >= Math.floor(receipt.q / 1000) * 1000 &&
    receipt.s > receipt.b && receipt.s === _webScanQueueTimestamp_(stamp) && receipt.v === _webScanQueueRevision_(tokens, force, trigger) &&
    receipt.nx > Date.now());
}
var _WCORE_STATUS_PHASE_TTL_SEC = 3600;

function _webScanQueueEnabled_() {
  try {
    var prop = String(_webScanProp_("GSHEET_WEB_SCAN_QUEUE") || "").toLowerCase();
    if (prop === "false" || prop === "0" || prop === "off") return false;
    return !!_webScanEnabled_();
  } catch (e) { return false; }
}

function _webScanQueueDraining_() {
  return _WCORE_WEB_SCAN_QUEUE_DRAINING === true;
}

function _webScanQueueCache_() {
  try { return CacheService.getScriptCache(); } catch (e) { return null; }
}

function _webScanQueueEntryId_(entry) {
  return String(entry && entry.c || "").toUpperCase() + "|" + String(entry && entry.a || "").toLowerCase();
}

function _webScanQueueRead_() {
  var cache = _webScanQueueCache_();
  if (!cache) return [];
  var raw = null;
  try { raw = cache.get(GSHEET_WEB_SCAN_QUEUE_KEY); } catch (eRaw) { return []; }
  if (!raw) return [];
  var list = null;
  try { list = JSON.parse(raw); } catch (eParse) { return []; }
  if (!Array.isArray(list)) return [];
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var it = list[i];
    if (!it || typeof it !== "object") continue;
    var chain = String(it.c || "").trim();
    var addr = String(it.a || "").trim();
    if (!chain || !addr) continue;
    if (typeof _wcoreRemovedChain_ === "function" && _wcoreRemovedChain_(chain)) continue;
    out.push({
      c: chain.toUpperCase(),
      a: addr,
      f: it.f === 1 ? 1 : 0,
      t: Array.isArray(it.t) ? it.t.slice(0, 200) : [],
      r: String(it.r || "").substring(0, 40),
      q: Number(it.q) || Date.now(),
      n: Number(it.n) || 0,
      nx: Number(it.nx) || 0,
      l: String(it.l || "").substring(0, 120),
      d: Number(it.d) || 0,
      x: Number(it.x) || 0,
      v: String(it.v || "")
    });
  }
  return out;
}

function _webScanQueueWrite_(list) {
  var cache = _webScanQueueCache_();
  if (!cache) return false;
  try {
    if (!list || !list.length) {
      cache.remove(GSHEET_WEB_SCAN_QUEUE_KEY);
      return true;
    }
    cache.put(GSHEET_WEB_SCAN_QUEUE_KEY, JSON.stringify(list), GSHEET_WEB_SCAN_QUEUE_TTL_SEC);
    return true;
  } catch (eWrite) { return false; }
}

// Read-modify-write under the same bounded ScriptLock convention as the scan
// admission. Lock failure degrades to "not queued" instead of losing entries.
function _webScanQueueMutate_(mutator) {
  var lock = null;
  var acquired = false;
  try {
    lock = LockService.getScriptLock();
    if (!lock || !lock.tryLock(GSHEET_WEB_SCAN_QUEUE_LOCK_WAIT_MS)) return { ok: false, reason: "QUEUE_LOCK_BUSY" };
    acquired = true;
    var list = _webScanQueueRead_();
    var result = mutator(list);
    var changed = result && result.changed === true;
    if (changed && !_webScanQueueWrite_(list)) return { ok: false, reason: "QUEUE_WRITE_FAILED" };
    return result || { ok: true };
  } catch (eMutate) {
    return { ok: false, reason: "QUEUE_LOCK_ERROR" };
  } finally {
    if (acquired) try { lock.releaseLock(); } catch (eRelease) {}
  }
}

function _webScanQueueCooldownKey_(chainKey, address) {
  return "WCORE_WEB_SCAN_QUEUE_COOLDOWN_" +
    String(chainKey || "").toUpperCase().replace(/[^A-Z0-9]+/g, "_") + "_" +
    String(address || "").toLowerCase().replace(/[^a-z0-9]+/g, "").substring(0, 40);
}

function _webScanQueueInCooldown_(chainKey, address) {
  var cache = _webScanQueueCache_();
  if (!cache) return false;
  try { return !!cache.get(_webScanQueueCooldownKey_(chainKey, address)); } catch (e) { return false; }
}

function _webScanQueueSetCooldown_(chainKey, address) {
  var cache = _webScanQueueCache_();
  if (!cache) return;
  try {
    cache.put(_webScanQueueCooldownKey_(chainKey, address), String(Date.now()),
      Math.ceil(GSHEET_WEB_SCAN_QUEUE_FAILURE_COOLDOWN_MS / 1000));
  } catch (e) {}
}

// Receipts are evictable CacheService hints, never a durable job or scan success.
// A refused/evicted source retains its first ticket until natural recalculation.
function _webScanQueueReceipt_(id, value) {
  var cache = _webScanQueueCache_();
  if (!cache) return null;
  var key = "WCORE_WEB_SCAN_TICKET_" + id;
  try {
    if (value) { cache.put(key, JSON.stringify(value), GSHEET_WEB_SCAN_QUEUE_TTL_SEC); return value; }
    return JSON.parse(cache.get(key) || "null");
  } catch (e) { return null; }
}

function _webScanQueueCompare_(a, b, now) {
  // After one queue lifetime waiting, FIFO wins even against ancient newcomers.
  var ageA = now - a.q, ageB = now - b.q;
  var starve = GSHEET_WEB_SCAN_QUEUE_TTL_SEC * 1000;
  if (ageA >= starve || ageB >= starve) {
    if (ageA !== ageB) return ageB - ageA;
  }
  // A manual force (C1) is an explicit request: it goes before automatic refreshes.
  if (!a.f !== !b.f) return a.f ? -1 : 1;
  var dataA = a.d > 0 ? now - a.d : starve;
  var dataB = b.d > 0 ? now - b.d : starve;
  return (dataB + ageB) - (dataA + ageA) || a.q - b.q;
}

function _webScanQueueEnqueue_(address, tokenList, forceFull, config, reason, dataTimestamp, trigger) {
  if (!_webScanQueueEnabled_()) return { ok: false, reason: "QUEUE_DISABLED" };
  var chainKey = "";
  try { chainKey = _webScanChainKey_(config); } catch (eChain) {}
  var addr = String(address || "").trim();
  if (!chainKey || !addr) return { ok: false, reason: "QUEUE_INVALID" };
  if (typeof _wcoreRemovedChain_ === "function" && (_wcoreRemovedChain_(chainKey) || _wcoreRemovedChain_(config && config.CHAIN && config.CHAIN.CHAIN_ID))) return { ok: false, reason: "CHAIN_REMOVED" };
  if (_webScanQueueInCooldown_(chainKey, addr)) return { ok: false, reason: "QUEUE_COOLDOWN" };
  var tokens = [];
  try { tokens = Array.isArray(tokenList) ? tokenList.slice(0, 200) : _webScanTokenList_(tokenList); } catch (eTokens) {}
  var force = _webScanForce_(forceFull) ? 1 : 0;
  var id = chainKey.toUpperCase() + "|" + addr.toLowerCase();
  var revision = _webScanQueueRevision_(tokens, force, trigger);
  return _webScanQueueMutate_(function (list) {
    var now = Date.now();
    for (var i = 0; i < list.length; i++) {
      if (_webScanQueueEntryId_(list[i]) !== id) continue;
      // A force escalation does not reset attempts, a backoff or an in-flight claim.
      if ((force && !list[i].f) || (!list[i].f && list[i].v !== revision) ||
          (force && list[i].v !== revision)) {
        list[i].f = force || list[i].f ? 1 : 0;
        list[i].t = tokens; list[i].v = revision;
        return { ok: true, changed: true, deduped: true };
      }
      return { ok: true, changed: false, deduped: true };
    }
    var ticket = _webScanQueueReceipt_(id) || {};
    if (!force && ticket.l === "OK" && ticket.nx > now && ticket.v === revision &&
        ticket.q > 0 && ticket.s >= ticket.q && ticket.s === Number(dataTimestamp)) {
      return { ok: false, reason: "QUEUE_NOT_DUE" };
    }
    if (ticket.l === "OK") ticket = {};
    var data = Number(dataTimestamp) || 0;
    if (data <= 0 || data > now) data = 0;
    var entry = { c: chainKey.toUpperCase(), a: addr, f: force, t: tokens,
      r: String(reason || "AUTO").substring(0, 40), q: Number(ticket.q) || now,
      d: data, n: Number(ticket.n) || 0, nx: Number(ticket.nx) || 0, x: 0, l: String(ticket.l || ""), v: revision };
    var evicted = "";
    if (list.length >= GSHEET_WEB_SCAN_QUEUE_MAX_ITEMS) {
      var worst = -1;
      for (var j = 0; j < list.length; j++) {
        if (list[j].x > now) continue;
        if (worst < 0 || _webScanQueueCompare_(list[j], list[worst], now) > 0) worst = j;
      }
      if (worst < 0 || _webScanQueueCompare_(entry, list[worst], now) >= 0) {
        _webScanQueueReceipt_(id, { q: entry.q, n: entry.n, nx: entry.nx, l: "DEFERRED" });
        return { ok: false, changed: false, reason: "QUEUE_DEFERRED" };
      }
      var victim = list[worst];
      evicted = _webScanQueueEntryId_(victim);
      if (!_webScanQueueReceipt_(evicted, { q: victim.q, n: victim.n, nx: victim.nx, l: "EVICTED" })) {
        return { ok: false, changed: false, reason: "QUEUE_WRITE_FAILED" };
      }
      list.splice(worst, 1);
    }
    list.push(entry);
    return { ok: true, changed: true, deduped: false, evicted: evicted };
  });
}

/**
 * Resolve the chain API from the runtime registry. Chain configs are closures
 * owned by the factory, so the queue stores only the canonical chain key.
 */
function _webScanQueueResolveChain_(chainKey) {
  var key = String(chainKey || "").trim().toUpperCase();
  if (!key) return null;
  if (typeof _wcoreRemovedChain_ === "function" && _wcoreRemovedChain_(key)) return null;
  try {
    if (typeof ChainFactory !== "undefined" && typeof ChainFactory.getRegistry === "function") {
      var registry = ChainFactory.getRegistry() || {};
      var api = registry[key];
      if (api && typeof api.getRefreshStatus === "function") return api;
    }
  } catch (eReg) {}
  try {
    if (typeof globalThis !== "undefined") {
      var direct = globalThis[key + "_REFRESH_STATUS"];
      if (typeof direct === "function") return { getRefreshStatus: direct };
      var prefixed = globalThis["_" + key];
      if (prefixed && typeof prefixed.getRefreshStatus === "function") return prefixed;
    }
  } catch (eGlobal) {}
  return null;
}

function _webScanQueueClassifyStatus_(status) {
  var s = String(status || "");
  if (s.indexOf("WEB_SCAN_OK") >= 0) return "OK";
  if (s.indexOf("WEB_SCAN_DEGRADED") >= 0) return "DEGRADED";
  if (s.indexOf("WEB_SCAN_PRESERVED") >= 0) return "PRESERVED";
  if (s.indexOf("[REFRESH_QUEUED]") >= 0) return "RECURSION";
  if (s.indexOf("[BLOCKED:QUOTA]") >= 0) return "BLOCKED_QUOTA";
  return "ERROR";
}

/**
 * Drain queued scans inside an installable-trigger execution (6 min budget).
 * Never call from a custom function: the fetch still has no client timeout.
 * @param {{maxItems?: number, budgetMs?: number}} opts
 */
function _webScanQueueDrain_(opts) {
  opts = opts || {};
  if (!_webScanQueueEnabled_()) return { ran: false, reason: "QUEUE_DISABLED", results: [] };
  var maxItems = Math.max(1, Math.min(GSHEET_WEB_SCAN_QUEUE_DRAIN_MAX_PER_RUN, Number(opts.maxItems) || 1));
  var budgetMs = Math.max(0, Number(opts.budgetMs) || 120000);
  var startedAt = Date.now();
  var results = [];
  var longestScanMs = 0;
  var finish = function (reason) {
    return { ran: true, reason: reason, results: results, elapsedMs: Date.now() - startedAt };
  };
  for (var i = 0; i < maxItems; i++) {
    if (budgetMs - (Date.now() - startedAt) < Math.max(GSHEET_WEB_SCAN_QUEUE_MIN_SCAN_MS, Math.ceil(longestScanMs * 1.5))) return finish("BUDGET_EXHAUSTED");
    if (_webScanQueueDraining_()) return finish("REENTRANT");
    var entry = null;
    var claim = _webScanQueueMutate_(function (list) {
      var now = Date.now();
      for (var j = 0; j < list.length; j++) {
        if (list[j].nx > now || list[j].x > now) continue;
        if (!entry || _webScanQueueCompare_(list[j], entry, now) < 0) entry = list[j];
      }
      if (!entry) return { ok: true, changed: false };
      // Covers the full GAS trigger lifetime. The wallet lease remains authoritative.
      entry.x = now + 6 * 60 * 1000;
      return { ok: true, changed: true };
    });
    if (!claim.ok) return finish(claim.reason);
    if (!entry) return finish(_webScanQueueRead_().length ? "BACKOFF" : "IDLE");
    var api = _webScanQueueResolveChain_(entry.c);
    var status = null;
    var thrown = null;
    var attemptAt = Date.now();
    _WCORE_WEB_SCAN_QUEUE_PROOF = null;
    _WCORE_WEB_SCAN_QUEUE_DRAINING = true;
    try {
      if (api) status = api.getRefreshStatus(entry.a, null, entry.t, entry.f === 1, null);
    } catch (eScan) { thrown = String(eScan && (eScan.message || eScan) || eScan); }
    finally { _WCORE_WEB_SCAN_QUEUE_DRAINING = false; }
    var outcome = !api ? "UNRESOLVED_CHAIN" : thrown ? "THROWN" : _webScanQueueClassifyStatus_(status);
    var proof = _WCORE_WEB_SCAN_QUEUE_PROOF;
    var proven = !!(proof && proof.advanced && proof.stamp > proof.before &&
      proof.stamp >= Math.floor(entry.q / 1000) * 1000 && proof.stamp <= Date.now());
    var attempts = Number(entry.n) + 1;
    var duration = Date.now() - attemptAt;
    if (duration > longestScanMs) longestScanMs = duration;
    var retry = !(outcome === "OK" || outcome === "DEGRADED" || outcome === "PRESERVED");
    var result = { chain: entry.c, outcome: outcome, attempts: attempts, durationMs: duration,
      source: _webScanQueueOpaque_(_webScanQueueEntryId_(entry)), cacheWriteReread: proven,
      cacheStamp: proven ? proof.stamp : 0,
      status: String(status || "").substring(0, 120) };
    var forcePending = false;
    var receiptPending = null;
    var commit = _webScanQueueMutate_(function (queue) {
      for (var k = 0; k < queue.length; k++) {
        if (_webScanQueueEntryId_(queue[k]) !== _webScanQueueEntryId_(entry) || queue[k].x !== entry.x || queue[k].q !== entry.q) continue;
        queue[k].n = attempts;
        queue[k].x = 0;
        queue[k].l = outcome;
        // The captured auto request cannot acknowledge a concurrent force escalation.
        // Preserve it for the next drain, without bypassing failure backoff/cooldown.
        if ((entry.f !== 1 && queue[k].f === 1) || queue[k].v !== entry.v) {
          forcePending = true;
          if (retry) {
            queue[k].nx = Date.now() + GSHEET_WEB_SCAN_QUEUE_BACKOFF_MS * attempts;
            if (attempts >= GSHEET_WEB_SCAN_QUEUE_MAX_ATTEMPTS) {
              _webScanQueueSetCooldown_(entry.c, entry.a);
              queue[k].nx = Date.now() + GSHEET_WEB_SCAN_QUEUE_FAILURE_COOLDOWN_MS;
              queue[k].n = 0;
            }
          } else {
            queue[k].n = 0;
            queue[k].nx = 0;
          }
          return { ok: true, changed: true };
        }
        if (!retry || attempts >= GSHEET_WEB_SCAN_QUEUE_MAX_ATTEMPTS) {
          if (retry) _webScanQueueSetCooldown_(entry.c, entry.a);
          // Only verified OK gets a short pulse suppression; degraded/preserved are not freshness.
          // v4.16.86: proven OK keeps an ACK receipt for 45 min (b/s = cache write proof).
          // v4.16.89: proven DEGRADED resets the admission age (q=0) and backs off 30 min.
          receiptPending = { q: outcome === "DEGRADED" && proven ? 0 : entry.q, n: 0, v: entry.v,
            b: proven ? proof.before : 0, s: outcome === "OK" && proven ? proof.stamp : 0,
            nx: outcome === "OK" && proven ? Date.now() + GSHEET_WEB_SCAN_QUEUE_ACK_WINDOW_MS :
              outcome === "DEGRADED" && proven ? Date.now() + GSHEET_WEB_SCAN_QUEUE_DEGRADED_RETRY_MS : 0, l: outcome };
          queue.splice(k, 1);
        } else queue[k].nx = Date.now() + GSHEET_WEB_SCAN_QUEUE_BACKOFF_MS * attempts;
        return { ok: true, changed: true };
      }
      return { ok: false, reason: "QUEUE_CLAIM_LOST" };
    });
    // Publish ACK only AFTER the queue write/removal was confirmed successful.
    // A failed queue commit must never leave a consumable success receipt.
    if (commit.ok && receiptPending) _webScanQueueReceipt_(_webScanQueueEntryId_(entry), receiptPending);
    result.queueCommitted = commit.ok;
    results.push(result);
    try { _webScanQueueCache_().put("WCORE_WEB_SCAN_QUEUE_LAST", JSON.stringify(result), GSHEET_WEB_SCAN_QUEUE_TTL_SEC); } catch (eLast) {}
    if (!commit.ok) return finish(commit.reason);
    if (forcePending) return finish("FORCE_PENDING");
    // Reserve de quota insuffisante : ne pas consommer les tentatives des entrees suivantes.
    if (outcome === "BLOCKED_QUOTA") return finish("QUOTA_BLOCKED");
  }
  return finish("MAX_ITEMS");
}

/** Admin/trigger entry point. Not usable as a spreadsheet custom function. */
function WCORE_WEB_SCAN_QUEUE_DRAIN() {
  var res = _webScanQueueDrain_({ maxItems: GSHEET_WEB_SCAN_QUEUE_DRAIN_MAX_PER_RUN, budgetMs: 240000 });
  return [["Metric", "Value"]]
    .concat([["ran", String(res && res.ran)]])
    .concat([["reason", String(res && res.reason || "")]])
    .concat([["elapsedMs", String(res && res.elapsedMs || 0)]])
    .concat([["results", JSON.stringify((res && res.results) || [])]]);
}

function _webScanQueueStatusRows_() {
  var list = _webScanQueueRead_();
  var now = Date.now(), age = 0, dataAge = 0, unknown = 0;
  for (var i = 0; i < list.length; i++) {
    age = Math.max(age, now - list[i].q);
    if (list[i].d > 0) dataAge = Math.max(dataAge, now - list[i].d);
    else unknown++;
  }
  var last = {};
  try { last = JSON.parse(_webScanQueueCache_().get("WCORE_WEB_SCAN_QUEUE_LAST") || "{}"); } catch (e) {}
  return [["queue_enabled", _webScanQueueEnabled_()], ["queue_version", GSHEET_WEB_SCAN_QUEUE_VERSION],
    ["queue_pending", list.length], ["queue_oldest_age_ms", age], ["queue_max", GSHEET_WEB_SCAN_QUEUE_MAX_ITEMS],
    ["queueDepth", list.length], ["oldestAdmissionAge", age],
    ["oldestDataAge", unknown ? "UNKNOWN" : dataAge], ["oldestKnownDataAge", dataAge], ["unknownDataCount", unknown],
    ["lastAttempts", last.attempts || 0], ["lastDurationMs", last.durationMs || 0], ["lastOutcome", last.outcome || "NONE"]];
}

// Bounded breadcrumb so the first natural execution after any future failure
// names the phase it died in, without another diagnostic-only deliverable.
function _statusPhaseMark_(chainKey, phase) {
  var cache = _webScanQueueCache_();
  if (!cache) return;
  try {
    var key = "WCORE_STATUS_PHASE_" + String(chainKey || "UNKNOWN").toUpperCase().replace(/[^A-Z0-9]+/g, "_");
    cache.put(key, String(phase || "") + " | " + new Date().toISOString(), _WCORE_STATUS_PHASE_TTL_SEC);
  } catch (e) {}
}

function _statusPhaseRead_(chainKey) {
  var cache = _webScanQueueCache_();
  if (!cache) return "";
  try {
    var key = "WCORE_STATUS_PHASE_" + String(chainKey || "UNKNOWN").toUpperCase().replace(/[^A-Z0-9]+/g, "_");
    return String(cache.get(key) || "");
  } catch (e) { return ""; }
}

function DIAG_WEB_SCAN_QUEUE() {
  var rows = [["Metric", "Value"]].concat(_webScanQueueStatusRows_());
  var list = _webScanQueueRead_();
  for (var i = 0; i < list.length; i++) {
    rows.push(["entry_" + (i + 1), JSON.stringify({
      chain: list[i].c,
      address: String(list[i].a).substring(0, 10) + "…",
      force: list[i].f,
      reason: list[i].r,
      attempts: list[i].n,
      nextAt: list[i].nx,
      last: list[i].l
    })]);
  }
  rows.push(["last_phase", _statusPhaseRead_("ETHEREUM") || "NONE"]);
  return rows;
}
