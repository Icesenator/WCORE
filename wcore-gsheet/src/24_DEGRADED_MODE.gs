/************************************************************
 * 24_DEGRADED_MODE.gs - Gestion du mode degrade (quota UrlFetch)
 * 
 * Version: v4.14.5
 *
 * Ce fichier gere le mode degrade quand le quota UrlFetch est epuise.
 * Au lieu de retourner #ERROR!, on retourne les donnees du cache
 * avec un message informatif.
 *
 * v4.14.5 - FIX: forceFull now overrides circuit breaker and quota check
 *   wrap() accepts forceFull parameter (6th arg) — when true, skips
 *   circuit breaker check so user can always force a fresh RPC scan.
 *   ChainFactory passes forceFull to wrap() for EVM, SVM, and Cosmos.
 *   All 3 engines skip testQuotaBlocked() when force=true.
 *
 * v4.13.5 - CONSOLIDATION:
 * - Removed quickHealthCheck() and 6 helpers (redundant with QuotaCircuitBreaker.testOnce)
 * - Simplified wrap() to circuit breaker check + try/catch only
 * - Removed deprecated isQuotaLikelyExhausted / _markQuotaExhausted
 * - Simplified getStatus() and resetCircuitBreaker()
 * - Engine entry already runs QCB.testOnce() via BaseEngine.testQuotaBlocked()
 * 
 * v1.5.2 - REFACTOR: getCachedWithDegradedInfo delegates to engine
 * v1.5.0 - AUTO-RECOVERY: Detection automatique du retour du quota
 * v1.4.0 - CRITICAL FIX: GET_* and CACHED_* output consistency
 * v1.3.0 - ChainName mapping + CACHED_* support
 * v1.2.0 - CRITICAL FIX: Prevent "Exceeded maximum execution time"
 * 
 * FLOW (v4.13.5):
 * 1. Check circuit breaker (instant, no HTTP)
 *    -> If active: return cache immediately
 * 2. Execute normal function (engine does QCB.testOnce at entry)
 *    -> If error: handleError -> return cache
 * 
 ************************************************************/
var DEGRADED_MODE_VERSION = "4.15.33";

var DegradedMode = DegradedMode || {};

// v4.15.33: Suppression du breaker 2min redondant. DegradedMode
// delegue desormais a QuotaCircuitBreaker (03E) comme source unique.

// ============================================================
// CIRCUIT BREAKER (delegue a QuotaCircuitBreaker dans 03E)
// ============================================================

/**
 * Verifie si le circuit breaker est actif (quota recemment epuise)
 * v4.15.33: Delegue a QuotaCircuitBreaker.isTripped() — source unique
 * @returns {boolean} true si on doit skip les appels HTTP
 */
DegradedMode.isCircuitBreakerActive = function() {
  try {
    return !!(typeof QuotaCircuitBreaker !== 'undefined' && QuotaCircuitBreaker.isTripped && QuotaCircuitBreaker.isTripped());
  } catch (e) {
    return false;
  }
};

/**
 * Active le circuit breaker
 * v4.15.33: Delegue a QuotaCircuitBreaker.trip()
 */
DegradedMode.activateCircuitBreaker = function() {
  try {
    if (typeof QuotaCircuitBreaker !== 'undefined' && QuotaCircuitBreaker.trip) {
      QuotaCircuitBreaker.trip("degraded-mode");
    }
  } catch (e) {}
};

/**
 * Reinitialise le circuit breaker
 * v4.15.33: Delegue a QuotaCircuitBreaker.reset()
 */
DegradedMode.resetCircuitBreaker = function() {
  try {
    if (typeof QuotaCircuitBreaker !== 'undefined' && QuotaCircuitBreaker.reset) {
      QuotaCircuitBreaker.reset();
    }
  } catch (e) {}
};

// ============================================================
// ERROR DETECTION
// ============================================================

/**
 * Verifie si l'erreur est une erreur de quota UrlFetch
 * @param {Error|string} error - L'erreur capturee
 * @returns {boolean} true si c'est une erreur de quota
 */
DegradedMode.isQuotaError = function(error) {
 if (!error) return false;
 var msg = String(error.message || error).toLowerCase();
 return msg.indexOf('urlfetch') !== -1 || 
 msg.indexOf('service invoked too many times') !== -1 ||
 msg.indexOf('quota') !== -1 ||
 msg.indexOf('rate limit') !== -1 ||
 msg.indexOf('exceeded maximum execution time') !== -1;
};

// ============================================================
// WRAPPER (used by ChainFactory)
// ============================================================

/**
 * Wrapper pour les fonctions GET_WALLET_ASSETS_*
 * v4.13.5: Simplified - circuit breaker check + try/catch only
 *   Engine entry already runs QuotaCircuitBreaker.testOnce() for pre-detection
 * 
 * @param {Function} fn - La fonction a executer
 * @param {string} address - Adresse du wallet
 * @param {Object} config - Configuration
 * @param {Array} walletNames - Noms des wallets
 * @param {Object} engine - Engine (EvmEngine, SvmEngine, CosmosEngine) - optional
 * @param {boolean} forceFull - v4.14.5: If true, bypass circuit breaker to force fresh scan
 * @returns {Array} Resultat de la fonction ou cache en cas d'erreur de quota
 */
DegradedMode.wrap = function(fn, address, config, walletNames, engine, forceFull) {
 // STEP 1: Circuit breaker check - NO HTTP CALL
 // v4.14.5: forceFull overrides circuit breaker — user explicitly requested fresh data
 var force = (typeof Bool !== 'undefined') ? Bool.parse(forceFull) : (forceFull === true);
 if (!force && this.isCircuitBreakerActive()) {
 var chainName = this._getChainName(address, config, walletNames);
 return this.returnCacheOnly(address, config, chainName, "CIRCUIT_BREAKER_ACTIVE", engine, walletNames);
 }
 
 // STEP 2: Execute normally - engine's BaseEngine.testQuotaBlocked() 
 // handles real-time quota detection via QuotaCircuitBreaker.testOnce()
 try {
 return fn();
 } catch (e) {
 return this.handleError(e, address, config, walletNames, engine);
 }
};

// ============================================================
// ERROR HANDLING & CACHE FALLBACK
// ============================================================

/**
 * Gere une erreur et retourne le cache si c'est une erreur de quota
 * 
 * @param {Error} error - L'erreur capturee
 * @param {string} address - Adresse du wallet
 * @param {Object} config - Configuration de la chaine
 * @param {Array} walletNames - Noms des wallets (optionnel)
 * @param {Object} engine - Engine (EvmEngine, SvmEngine, etc.) - optional
 * @returns {Array} Output formate avec donnees du cache ou erreur
 */
DegradedMode.handleError = function(error, address, config, walletNames, engine) {
 var chainName = DegradedMode._getChainName(address, config, walletNames);
 
 // Si c'est une erreur de quota, activer le circuit breaker
 if (this.isQuotaError(error)) {
 this.activateCircuitBreaker();
 }
 
 // Toujours essayer de retourner le cache en cas d'erreur
 var reason = this.isQuotaError(error) 
 ? "QUOTA_URLFETCH_EXCEEDED" 
 : "Exception: " + (error.message || String(error)).substring(0, 200);
 
 try {
 return this.returnCacheOnly(address, config, chainName, reason, engine, walletNames);
 } catch (e) {
 // Si meme le cache echoue, retourner une erreur propre
 return OutputBuilder.error(chainName, String(error.message || error), config);
 }
};

/**
 * Retourne uniquement les donnees du cache avec un message informatif
 * 
 * @param {string} address - Adresse du wallet
 * @param {Object} config - Configuration de la chaine
 * @param {string} chainName - Nom de la chaine
 * @param {string} reason - Raison du mode degrade
 * @param {Object} engine - Engine (EvmEngine, SvmEngine, etc.) - optional
 * @param {Array} walletNames - Noms des wallets - optional
 * @returns {Array} Output formate
 */
DegradedMode.returnCacheOnly = function(address, config, chainName, reason, engine, walletNames) {
 var timer = createTimer(5000); // Timer minimal
 var isQuotaError = (reason === "QUOTA_URLFETCH_EXCEEDED" || 
 reason === "TIMEOUT_LIKELY_QUOTA" ||
 reason === "CIRCUIT_BREAKER_ACTIVE" ||
 reason === "RECENT_ERROR" ||
 reason === "REPEATED_ERRORS" ||
 reason === "EXECUTION_TIME_EXCEEDED");
 
 // Message utilisateur selon la raison
 var userMessage = "[!] MODE DEGRADE - Donnees du cache affichees.";
 if (reason === "QUOTA_URLFETCH_EXCEEDED") {
 userMessage = "[!] QUOTA URLFETCH EPUISE - Donnees du cache affichees. Reessayez dans 2-3 minutes.";
 } else if (reason === "TIMEOUT_LIKELY_QUOTA") {
 userMessage = "[!] TIMEOUT (quota probable) - Donnees du cache affichees. Reessayez dans 2-3 minutes.";
 } else if (reason === "CIRCUIT_BREAKER_ACTIVE") {
  userMessage = "[!] MODE PRUDENCE QUOTA - Cache affiche pour economiser Apps Script. Un scan WCORE Web peut quand meme mettre a jour si disponible.";
 } else if (reason === "RECENT_ERROR") {
 userMessage = "[!] ERREUR RECENTE DETECTEE - Donnees du cache affichees. Reessayez dans 30 secondes.";
 } else if (reason === "REPEATED_ERRORS") {
 userMessage = "[!] ERREURS REPETEES - Donnees du cache affichees. Reessayez dans 2 minutes.";
 } else if (reason === "EXECUTION_TIME_EXCEEDED") {
 userMessage = "[!] TEMPS D'EXECUTION DEPASSE - Donnees du cache affichees. Reessayez plus tard.";
 }
 
 // If engine is provided, delegate to it for correct cache key handling
 if (engine && typeof engine.getCachedWalletAssets === 'function') {
 try {
 var output = engine.getCachedWalletAssets(address, config, walletNames);
 if (output && output.length > 1) {
 // Check if it has real data (not an error)
 var hasData = false;
 for (var d = 1; d < output.length && d < 5; d++) {
 if (output[d] && output[d].length >= 4 && String(output[d][1] || "").indexOf("ERROR") === -1) {
 hasData = true;
 break;
 }
 }
 if (hasData) {
 return this._appendDegradedInfo(output, null, config, true);
 }
 }
 } catch (eEngine) {
 // Engine failed, fall through to manual cache loading
 }
 }
 
 try {
 // 1. Charger le cache sans faire d'appels HTTP
 CacheManager.init();
 var addr = Addr.normalize(address);
 var cache = WalletCache.load(addr, null, config);
 
 if (!cache || !cache.assets || cache.assets.length === 0) {
 // Pas de cache disponible - construire la sortie sans ecrire de cache vide.
 // Pendant BLOCKED_QUOTA, une lecture cache peut echouer temporairement:
 // ecrire une liste d'assets vide remplacerait une donnee utile par NO_CACHE.
 var emptyOutput = this._buildEmptyOutput(chainName, reason, timer, config, isQuotaError);
 return emptyOutput;
 }
 
 // 2. Construire la sortie a partir du cache
 var out = [OutputBuilder.headerRow()];
 var total = 0;
 var nativeSymbol = (config && config.CHAIN && config.CHAIN.NATIVE_SYMBOL) || "ETH";
 var nativeName = (config && config.CHAIN && config.CHAIN.NATIVE_NAME) || "Ether";
 var version = (config && config.VERSION) || "unknown";
 var fxRate = (cache.usd_to_eur_rate && Num.isValidPositive(cache.usd_to_eur_rate)) 
 ? cache.usd_to_eur_rate : 0.85;
 
 // Recuperer le priceMap du cache
 var priceMap = cache.priceMap || {};
 
 // Separer native et tokens
 var native = null;
 var tokens = [];
 for (var i = 0; i < cache.assets.length; i++) {
 var a = cache.assets[i];
 if (!a) continue;
 if (a.contract === "native") {
 native = a;
 } else {
 tokens.push(a);
 }
 }
 
 // Creer native si absent
 if (!native) {
 native = { contract: "native", symbol: nativeSymbol, name: nativeName, balance: 0 };
 }
 native.symbol = native.symbol || nativeSymbol;
 native.name = native.name || nativeName;
 
 // Ajouter le token natif
 var nativePriceKey = (config && config.KEYS && config.KEYS.NATIVE_PRICE) || "native";
 var nativePrice = priceMap[nativePriceKey] || priceMap["native"] || native.price_eur || 0;
 var nativeRow = OutputBuilder.assetRow(chainName, native, nativePrice);
 out.push(nativeRow);
 if (Num.isValidPositive(nativeRow[6])) total += nativeRow[6];
 
 // Ajouter les tokens
 for (var j = 0; j < tokens.length; j++) {
 var token = tokens[j];
 if (!token || !Num.isPositive(token.balance)) continue;
 var key = Addr.normalize(token.contract);
 var price = priceMap[key] || token.price_eur || 0;
 var row = OutputBuilder.assetRow(chainName, token, price);
 out.push(row);
 if (Num.isValidPositive(row[6])) total += row[6];
 }
 
 // Trier par valeur decroissante
 if (out.length > 2) {
 var header = out[0];
 var dataRows = out.slice(1);
 dataRows.sort(function(a, b) {
 var va = Num.isValidPositive(a[6]) ? a[6] : 0;
 var vb = Num.isValidPositive(b[6]) ? b[6] : 0;
 return vb - va;
 });
 out = [header].concat(dataRows);
 }
 
 // Recalculer le total
 total = 0;
 for (var k = 1; k < out.length; k++) {
 if (Num.isValidPositive(out[k][6])) total += out[k][6];
 }
 
 // 3. Ajouter les lignes INFO
 
 // INFO_QUOTA - message special pour le quota
 if (isQuotaError) {
 out.push(OutputBuilder.infoRow(chainName, "INFO_QUOTA", userMessage));
 }
 
 // INFO_ROT
 var rotInfo = "rot=DEGRADED; profile=CACHE_ONLY; reason=" + reason;
 if (cache.rrCursor != null) rotInfo += "; rrCursor=" + cache.rrCursor;
 out.push(OutputBuilder.infoRow(chainName, "INFO_ROT", rotInfo));
 
 // INFO_NATIVE
 out.push(OutputBuilder.infoRow(chainName, "INFO_NATIVE", "cache-only | mode:DEGRADED"));
 
 // INFO_FX
 out.push(OutputBuilder.infoRow(chainName, "INFO_FX", "USD->EUR=" + fxRate.toFixed(4)));
 
 // INFO_TIMING
 out.push(OutputBuilder.infoRow(chainName, "INFO_TIMING", "bal=0ms; price=0ms (cache only)"));
 
 // INFO_TOTAL
 out.push(OutputBuilder.infoRow(chainName, "INFO_TOTAL", "Total portefeuille (sum value_eur).", "", "", "", total));
 
 // 4. META
 out.push(OutputBuilder.metaRow("last_update", Format.now()));
 out.push(OutputBuilder.metaRow("exec_ms", String(timer.elapsed())));
 out.push(OutputBuilder.metaRow("last_cache_update", WalletCache.getLastUpdateStr(cache)));
 out.push(OutputBuilder.metaRow("script_version", version + " [DEGRADED]"));
 
 // Save degraded state to cache so CACHED_* shows INFO_QUOTA
 try {
 var infoMetaRows = OutputBuilder.extractInfoMetaRows(out, chainName);
 cache.degraded_mode = true;
 cache.degraded_reason = reason;
 cache.degraded_message = userMessage;
 cache.degraded_at = Date.now();
 cache.lastInfoMetaRows = infoMetaRows;
 WalletCache.save(addr, cache, config);
 } catch (eSave) {
 // Ignore save errors - at least GET_* will show the correct output
 }
 
 return out;
 
 } catch (e) {
 // Meme le cache a echoue
 return this._buildEmptyOutput(chainName, "Cache error: " + (e.message || String(e)), timer, config, isQuotaError);
 }
};

// ============================================================
// OUTPUT BUILDERS (private)
// ============================================================

/**
 * Construit une sortie vide avec message d'erreur
 * @private
 */
DegradedMode._buildEmptyOutput = function(chainName, reason, timer, config, isQuotaError) {
 var version = (config && config.VERSION) || "unknown";
 var out = [OutputBuilder.headerRow()];
 
 // Ligne native vide
 var nativeSymbol = (config && config.CHAIN && config.CHAIN.NATIVE_SYMBOL) || "ETH";
 var nativeName = (config && config.CHAIN && config.CHAIN.NATIVE_NAME) || "Ether";
 out.push([chainName, nativeSymbol, nativeName, "native", 0, "", ""]);
 
 // Message de quota si applicable
 if (isQuotaError) {
 var emptyMsg = "[!] MODE DEGRADE - Aucune donnee en cache.";
 if (reason === "QUOTA_URLFETCH_EXCEEDED") {
 emptyMsg = "[!] QUOTA URLFETCH EPUISE - Aucune donnee en cache. Reessayez dans 2-3 minutes.";
 } else if (reason === "TIMEOUT_LIKELY_QUOTA") {
 emptyMsg = "[!] TIMEOUT (quota probable) - Aucune donnee en cache. Reessayez dans 2-3 minutes.";
 } else if (reason === "CIRCUIT_BREAKER_ACTIVE") {
  emptyMsg = "[!] MODE PRUDENCE QUOTA - Aucun cache disponible. Attente auto avant nouvel appel Apps Script.";
 } else if (reason === "RECENT_ERROR") {
 emptyMsg = "[!] ERREUR RECENTE - Aucune donnee en cache. Reessayez dans 30 secondes.";
 } else if (reason === "REPEATED_ERRORS") {
 emptyMsg = "[!] ERREURS REPETEES - Aucune donnee en cache. Reessayez dans 2 minutes.";
 } else if (reason === "EXECUTION_TIME_EXCEEDED") {
 emptyMsg = "[!] TEMPS D'EXECUTION DEPASSE - Aucune donnee en cache.";
 }
 out.push(OutputBuilder.infoRow(chainName, "INFO_QUOTA", emptyMsg));
 }
 
 out.push(OutputBuilder.infoRow(chainName, "INFO_ROT", "rot=DEGRADED; profile=NO_CACHE; reason=" + reason));
 out.push(OutputBuilder.infoRow(chainName, "INFO_FX", "USD->EUR=N/A"));
 out.push(OutputBuilder.infoRow(chainName, "INFO_TOTAL", "Total portefeuille (sum value_eur).", "", "", "", 0));
 out.push(OutputBuilder.metaRow("last_update", Format.now()));
 out.push(OutputBuilder.metaRow("exec_ms", String(timer ? timer.elapsed() : 0)));
 out.push(OutputBuilder.metaRow("last_cache_update", "N/A"));
 out.push(OutputBuilder.metaRow("script_version", version + " [DEGRADED]"));
 
 return out;
};

/**
 * Sauvegarde un etat degrade minimal dans le cache
 * @private
 */
DegradedMode._saveDegradedState = function(addr, config, reason, userMessage) {
 try {
 var existing = WalletCache.load(addr, null, config);
 if (!existing || !existing.assets || existing.assets.length === 0) return;
 existing.degraded_mode = true;
 existing.degraded_reason = reason;
 existing.degraded_message = userMessage;
 existing.degraded_at = Date.now();
 existing.last_error = "DegradedMode: " + reason;
 existing.last_error_ts = Date.now();
 WalletCache.save(addr, existing, config);
 } catch (e) {}
};

/**
 * Sauvegarde un etat degrade avec les lignes INFO/META
 * @private
 */
DegradedMode._saveDegradedStateWithRows = function(addr, config, reason, userMessage, infoMetaRows) {
 try {
 var existing = WalletCache.load(addr, null, config);
 if (!existing || !existing.assets || existing.assets.length === 0) return;
 existing.degraded_mode = true;
 existing.degraded_reason = reason;
 existing.degraded_message = userMessage;
 existing.degraded_at = Date.now();
 existing.last_error = "DegradedMode: " + reason;
 existing.last_error_ts = Date.now();
 existing.lastInfoMetaRows = infoMetaRows;
 WalletCache.save(addr, existing, config);
 } catch (e) {}
};

/**
 * Obtient le nom de la chaine avec le mapping wallet
 * @private
 */
DegradedMode._getChainName = function(address, config, walletNames) {
 var chainLabel = (config && config.CHAIN && config.CHAIN.NAME) || "Unknown";
 
 if (!address) return chainLabel;
 
 try {
 // Methode 1: Utiliser WalletNames.get() si disponible
 if (typeof WalletNames !== 'undefined' && WalletNames && typeof WalletNames.get === 'function') {
 var result = WalletNames.get(address, chainLabel);
 if (result && result !== chainLabel) {
 return result;
 }
 }
 
 // Methode 2: Si walletNames est passe comme tableau (legacy/fallback)
 if (walletNames && Array.isArray(walletNames) && walletNames.length > 0) {
 var addr = Addr.normalize(address);
 for (var i = 0; i < walletNames.length; i++) {
 var row = walletNames[i];
 if (!row) continue;
 
 var wAddr = Array.isArray(row) ? row[0] : (row.address || row[0]);
 var wName = Array.isArray(row) ? row[1] : (row.name || row[1]);
 
 if (!wAddr) continue;
 
 var normalizedWAddr = Addr.normalize(String(wAddr));
 if (normalizedWAddr === addr && wName) {
 return String(wName).trim() + " - " + chainLabel;
 }
 }
 }
 
 // Methode 3: Si walletNames est un Range Google Sheets
 if (walletNames && typeof walletNames.getValues === 'function') {
 var data = walletNames.getValues();
 var addr = Addr.normalize(address);
 for (var j = 0; j < data.length; j++) {
 var row = data[j];
 if (!row || !row[0]) continue;
 var normalizedRowAddr = Addr.normalize(String(row[0]));
 if (normalizedRowAddr === addr && row[1]) {
 return String(row[1]).trim() + " - " + chainLabel;
 }
 }
 }
 } catch (e) {}
 
 return chainLabel;
};

// ============================================================
// CACHED_* SUPPORT
// ============================================================

/**
 * Retourne les donnees du cache avec infos de mode degrade si applicable
 * Utilise par CACHED_* (via ChainFactory)
 * 
 * @param {string} address - Adresse du wallet
 * @param {Object} config - Configuration
 * @param {Array} walletNames - Noms des wallets
 * @param {Object} engine - Engine (EvmEngine, SvmEngine, etc.)
 * @returns {Array} Output formate
 */
DegradedMode.getCachedWithDegradedInfo = function(address, config, walletNames, engine) {
 try {
 var circuitBreakerActive = this.isCircuitBreakerActive();
 
 // Always delegate to engine - it knows its own cache key format
 var output = engine.getCachedWalletAssets(address, config, walletNames);
 
 // If circuit breaker is active, add degraded info to the output
 if (circuitBreakerActive && output && output.length > 1) {
 var isErrorOutput = false;
 for (var i = 0; i < output.length && i < 5; i++) {
 if (output[i] && String(output[i][1] || "").indexOf("ERROR") !== -1) {
 isErrorOutput = true;
 break;
 }
 }
 
 if (!isErrorOutput) {
 return this._appendDegradedInfo(output, null, config, circuitBreakerActive);
 }
 
 var chainName = this._getChainName(address, config, walletNames);
 return this._buildCachedDegradedOutput(chainName, "CIRCUIT_BREAKER_ACTIVE", config, null);
 }
 
 return output;
 
 } catch (e) {
 try {
 return engine.getCachedWalletAssets(address, config, walletNames);
 } catch (e2) {
 var chainName = this._getChainName(address, config, walletNames);
 return this._buildCachedDegradedOutput(chainName, "ERROR: " + String(e.message || e).substring(0, 50), config, null);
 }
 }
};

/**
 * Construit une sortie CACHED avec infos de mode degrade
 * @private
 */
DegradedMode._buildCachedDegradedOutput = function(chainName, reason, config, cache) {
 var version = (config && config.VERSION) || "unknown";
 var out = [OutputBuilder.headerRow()];
 
 var nativeSymbol = (config && config.CHAIN && config.CHAIN.NATIVE_SYMBOL) || "ETH";
 var nativeName = (config && config.CHAIN && config.CHAIN.NATIVE_NAME) || "Ether";
 out.push([chainName, nativeSymbol, nativeName, "native", 0, "", ""]);
 
 // Use saved INFO/META rows if available for consistency with GET_*
 if (cache && cache.lastInfoMetaRows && cache.lastInfoMetaRows.length > 0) {
 for (var i = 0; i < cache.lastInfoMetaRows.length; i++) {
 var row = cache.lastInfoMetaRows[i];
 if (row) {
 out.push(row.slice(0));
 }
 }
 return out;
 }
 
 // Fallback: Generate default rows
 var msg = cache && cache.degraded_message 
 ? cache.degraded_message 
 : "[!] MODE DEGRADE - Aucune donnee disponible. Utilisez GET_* pour rafraichir.";
 out.push(OutputBuilder.infoRow(chainName, "INFO_QUOTA", msg));
 
 out.push(OutputBuilder.infoRow(chainName, "INFO_ROT", "rot=CACHED_DEGRADED; reason=" + reason));
 out.push(OutputBuilder.infoRow(chainName, "INFO_FX", "USD->EUR=N/A"));
 out.push(OutputBuilder.infoRow(chainName, "INFO_TOTAL", "Total portefeuille.", "", "", "", 0));
 
 var lastUpdate = cache && cache.degraded_at 
 ? new Date(cache.degraded_at).toISOString().replace("T", " ").substring(0, 19)
 : "N/A";
 out.push(OutputBuilder.metaRow("last_update", lastUpdate));
 out.push(OutputBuilder.metaRow("exec_ms", "0"));
 out.push(OutputBuilder.metaRow("last_cache_update", cache && cache.last_cache_update ? cache.last_cache_update : "N/A"));
 out.push(OutputBuilder.metaRow("script_version", version + " [CACHED_DEGRADED]"));
 
 return out;
};

/**
 * Ajoute les infos de mode degrade a une sortie normale
 * @private
 */
DegradedMode._appendDegradedInfo = function(output, cache, config, circuitBreakerActive) {
 if (!output || !output.length) return output;
 
 // Check if INFO_QUOTA already exists
 for (var q = 0; q < output.length; q++) {
 if (output[q] && output[q][1] === "INFO_QUOTA") {
 return output;
 }
 }
 
 // Find where to insert INFO_QUOTA (before INFO_ROT or at end of data)
 var insertIdx = -1;
 for (var i = 0; i < output.length; i++) {
 if (output[i] && output[i][1] === "INFO_ROT") {
 insertIdx = i;
 break;
 }
 }
 
 if (insertIdx === -1) {
 for (var j = 0; j < output.length; j++) {
 if (output[j] && output[j][0] === "META") {
 insertIdx = j;
 break;
 }
 }
 }
 
 if (insertIdx === -1) {
 insertIdx = output.length;
 }
 
 // Create INFO_QUOTA row
 var chainName = output[1] ? output[1][0] : "Unknown";
 var msg;
 
 if (circuitBreakerActive && (!cache || !cache.degraded_message)) {
  msg = "[!] MODE PRUDENCE QUOTA - Cache affiche pour economiser Apps Script. Un scan WCORE Web peut quand meme mettre a jour si disponible.";
 } else if (cache && cache.degraded_message) {
 msg = "[!] " + cache.degraded_message + " (donnees du cache affichees)";
 } else {
 msg = "[!] Mode degrade detecte lors du dernier refresh";
 }
 
 var infoQuotaRow = OutputBuilder.infoRow(chainName, "INFO_QUOTA", msg);
 output.splice(insertIdx, 0, infoQuotaRow);
 
 return output;
};

// ============================================================
// DIAGNOSTIC & RESET
// ============================================================

/**
 * Reinitialise le circuit breaker (pour debug)
 */
DegradedMode.resetCircuitBreaker = function() {
 try {
 var cache = CacheService.getScriptCache();
 cache.remove(this.CIRCUIT_BREAKER_KEY);
 // Clean orphan keys from previous versions
 cache.remove("WCORE_LAST_HTTP_ERROR");
 cache.remove("WCORE_HTTP_ERROR_COUNT");
 cache.remove("WCORE_RECOVERY_MODE");
 return "Circuit breaker reset OK";
 } catch (e) {
 return "Error: " + e.message;
 }
};

/**
 * Retourne le statut du mode degrade (pour debug)
 */
DegradedMode.getStatus = function() {
 var isActive = this.isCircuitBreakerActive();
 var remainingMs = 0;
 
 try {
 var cache = CacheService.getScriptCache();
 var flag = cache.get(this.CIRCUIT_BREAKER_KEY);
 if (flag) {
 var exhaustedAt = parseInt(flag, 10);
 if (isFinite(exhaustedAt)) {
 remainingMs = Math.max(0, this.CIRCUIT_BREAKER_MS - (Date.now() - exhaustedAt));
 }
 }
 } catch (e) {}
 
 return {
 circuitBreakerActive: isActive,
 remainingMs: remainingMs,
 remainingSec: Math.ceil(remainingMs / 1000),
 willSkipHttpCalls: isActive,
 recommendation: isActive 
 ? "Wait " + Math.ceil(remainingMs / 1000) + "s (auto-recovery at engine entry via QCB)"
 : "Normal operation"
 };
};
