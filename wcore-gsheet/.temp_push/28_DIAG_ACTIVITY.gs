/************************************************************
 * 28_DIAG_ACTIVITY.gs - Activity & Watchdog Diagnostics (v4.12.3)
 *
 * v4.12.3 - FIX: diagnostics read compact ActivityTracker fields (lc/la/n).
 * 
 * Outils de diagnostic pour le systeme Activity et Watchdog.
 * 
 * FONCTIONS PRINCIPALES:
 * - ACTIVITY_STATUS() : Ã‰tat complet du systeme Activity
 * - DIAG_WATCHDOG_STATUS() : Ã‰tat du trigger watchdog
 * - DIAG_NONCE_MAP() : Contenu de ACTIVITY_NONCE_MAP
 * - DIAG_PENDING_QUEUE() : File d'attente des refreshs
 * 
 * FONCTIONS DE CORRECTION:
 * - FIX_INIT_ALL_NONCES() : Initialise tous les nonces
 * - FIX_REINSTALL_WATCHDOG() : Reinstalle le watchdog
 * 
 ************************************************************/

// ============================================================
// ACTIVITY_STATUS - Ã‰tat complet du systeme
// ============================================================

/**
 * Affiche l'etat complet du systeme Activity
 * @customfunction
 */
function ACTIVITY_STATUS() {
 var out = [["Component", "Status", "Details", "Action"]];
 
 try {
 var props = PropertiesService.getScriptProperties();
 var nowMs = Date.now();
 
 // === 1. ACTIVITY_NONCE_MAP ===
 var nonceMapRaw = props.getProperty("ACTIVITY_NONCE_MAP");
 var nonceMap = null;
 var nonceCount = 0;
 var oldestCheck = null;
 var newestCheck = null;
 var recentActivity = 0;
 
 if (nonceMapRaw) {
 try {
 nonceMap = JSON.parse(nonceMapRaw);
 var keys = Object.keys(nonceMap);
 nonceCount = keys.length;
 
 for (var i = 0; i < keys.length; i++) {
 var entry = nonceMap[keys[i]];
 if (entry.lastCheck) {
 if (!oldestCheck || entry.lastCheck < oldestCheck) oldestCheck = entry.lastCheck;
 if (!newestCheck || entry.lastCheck > newestCheck) newestCheck = entry.lastCheck;
 }
 if (entry.lastActivity && (nowMs - entry.lastActivity) < 300000) {
 recentActivity++;
 }
 }
 } catch (e) {
 out.push(["NONCE_MAP", "ERROR", "Invalid JSON: " + e.message, "Check storage"]);
 }
 }
 
 if (nonceCount === 0) {
 out.push(["NONCE_MAP", "EMPTY", "0 entries", "Run FIX_INIT_ALL_NONCES()"]);
 } else {
 var newestAge = newestCheck ? Math.round((nowMs - newestCheck) / 60000) : -1;
 out.push(["NONCE_MAP", "OK", nonceCount + " wallets tracked", ""]);
 out.push([" Last check", newestAge >= 0 ? newestAge + " min ago" : "N/A", "", newestAge > 5 ? "Watchdog may be stopped" : ""]);
 out.push([" Recent activity", recentActivity + " wallets", "", ""]);
 }
 
 // === 2. WATCHDOG TRIGGER ===
 out.push(["", "", "", ""]);
 var triggers = ScriptApp.getProjectTriggers();
 var watchdogFound = false;
 var watchdogInfo = "";
 
 for (var t = 0; t < triggers.length; t++) {
 if (triggers[t].getHandlerFunction() === "ACTIVITY_WATCHDOG") {
 watchdogFound = true;
 try {
 var interval = triggers[t].getTriggerSource();
 watchdogInfo = "Trigger ID: " + triggers[t].getUniqueId();
 } catch (e) {
 watchdogInfo = "Active";
 }
 break;
 }
 }
 
 if (watchdogFound) {
 out.push(["WATCHDOG_TRIGGER", "INSTALLED", watchdogInfo, ""]);
 } else {
 out.push(["WATCHDOG_TRIGGER", "NOT FOUND", "No trigger installed", "Run INSTALL_ACTIVITY_WATCHDOG()"]);
 }
 
 // === 3. ActivityTracker Object ===
 out.push(["", "", "", ""]);
 if (typeof ActivityTracker !== "undefined") {
 out.push(["ActivityTracker", "LOADED", "", ""]);
 out.push([" .getInfo()", typeof ActivityTracker.getInfo === "function" ? "OK" : "MISSING", "", ""]);
 out.push([" .updateNonce()", typeof ActivityTracker.updateNonce === "function" ? "OK" : "MISSING", "", ""]);
 out.push([" .hasRecentActivity()", typeof ActivityTracker.hasRecentActivity === "function" ? "OK" : "MISSING", "", ""]);
 } else {
 out.push(["ActivityTracker", "NOT LOADED", "Object undefined", "Check 27_ACTIVITY_REFRESH.gs"]);
 }
 
 // === 4. PENDING REFRESH QUEUE ===
 out.push(["", "", "", ""]);
 var pendingRaw = props.getProperty("ACTIVITY_PENDING_REFRESH");
 var pendingCount = 0;
 if (pendingRaw) {
 try {
 var pending = JSON.parse(pendingRaw);
 pendingCount = Array.isArray(pending) ? pending.length : 0;
 } catch (e) {}
 }
 out.push(["PENDING_QUEUE", pendingCount + " items", "", pendingCount > 10 ? "Queue backing up!" : ""]);
 
 // === 5. WALLETS IN CACHE ===
 out.push(["", "", "", ""]);
 var walletCount = 0;
 try {
 if (typeof _activity_getAllWalletsFromPackedCache === "function") {
 var wallets = _activity_getAllWalletsFromPackedCache();
 walletCount = wallets.length;
 }
 } catch (e) {}
 out.push(["CACHED_WALLETS", walletCount + " found", "", ""]);
 
 // === 6. OVERALL STATUS ===
 out.push(["", "", "", ""]);
 var overallStatus = "OK";
 var overallAction = "";
 
 if (nonceCount === 0) {
 overallStatus = "NOT INITIALIZED";
 overallAction = "Run FIX_INIT_ALL_NONCES()";
 } else if (!watchdogFound) {
 overallStatus = "WATCHDOG MISSING";
 overallAction = "Run INSTALL_ACTIVITY_WATCHDOG()";
 } else if (newestCheck && (nowMs - newestCheck) > 300000) {
 overallStatus = "WATCHDOG STALE";
 overallAction = "Check trigger execution logs";
 }
 
 out.push(["=== OVERALL ===", overallStatus, "", overallAction]);
 
 } catch (e) {
 out.push(["ERROR", e.message, "", ""]);
 }
 
 return out;
}

// ============================================================
// DIAG_WATCHDOG_STATUS - Ã‰tat detaille du watchdog
// ============================================================

/**
 * Diagnostic detaille du watchdog trigger
 * @customfunction
 */
function DIAG_WATCHDOG_STATUS() {
 var out = [["Property", "Value", "Status"]];
 
 try {
 // === 1. Check all triggers ===
 var triggers = ScriptApp.getProjectTriggers();
 out.push(["Total triggers", triggers.length, ""]);
 out.push(["", "", ""]);
 
 var watchdogTrigger = null;
 var otherTriggers = [];
 
 for (var i = 0; i < triggers.length; i++) {
 var t = triggers[i];
 var handler = t.getHandlerFunction();
 
 if (handler === "ACTIVITY_WATCHDOG") {
 watchdogTrigger = t;
 } else {
 otherTriggers.push(handler);
 }
 }
 
 // === 2. Watchdog trigger details ===
 if (watchdogTrigger) {
 out.push(["ACTIVITY_WATCHDOG", "FOUND", "OK"]);
 out.push([" Trigger ID", watchdogTrigger.getUniqueId(), ""]);
 
 try {
 var source = watchdogTrigger.getTriggerSource();
 out.push([" Source", String(source), ""]);
 } catch (e) {}
 
 try {
 var eventType = watchdogTrigger.getEventType();
 out.push([" Event type", String(eventType), ""]);
 } catch (e) {}
 
 } else {
 out.push(["ACTIVITY_WATCHDOG", "NOT FOUND", "MISSING"]);
 out.push([" Action needed", "Run INSTALL_ACTIVITY_WATCHDOG()", ""]);
 }
 
 // === 3. Other triggers ===
 out.push(["", "", ""]);
 out.push(["Other triggers", otherTriggers.length, ""]);
 for (var j = 0; j < otherTriggers.length && j < 10; j++) {
 out.push([" " + (j+1), otherTriggers[j], ""]);
 }
 
 // === 4. Recent execution check ===
 out.push(["", "", ""]);
 out.push(["=== EXECUTION CHECK ===", "", ""]);
 
 var props = PropertiesService.getScriptProperties();
 var nonceMapRaw = props.getProperty("ACTIVITY_NONCE_MAP");
 
 if (nonceMapRaw) {
 try {
 var nonceMap = JSON.parse(nonceMapRaw);
 var keys = Object.keys(nonceMap);
 var newestCheck = 0;
 
 for (var k = 0; k < keys.length; k++) {
 var entry = nonceMap[keys[k]];
 var lastCheck = entry.lastCheck || entry.lc || 0;
 if (lastCheck && lastCheck > newestCheck) {
 newestCheck = lastCheck;
 }
 }
 
 if (newestCheck > 0) {
 var ageMin = Math.round((Date.now() - newestCheck) / 60000);
 out.push(["Last nonce check", ageMin + " min ago", ageMin > 5 ? "STALE" : "OK"]);
 out.push(["Last check time", new Date(newestCheck).toISOString(), ""]);
 
 if (ageMin > 5 && watchdogTrigger) {
 out.push(["WARNING", "Watchdog installed but not executing!", "Check Executions log"]);
 }
 } else {
 out.push(["Last nonce check", "Never", "Run FIX_INIT_ALL_NONCES()"]);
 }
 } catch (e) {
 out.push(["NONCE_MAP parse error", e.message, "ERROR"]);
 }
 } else {
 out.push(["NONCE_MAP", "EMPTY", "Run FIX_INIT_ALL_NONCES()"]);
 }
 
 } catch (e) {
 out.push(["ERROR", e.message, ""]);
 }
 
 return out;
}

// ============================================================
// DIAG_NONCE_MAP - Contenu detaille
// ============================================================

/**
 * Affiche le contenu complet de ACTIVITY_NONCE_MAP
 * @customfunction
 */
function DIAG_NONCE_MAP() {
 var out = [["Chain", "Wallet", "Nonce", "Last Check", "Last Activity", "Age"]];
 
 try {
 var props = PropertiesService.getScriptProperties();
 var nonceMapRaw = props.getProperty("ACTIVITY_NONCE_MAP");
 var nowMs = Date.now();
 
 if (!nonceMapRaw) {
 return [["Status", "EMPTY", "Run FIX_INIT_ALL_NONCES() or ACTIVITY_CHECK_ALL()", "", "", ""]];
 }
 
 var nonceMap = JSON.parse(nonceMapRaw);
 var keys = Object.keys(nonceMap);
 
 if (keys.length === 0) {
 return [["Status", "EMPTY (0 entries)", "Run FIX_INIT_ALL_NONCES()", "", "", ""]];
 }
 
 // Sort by last check (most recent first)
 keys.sort(function(a, b) {
 var aCheck = nonceMap[a].lastCheck || 0;
 var bCheck = nonceMap[b].lastCheck || 0;
 return bCheck - aCheck;
 });
 
 for (var i = 0; i < keys.length; i++) {
 var key = keys[i];
 var parts = key.split(":");
 var chain = parts[0] || "?";
 var wallet = parts[1] || "?";
 var entry = nonceMap[key];
 
 var lastCheckMs = entry.lastCheck || entry.lc || 0;
 var lastActivityMs = entry.lastActivity || entry.la || 0;
 var nonceVal = entry.nonce !== null && entry.nonce !== undefined ? entry.nonce : entry.n;
 var lastCheck = lastCheckMs ? new Date(lastCheckMs).toISOString().substring(0, 19) : "-";
 var lastActivity = lastActivityMs ? new Date(lastActivityMs).toISOString().substring(0, 19) : "-";
 var ageMin = lastCheckMs ? Math.round((nowMs - lastCheckMs) / 60000) + " min" : "-";
 
 out.push([
 chain,
 wallet.substring(0, 12) + "...",
 nonceVal !== null && nonceVal !== undefined ? String(nonceVal) : "-",
 lastCheck,
 lastActivity,
 ageMin
 ]);
 }
 
 out.push(["", "", "", "", "", ""]);
 out.push(["TOTAL", keys.length + " wallets", "", "", "", ""]);
 
 } catch (e) {
 out.push(["ERROR", e.message, "", "", "", ""]);
 }
 
 return out;
}

// ============================================================
// DIAG_PENDING_QUEUE - File d'attente
// ============================================================

/**
 * Affiche la file d'attente des refreshs pendants
 * @customfunction
 */
function DIAG_PENDING_QUEUE() {
 var out = [["Chain", "Wallet", "Priority", "Reason", "Added"]];
 
 try {
 var props = PropertiesService.getScriptProperties();
 var pendingRaw = props.getProperty("ACTIVITY_PENDING_REFRESH");
 
 if (!pendingRaw) {
 return [["Status", "EMPTY", "No pending refreshes", "", ""]];
 }
 
 var pending = JSON.parse(pendingRaw);
 
 if (!Array.isArray(pending) || pending.length === 0) {
 return [["Status", "EMPTY", "0 items in queue", "", ""]];
 }
 
 for (var i = 0; i < pending.length && i < 50; i++) {
 var item = pending[i];
 out.push([
 item.chain || "?",
 (item.wallet || "?").substring(0, 12) + "...",
 item.priority ? (item.priority.name || item.priority) : "?",
 item.reason || "-",
 item.addedAt ? new Date(item.addedAt).toISOString().substring(0, 19) : "-"
 ]);
 }
 
 if (pending.length > 50) {
 out.push(["...", (pending.length - 50) + " more", "", "", ""]);
 }
 
 out.push(["", "", "", "", ""]);
 out.push(["TOTAL", pending.length + " pending", "", "", ""]);
 
 } catch (e) {
 out.push(["ERROR", e.message, "", "", ""]);
 }
 
 return out;
}

// ============================================================
// FIX_INIT_ALL_NONCES - Initialiser tous les nonces
// ============================================================

/**
 * Initialise les nonces pour tous les wallets EVM.
 * Resout le probleme Activity.last_tx = "-"
 * @customfunction
 */
function FIX_INIT_ALL_NONCES() {
 var out = [["Chain", "Wallet", "Nonce", "Status"]];
 var startMs = Date.now();
 var successCount = 0;
 var errorCount = 0;
 var skippedCount = 0;
 
 try {
 // v4.14.6: Discover wallets from Recap Chain (preferred) or fallback to properties scan
 var wallets = [];

 if (typeof _discoverWalletsFromRecap_ === "function") {
 var discovered = _discoverWalletsFromRecap_();
 for (var d = 0; d < discovered.length; d++) {
 wallets.push({ chain: discovered[d].chainKey, wallet: discovered[d].wallet });
 }
 }

 if (wallets.length === 0) {
 // Fallback: scan properties for legacy wallet keys
 var props2 = PropertiesService.getScriptProperties();
 var allKeys = props2.getKeys();
 var seen = {};

 for (var i = 0; i < allKeys.length; i++) {
 var key = allKeys[i];
 if (key.indexOf("_CACHE_WALLET_") >= 0 || key.indexOf("WALLET_CACHE_") >= 0) {
 var match = key.match(/([A-Z0-9_]+)[_](?:CACHE_WALLET|WALLET_CACHE)[_](0x[a-fA-F0-9]+)/i);
 if (match && !seen[match[1] + ":" + match[2]]) {
 seen[match[1] + ":" + match[2]] = true;
 wallets.push({
 chain: match[1].toUpperCase(),
 wallet: match[2].toLowerCase()
 });
 }
 }
 }
 }
 
 out.push(["INFO", "Found " + wallets.length + " wallets", "", ""]);
 out.push(["", "", "", ""]);
 
 if (wallets.length === 0) {
 out.push(["WARNING", "No wallets found in cache!", "", ""]);
 return out;
 }
 
 // Process wallets (limit to avoid timeout)
 var maxWallets = 25;
 var processed = 0;
 
 for (var j = 0; j < wallets.length && processed < maxWallets; j++) {
 // Timeout check
 if (Date.now() - startMs > 25000) {
 out.push(["TIMEOUT", "Stopping at " + processed + " wallets", "", "Run again for more"]);
 break;
 }
 
 var w = wallets[j];
 
 // Get chain config
 var chainConfig = null;
 try {
 var varName = "_" + w.chain;
 var chainObj = eval(varName);
 if (chainObj && chainObj.getConfig) {
 chainConfig = chainObj.getConfig();
 }
 } catch (e) {}
 
 if (!chainConfig) {
 out.push([w.chain, w.wallet.substring(0, 12) + "...", "-", "NO CONFIG"]);
 skippedCount++;
 continue;
 }
 
 // Check VM type (only EVM has nonce)
 var vm = chainConfig.vm || "EVM";
 if (vm !== "EVM") {
 skippedCount++;
 continue; // Skip non-EVM silently
 }
 
 // Get RPC
 var rpc = null;
 if (chainConfig.RPC && chainConfig.RPC.ENDPOINTS && chainConfig.RPC.ENDPOINTS.length > 0) {
 rpc = chainConfig.RPC.ENDPOINTS[0];
 }
 
 if (!rpc) {
 out.push([w.chain, w.wallet.substring(0, 12) + "...", "-", "NO RPC"]);
 errorCount++;
 continue;
 }
 
 // Fetch nonce
 var nonce = null;
 try {
 nonce = _diag_fetchEvmNonce(w.wallet, rpc);
 } catch (e) {
 nonce = null;
 }
 
 processed++;
 
 if (nonce !== null) {
 // Update ActivityTracker
 if (typeof ActivityTracker !== "undefined" && ActivityTracker.updateNonce) {
 ActivityTracker.updateNonce(w.chain, w.wallet, nonce);
 } else {
 // Direct update to storage
 _diag_directUpdateNonce(w.chain, w.wallet, nonce);
 }
 out.push([w.chain, w.wallet.substring(0, 12) + "...", String(nonce), "OK"]);
 successCount++;
 } else {
 out.push([w.chain, w.wallet.substring(0, 12) + "...", "-", "RPC ERROR"]);
 errorCount++;
 }
 }
 
 out.push(["", "", "", ""]);
 out.push(["SUMMARY", successCount + " OK", errorCount + " errors", skippedCount + " skipped"]);
 
 if (wallets.length > maxWallets && processed >= maxWallets) {
 out.push(["NOTE", (wallets.length - processed) + " wallets remaining", "", "Run again"]);
 }
 
 } catch (e) {
 out.push(["ERROR", e.message, "", ""]);
 }
 
 return out;
}

// ============================================================
// FIX_REINSTALL_WATCHDOG - Reinstaller le watchdog
// ============================================================

/**
 * Desinstalle et reinstalle le watchdog proprement
 * @customfunction
 */
function FIX_REINSTALL_WATCHDOG() {
 var out = [["Step", "Action", "Result"]];
 
 try {
 // Step 1: Remove existing
 var triggers = ScriptApp.getProjectTriggers();
 var removed = 0;
 
 for (var i = 0; i < triggers.length; i++) {
 if (triggers[i].getHandlerFunction() === "ACTIVITY_WATCHDOG") {
 ScriptApp.deleteTrigger(triggers[i]);
 removed++;
 }
 }
 
 out.push(["1. Remove old", "Deleted " + removed + " trigger(s)", removed > 0 ? "OK" : "None found"]);
 
 // Step 2: Install new
 ScriptApp.newTrigger("ACTIVITY_WATCHDOG")
 .timeBased()
 .everyMinutes(1)
 .create();
 
 out.push(["2. Install new", "Created time-based trigger", "OK"]);
 out.push(["3. Interval", "Every 1 minute", ""]);
 
 // Step 3: Verify
 var newTriggers = ScriptApp.getProjectTriggers();
 var verified = false;
 for (var j = 0; j < newTriggers.length; j++) {
 if (newTriggers[j].getHandlerFunction() === "ACTIVITY_WATCHDOG") {
 verified = true;
 break;
 }
 }
 
 out.push(["4. Verify", verified ? "Trigger confirmed" : "NOT FOUND!", verified ? "OK" : "ERROR"]);
 
 out.push(["", "", ""]);
 out.push(["RESULT", verified ? "Watchdog reinstalled successfully" : "Installation failed", ""]);
 
 } catch (e) {
 out.push(["ERROR", e.message, ""]);
 out.push(["", "", ""]);
 out.push(["NOTE", "You may need to run this from the Apps Script editor", ""]);
 }
 
 return out;
}

// ============================================================
// HELPERS
// ============================================================

function _diag_fetchEvmNonce(wallet, rpc) {
 try {
 var payload = {
 jsonrpc: "2.0",
 id: 1,
 method: "eth_getTransactionCount",
 params: [wallet, "latest"]
 };
 
 var response = UrlFetchApp.fetch(rpc, {
 method: "post",
 contentType: "application/json",
 payload: JSON.stringify(payload),
 muteHttpExceptions: true
 });
 
 var json = JSON.parse(response.getContentText());
 
 if (json.result) {
 return parseInt(json.result, 16);
 }
 } catch (e) {}
 return null;
}

function _diag_directUpdateNonce(chain, wallet, nonce) {
 try {
 var props = PropertiesService.getScriptProperties();
 var key = "ACTIVITY_NONCE_MAP";
 var raw = props.getProperty(key);
 var map = raw ? JSON.parse(raw) : {};
 
 var entryKey = String(chain).toUpperCase() + ":" + String(wallet).toLowerCase();
 var existing = map[entryKey] || {};
 
 map[entryKey] = {
 nonce: nonce,
 lastCheck: Date.now(),
 lastActivity: existing.lastActivity || null,
 prevNonce: existing.nonce
 };
 
 props.setProperty(key, JSON.stringify(map));
 } catch (e) {}
}
