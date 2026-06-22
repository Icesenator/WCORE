/************************************************************
 * 30_MISSING_TOKENS.gs - Missing Tokens Discovery Engine
 * 
 * Discovers tokens with value that are NOT in cache.
 * Uses Blockscout API (free, no API key required).
 * 
 * Version: v2.0.0 - Switched from Ankr to Blockscout
 * 
 * Usage:
 * GET_MISSING_WALLET_ASSETS_BASE(wallet)
 * GET_MISSING_WALLET_ASSETS_ETHEREUM(wallet)
 * 
 * Output format: Identical to GET_WALLET_ASSETS_*
 ************************************************************/

// ============================================================
// MODULE VERSION
// ============================================================
var MISSING_TOKENS_VERSION = "2.0.0";

// ============================================================
// CONFIGURATION
// ============================================================

var MISSING_TOKENS_CONFIG = {
 // Default threshold (overridden by Strat!BM1)
 DEFAULT_MIN_VALUE_EUR: 0.5,
 
 // Max pages to fetch (50 tokens per page)
 MAX_PAGES: 4,
 
 // Blockscout URLs per chain
 BLOCKSCOUT_URLS: {
 "BASE": "https://base.blockscout.com",
 "ETHEREUM": "https://eth.blockscout.com",
 "OPTIMISM": "https://optimism.blockscout.com",
 "ARBITRUM_ONE": "https://arbitrum.blockscout.com",
 "POLYGON": "https://polygon.blockscout.com",
 "GNOSIS": "https://gnosis.blockscout.com",
 "SCROLL": "https://scroll.blockscout.com",
 "ZKSYNC_ERA": "https://zksync.blockscout.com",
 "LINEA": "https://linea.blockscout.com",
 "CELO": "https://celo.blockscout.com",
 "AVALANCHE": "https://snowtrace.io",
 "BLAST": "https://blastscan.io"
 }
};

// ============================================================
// MAIN ENGINE
// ============================================================

var MissingTokensEngine = {
 
 VERSION: MISSING_TOKENS_VERSION,
 
 /**
 * Get missing wallet assets for a specific chain
 * @param {string} address - Wallet address
 * @param {string} tokensRange - (OPTIONAL) Not used, kept for compatibility
 * @param {Object} config - Chain configuration
 * @param {Object} walletNames - WalletNames object
 * @returns {Array} Standard WCORE output format
 */
 getMissingWalletAssets: function(address, tokensRange, config, walletNames) {
 var timer = createTimer(25000);
 var out = [OutputBuilder.headerRow()];
 
 try {
 // Normalize address
 var addrLower = Addr.normalize(address);
 if (!addrLower) {
 out.push(this._errorRow(config, "Invalid address"));
 return out;
 }
 
 // Get chain info
 var chainName = (config.CHAIN && config.CHAIN.NAME) || "UNKNOWN";
 var chainKey = this._getChainKey(config);
 
 // Check if chain is supported by Blockscout
 var blockscoutUrl = MISSING_TOKENS_CONFIG.BLOCKSCOUT_URLS[chainKey];
 if (!blockscoutUrl) {
 out.push(this._infoRow(chainName, "INFO_STATUS", "Chain not supported by Blockscout"));
 out.push(this._infoRow(chainName, "INFO_SUPPORTED", Object.keys(MISSING_TOKENS_CONFIG.BLOCKSCOUT_URLS).join(", ")));
 this._addMeta(out, timer);
 return out;
 }
 
 // Get minimum value threshold from Strat!BM1
 var minValueEur = this._getMinValueThreshold();
 
 // Get FX rate
 var fxRate = this._getFxRate();
 
 // Get existing cache
 var cache = null;
 if (typeof WalletCache !== "undefined" && WalletCache.load) {
 cache = WalletCache.load(addrLower, null, config);
 }
 
 // Build set of known contracts from cache
 var knownContracts = this._buildKnownContractsSet(cache);
 
 // Fetch ALL tokens from Blockscout (with pagination)
 var allTokens = this._fetchFromBlockscout(addrLower, blockscoutUrl, timer);
 
 if (!allTokens || allTokens.length === 0) {
 out.push(this._infoRow(chainName, "INFO_STATUS", "No tokens found via Blockscout"));
 this._addMeta(out, timer);
 return out;
 }
 
 // Filter missing tokens with value above threshold
 var missingTokens = [];
 var totalMissingValue = 0;
 
 for (var i = 0; i < allTokens.length; i++) {
 var token = allTokens[i];
 var contract = (token.contract || "").toLowerCase();
 if (!contract) continue;
 
 // Skip if already known
 if (knownContracts[contract]) continue;
 
 // Calculate value in EUR
 var valueEur = (token.valueUsd || 0) * fxRate;
 
 // Skip if below threshold
 if (valueEur < minValueEur) continue;
 
 missingTokens.push({
 symbol: token.symbol || "???",
 name: token.name || "",
 contract: contract,
 balance: token.balance || 0,
 decimals: token.decimals || 18,
 priceUsd: token.priceUsd || 0,
 priceEur: (token.priceUsd || 0) * fxRate,
 valueEur: valueEur
 });
 
 totalMissingValue += valueEur;
 }
 
 // Sort by value descending
 missingTokens.sort(function(a, b) { return b.valueEur - a.valueEur; });
 
 // Get wallet display name
 var walletDisplayName = chainName;
 if (walletNames && typeof walletNames.get === "function") {
 var wn = walletNames.get(addrLower);
 if (wn) walletDisplayName = wn + " - " + chainName;
 }
 
 // Build output rows
 for (var j = 0; j < missingTokens.length; j++) {
 var mt = missingTokens[j];
 out.push([
 walletDisplayName,
 mt.symbol,
 mt.name,
 mt.contract,
 mt.balance,
 mt.priceEur,
 mt.valueEur
 ]);
 }
 
 // Add info rows
 out.push(this._infoRow(chainName, "INFO_MISSING", "Found " + missingTokens.length + " missing tokens worth " + totalMissingValue.toFixed(2) + " EUR"));
 out.push(this._infoRow(chainName, "INFO_THRESHOLD", "Min value: " + minValueEur + " EUR"));
 out.push(this._infoRow(chainName, "INFO_BLOCKSCOUT", "Total tokens on chain: " + allTokens.length));
 out.push(this._infoRow(chainName, "INFO_CACHE", "Known tokens in cache: " + Object.keys(knownContracts).length));
 out.push(this._infoRow(chainName, "INFO_FX", "USD->EUR=" + fxRate.toFixed(4)));
 
 // Add META rows
 this._addMeta(out, timer);
 
 } catch (e) {
 out.push(this._errorRow(config, "Error: " + e.message));
 this._addMeta(out, timer);
 }
 
 return out;
 },
 
 // ============================================================
 // BLOCKSCOUT API
 // ============================================================
 
 /**
 * Fetch all tokens from Blockscout for a wallet (with pagination)
 */
 _fetchFromBlockscout: function(address, baseUrl, timer) {
 var allTokens = [];
 var nextPageParams = null;
 var pageCount = 0;
 
 try {
 while (pageCount < MISSING_TOKENS_CONFIG.MAX_PAGES) {
 // Check time budget
 if (timer && timer.remaining && timer.remaining() < 3000) break;
 
 // Build URL
 var url = baseUrl + "/api/v2/addresses/" + address + "/tokens?type=ERC-20";
 if (nextPageParams) {
 // Add pagination params
 var params = [];
 for (var key in nextPageParams) {
 params.push(encodeURIComponent(key) + "=" + encodeURIComponent(nextPageParams[key]));
 }
 url += "&" + params.join("&");
 }
 
 var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
 
 if (response.getResponseCode() !== 200) {
 Logger.log("Blockscout API error: " + response.getResponseCode());
 break;
 }
 
 var data = JSON.parse(response.getContentText());
 var items = data.items || [];
 
 // Process tokens
 for (var i = 0; i < items.length; i++) {
 var item = items[i];
 var token = item.token || {};
 var decimals = parseInt(token.decimals) || 18;
 var rawBalance = item.value || "0";
 var balance = parseFloat(rawBalance) / Math.pow(10, decimals);
 
 // Skip zero balances
 if (balance <= 0) continue;
 
 // Get price from exchange_rate
 var priceUsd = parseFloat(token.exchange_rate) || 0;
 var valueUsd = balance * priceUsd;
 
 allTokens.push({
 symbol: token.symbol || "",
 name: token.name || "",
 contract: (token.address || "").toLowerCase(),
 balance: balance,
 decimals: decimals,
 priceUsd: priceUsd,
 valueUsd: valueUsd
 });
 }
 
 pageCount++;
 
 // Check for more pages
 if (data.next_page_params) {
 nextPageParams = data.next_page_params;
 } else {
 break;
 }
 }
 
 } catch (e) {
 Logger.log("_fetchFromBlockscout error: " + e.message);
 }
 
 return allTokens;
 },
 
 // ============================================================
 // HELPERS
 // ============================================================
 
 /**
 * Get chain key from config
 */
 _getChainKey: function(config) {
 // Try multiple sources
 if (config.KEYS && config.KEYS.CHAIN) return config.KEYS.CHAIN;
 if (config.CHAIN && config.CHAIN.NAME) {
 return config.CHAIN.NAME.toUpperCase().replace(/[^A-Z0-9]/g, "_");
 }
 return "UNKNOWN";
 },
 
 /**
 * Get minimum value threshold from Strat!BM1
 */
 _getMinValueThreshold: function() {
 try {
 var ss = SpreadsheetApp.getActive();
 if (!ss) return MISSING_TOKENS_CONFIG.DEFAULT_MIN_VALUE_EUR;
 
 var sheet = ss.getSheetByName("Strat");
 if (!sheet) return MISSING_TOKENS_CONFIG.DEFAULT_MIN_VALUE_EUR;
 
 var value = sheet.getRange("BM1").getValue();
 var num = parseFloat(value);
 
 return (isNaN(num) || num < 0) ? MISSING_TOKENS_CONFIG.DEFAULT_MIN_VALUE_EUR : num;
 } catch (e) {
 return MISSING_TOKENS_CONFIG.DEFAULT_MIN_VALUE_EUR;
 }
 },
 
 /**
 * Build set of known contracts from cache
 */
 _buildKnownContractsSet: function(cache) {
 var known = {};
 
 // Add native
 known["native"] = true;
 
 // Add from cache
 if (cache && cache.assets) {
 for (var j = 0; j < cache.assets.length; j++) {
 var asset = cache.assets[j];
 if (!asset) continue;
 
 var contract = (asset.contract || "").toLowerCase();
 if (contract === "native" || !contract) {
 known["native"] = true;
 } else {
 known[contract] = true;
 }
 }
 }
 
 return known;
 },
 
 /**
 * Get FX rate (USD to EUR)
 */
 _getFxRate: function() {
 try {
 if (typeof getFxRate === "function") {
 return getFxRate() || 0.84;
 }
 if (typeof FxCache !== "undefined" && FxCache.getRate) {
 return FxCache.getRate() || 0.84;
 }
 } catch (e) {}
 return 0.84; // Default fallback
 },
 
 /**
 * Create info row
 */
 _infoRow: function(chainName, key, value) {
 return [chainName, key, value, "", "", "", ""];
 },
 
 /**
 * Create error row
 */
 _errorRow: function(config, message) {
 var chainName = (config && config.CHAIN && config.CHAIN.NAME) || "UNKNOWN";
 return [chainName, "ERROR", message, "", "", "", ""];
 },
 
 /**
 * Add META rows
 */
 _addMeta: function(out, timer) {
 var execMs = timer && timer.elapsed ? timer.elapsed() : 0;
 out.push(["META", "last_update", new Date().toISOString().replace("T", " ").substring(0, 19), "", "", "", ""]);
 out.push(["META", "exec_ms", execMs, "", "", "", ""]);
 out.push(["META", "script_version", MISSING_TOKENS_VERSION, "", "", "", ""]);
 out.push(["META", "engine_version", "MissingTokens_v" + MISSING_TOKENS_VERSION, "", "", "", ""]);
 }
};
