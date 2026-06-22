/************************************************************
 * 13C_DIAG_TOKEN.gs - Token and balance diagnostics
 * 
 * Version: v4.12.9 (cleanup)
 * 
 * CONSOLIDATED FROM:
 * - DIAG_METADATA.gs
 * - DIAG_META_SAVE_TRACE.gs
 * - DIAG_MISSING_TOKEN.gs
 * - DIAG_TOKEN_META.gs
 * - DIAG_TOKEN_POSITION.gs
 * - DIAG_ZOMBIE_TRACE.gs
 ************************************************************/


// ============================================================
// FROM: DIAG_METADATA.gs
// ============================================================
function DIAG_MISSING_METADATA() {
 var config = _BASE.getConfig();
 var wallet = "0x17d518736ee9341dcdc0a2498e013d33cfcdd080";
 
 // Tokens problematiques
 var problemTokens = [
 "0xa973bc7ff3a4b05a8fde036b33a4431e3bc582c4",
 "0x8da2a47f76d928a97a8f44498db25aa787198087",
 "0x514d8e8099286a13486ef6c525c120f51c239b52",
 "0x1d008f50fb828ef9debbbeae1b71fffe929bf317",
 "0xe5e92cfa14408202a343976ad11e743b492a04bb",
 "0x70067c280f979da32a5df8efe9e62c65f86a2eef",
 "0x1111111111166b7fe7bd91427724b487980afc69",
 "0x98d0baa52b2d063e780de12f615f963fe8537553",
 "0xb3b32f9f8827d4634fe7d973fa1034ec9fddb3b3",
 "0xba72b8e600145e8d254bd565241a935b130f0112",
 "0xb58372a5bb18e10229e680d8bcc4201ca3c98301"
 ];
 
 var rows = [["Token (short)", "Source", "Symbol", "Name", "Price EUR", "Notes"]];
 
 // 1. Load caches
 var metaMap = {};
 try { metaMap = MetaCache.load(null, config) || {}; } catch(e) {}
 
 var walletCache = {};
 try { walletCache = WalletCache.load(wallet, config) || {}; } catch(e) {}
 
 var l1Cache = CacheService.getScriptCache();
 var chainKey = "8453"; // Base chain ID
 
 for (var i = 0; i < problemTokens.length; i++) {
 var token = problemTokens[i].toLowerCase();
 var shortToken = token.substring(0, 10) + "...";
 
 // Check MetaCache
 var metaSym = "", metaName = "";
 if (metaMap[token]) {
 metaSym = metaMap[token].symbol || "";
 metaName = metaMap[token].name || "";
 }
 if (metaSym || metaName) {
 rows.push([shortToken, "MetaCache", metaSym || "(empty)", metaName || "(empty)", "-", "Found in MetaCache"]);
 continue;
 }
 
 // Check WalletCache assets
 var walletSym = "", walletName = "", walletPrice = "";
 if (walletCache.assets) {
 for (var j = 0; j < walletCache.assets.length; j++) {
 var a = walletCache.assets[j];
 if (a && Addr.normalize(a.contract) === token) {
 walletSym = a.symbol || "";
 walletName = a.name || "";
 walletPrice = a.price_eur ? a.price_eur.toFixed(8) : "";
 break;
 }
 }
 }
 if (walletSym || walletName) {
 rows.push([shortToken, "WalletCache", walletSym || "(empty)", walletName || "(empty)", walletPrice, "Found in WalletCache"]);
 continue;
 }
 
 // Check L1 DexScreener cache
 var dexL1Key = "DEX:" + chainKey + ":" + token;
 var l1Sym = "", l1Name = "", l1Price = "";
 try {
 var raw = l1Cache.get(dexL1Key);
 if (raw) {
 var data = JSON.parse(raw);
 l1Sym = data.s || "";
 l1Name = data.n || "";
 l1Price = data.u ? (data.u * 0.8453).toFixed(8) : "";
 }
 } catch(e) {}
 
 if (l1Sym || l1Name || l1Price) {
 rows.push([shortToken, "L1 Cache", l1Sym || "(null)", l1Name || "(null)", l1Price, "Key: " + dexL1Key]);
 continue;
 }
 
 // Check priceMap
 var priceMapVal = "";
 if (walletCache.priceMap && walletCache.priceMap[token]) {
 priceMapVal = walletCache.priceMap[token].toFixed(8);
 }
 
 // Try GeckoTerminal API directly
 var gtSym = "", gtName = "";
 try {
 var gtUrl = "https://api.geckoterminal.com/api/v2/networks/base/tokens/" + token;
 var gtResp = UrlFetchApp.fetch(gtUrl, { muteHttpExceptions: true, headers: { accept: 'application/json' } });
 if (gtResp.getResponseCode() === 200) {
 var gtJson = JSON.parse(gtResp.getContentText());
 if (gtJson && gtJson.data && gtJson.data.attributes) {
 gtSym = gtJson.data.attributes.symbol || "";
 gtName = gtJson.data.attributes.name || "";
 }
 }
 } catch(e) {}
 
 if (gtSym || gtName) {
 rows.push([shortToken, "GeckoTerminal API", gtSym, gtName, priceMapVal, "Fresh API call"]);
 } else {
 rows.push([shortToken, "NOT FOUND", "", "", priceMapVal, "No metadata anywhere!"]);
 }
 }
 
 // Add summary
 rows.push([""]);
 rows.push(["=== CACHE SUMMARY ==="]);
 rows.push(["MetaCache keys", Object.keys(metaMap).length]);
 rows.push(["WalletCache assets", (walletCache.assets || []).length]);
 rows.push(["PriceMap keys", Object.keys(walletCache.priceMap || {}).length]);
 
 return rows;
}

/**
 * Force fetch metadata from GeckoTerminal for problem tokens and save to MetaCache
 */
function FIX_MISSING_METADATA() {
 var config = _BASE.getConfig();
 
 var problemTokens = [
 "0xa973bc7ff3a4b05a8fde036b33a4431e3bc582c4",
 "0x8da2a47f76d928a97a8f44498db25aa787198087",
 "0x514d8e8099286a13486ef6c525c120f51c239b52",
 "0x1d008f50fb828ef9debbbeae1b71fffe929bf317",
 "0xe5e92cfa14408202a343976ad11e743b492a04bb",
 "0x70067c280f979da32a5df8efe9e62c65f86a2eef",
 "0x1111111111166b7fe7bd91427724b487980afc69",
 "0x98d0baa52b2d063e780de12f615f963fe8537553",
 "0xb3b32f9f8827d4634fe7d973fa1034ec9fddb3b3",
 "0xba72b8e600145e8d254bd565241a935b130f0112",
 "0xb58372a5bb18e10229e680d8bcc4201ca3c98301"
 ];
 
 var metaMap = {};
 try { metaMap = MetaCache.load(null, config) || {}; } catch(e) { metaMap = {}; }
 
 var rows = [["Token", "Symbol", "Name", "Status"]];
 var fixed = 0;
 
 for (var i = 0; i < problemTokens.length; i++) {
 var token = problemTokens[i].toLowerCase();
 
 // Skip if already has metadata
 if (metaMap[token] && metaMap[token].symbol && metaMap[token].name) {
 rows.push([token.substring(0, 10) + "...", metaMap[token].symbol, metaMap[token].name, "Already OK"]);
 continue;
 }
 
 // Fetch from GeckoTerminal
 try {
 var gtUrl = "https://api.geckoterminal.com/api/v2/networks/base/tokens/" + token;
 var gtResp = UrlFetchApp.fetch(gtUrl, { muteHttpExceptions: true, headers: { accept: 'application/json' } });
 
 if (gtResp.getResponseCode() === 200) {
 var gtJson = JSON.parse(gtResp.getContentText());
 if (gtJson && gtJson.data && gtJson.data.attributes) {
 var sym = gtJson.data.attributes.symbol || "";
 var nm = gtJson.data.attributes.name || "";
 
 if (sym || nm) {
 if (!metaMap[token]) metaMap[token] = {};
 metaMap[token].symbol = sym;
 metaMap[token].name = nm;
 metaMap[token].lastSeenMs = Date.now();
 rows.push([token.substring(0, 10) + "...", sym, nm, "FIXED"]);
 fixed++;
 } else {
 rows.push([token.substring(0, 10) + "...", "", "", "No data in GT"]);
 }
 }
 } else {
 rows.push([token.substring(0, 10) + "...", "", "", "GT error: " + gtResp.getResponseCode()]);
 }
 } catch(e) {
 rows.push([token.substring(0, 10) + "...", "", "", "Error: " + e.message]);
 }
 
 Utilities.sleep(300); // Rate limit
 }
 
 // Save MetaCache directly without filtering
 if (fixed > 0) {
 try {
 CacheManager.init();
 var key = (config && config.KEYS && config.KEYS.META) ? String(config.KEYS.META) : "META_CACHE";
 var ttlSeconds = 604800; // 7 days
 CacheManager.safeSetJson(key, metaMap, config, ttlSeconds);
 rows.push([""]);
 rows.push(["SAVED", fixed + " tokens fixed", "MetaCache now has " + Object.keys(metaMap).length + " keys", ""]);
 } catch(e) {
 rows.push(["SAVE ERROR", e.message, "", ""]);
 }
 }
 
 return rows;
}

// ============================================================
// FROM: DIAG_META_SAVE_TRACE.gs
// ============================================================
function DIAG_META_SAVE_TRACE_BASE() {
 var out = [["Step", "Value", "Details"]];
 
 var wallet = "0x17d518736ee9341dcdc0a2498e013d33cfcdd080";
 var testToken = "0xb3b32f9f8827d4634fe7d973fa1034ec9fddb3b3"; // B3
 
 try {
 var config = _BASE.getConfig();
 var timer = createTimer(25000);
 
 // 1. Load current cache
 out.push(["=== BEFORE ===", "", ""]);
 var cacheBefore = WalletCache.load(wallet, null, config);
 
 var assetBefore = null;
 if (cacheBefore && cacheBefore.assets) {
 for (var i = 0; i < cacheBefore.assets.length; i++) {
 if (cacheBefore.assets[i].contract && 
 cacheBefore.assets[i].contract.toLowerCase() === testToken) {
 assetBefore = cacheBefore.assets[i];
 break;
 }
 }
 }
 
 if (assetBefore) {
 out.push(["Cache.symbol BEFORE", assetBefore.symbol || "(empty)", ""]);
 out.push(["Cache.name BEFORE", assetBefore.name || "(empty)", ""]);
 } else {
 out.push(["Token in cache BEFORE", "NOT FOUND", ""]);
 }
 
 // 2. Check L1 DexScreener cache
 out.push(["", "", ""]);
 out.push(["=== L1 DEXSCREENER CACHE ===", "", ""]);
 var l1 = CacheService.getScriptCache();
 var chainKey = "8453";
 var dexKey = "DEX:" + chainKey + ":" + testToken;
 var dexRaw = l1.get(dexKey);
 if (dexRaw) {
 var dexData = JSON.parse(dexRaw);
 out.push(["L1 DexScreener symbol", dexData.s || "(empty)", ""]);
 out.push(["L1 DexScreener name", dexData.n || "(empty)", ""]);
 } else {
 out.push(["L1 DexScreener", "NOT IN CACHE", ""]);
 }
 
 // 3. Check MetaCache
 out.push(["", "", ""]);
 out.push(["=== METACACHE ===", "", ""]);
 var metaMap = MetaCache.load(timer, config);
 if (metaMap && metaMap[testToken]) {
 out.push(["MetaCache symbol", metaMap[testToken].symbol || "(empty)", ""]);
 out.push(["MetaCache name", metaMap[testToken].name || "(empty)", ""]);
 } else {
 out.push(["MetaCache", "NOT IN CACHE", ""]);
 }
 
 // 4. Test GeckoTerminal API directly
 out.push(["", "", ""]);
 out.push(["=== GECKOTERMINAL API ===", "", ""]);
 var gtMeta = PriceSources.getGeckoTerminalMeta(testToken, timer, config);
 if (gtMeta) {
 out.push(["GT API symbol", gtMeta.symbol || "(empty)", ""]);
 out.push(["GT API name", gtMeta.name || "(empty)", ""]);
 } else {
 out.push(["GT API", "NULL returned", ""]);
 }
 
 // 5. Simulate what enrichment does
 out.push(["", "", ""]);
 out.push(["=== ENRICHMENT SIMULATION ===", "", ""]);
 
 // Create a test asset
 var testAsset = { 
 contract: testToken, 
 symbol: "", 
 name: "", 
 balance: 472 
 };
 
 out.push(["testAsset.symbol BEFORE", testAsset.symbol || "(empty)", ""]);
 
 // Try L1 enrichment
 if (dexRaw) {
 var dexData2 = JSON.parse(dexRaw);
 if (!testAsset.symbol && dexData2.s) testAsset.symbol = dexData2.s;
 if (!testAsset.name && dexData2.n) testAsset.name = dexData2.n;
 out.push(["After L1 enrichment", testAsset.symbol || "(still empty)", ""]);
 }
 
 // Try GT enrichment
 if ((!testAsset.symbol || !testAsset.name) && gtMeta) {
 if (!testAsset.symbol && gtMeta.symbol) testAsset.symbol = gtMeta.symbol;
 if (!testAsset.name && gtMeta.name) testAsset.name = gtMeta.name;
 out.push(["After GT enrichment", testAsset.symbol || "(still empty)", ""]);
 }
 
 out.push(["testAsset.symbol FINAL", testAsset.symbol || "(empty)", ""]);
 out.push(["testAsset.name FINAL", testAsset.name || "(empty)", ""]);
 
 // 6. Check timer condition
 out.push(["", "", ""]);
 out.push(["=== TIMER CHECK ===", "", ""]);
 out.push(["timer.remaining()", timer.remaining() + "ms", ""]);
 out.push(["timer.isLow(800)", timer.isLow(800) ? "YES (skip GT!)" : "NO (GT allowed)", ""]);
 
 // 7. Now manually save to cache and verify
 out.push(["", "", ""]);
 out.push(["=== MANUAL SAVE TEST ===", "", ""]);
 
 if (testAsset.symbol && cacheBefore) {
 // Find and update the asset in cache
 var found = false;
 for (var j = 0; j < cacheBefore.assets.length; j++) {
 if (cacheBefore.assets[j].contract && 
 cacheBefore.assets[j].contract.toLowerCase() === testToken) {
 cacheBefore.assets[j].symbol = testAsset.symbol;
 cacheBefore.assets[j].name = testAsset.name;
 found = true;
 break;
 }
 }
 
 if (found) {
 // Save the modified cache
 WalletCache.save(wallet, cacheBefore, config);
 out.push(["Manual save", "DONE", ""]);
 
 // Verify
 var cacheAfter = WalletCache.load(wallet, null, config);
 var assetAfter = null;
 for (var k = 0; k < cacheAfter.assets.length; k++) {
 if (cacheAfter.assets[k].contract && 
 cacheAfter.assets[k].contract.toLowerCase() === testToken) {
 assetAfter = cacheAfter.assets[k];
 break;
 }
 }
 
 if (assetAfter) {
 out.push(["Cache.symbol AFTER", assetAfter.symbol || "(empty)", ""]);
 out.push(["Cache.name AFTER", assetAfter.name || "(empty)", ""]);
 
 if (assetAfter.symbol && assetAfter.name) {
 out.push(["RESULT", "SUCCESS - Metadata now saved!", ""]);
 } else {
 out.push(["RESULT", "FAILED - Still empty", ""]);
 }
 }
 } else {
 out.push(["Manual save", "Token not found in cache", ""]);
 }
 } else {
 out.push(["Manual save", "SKIPPED - No metadata to save", ""]);
 }
 
 } catch (e) {
 out.push(["FATAL ERROR", e.message, e.stack ? e.stack.substring(0, 200) : ""]);
 }
 
 return out;
}

// ============================================================
// FROM: DIAG_MISSING_TOKEN.gs
// ============================================================
function DIAG_TOKEN_0xeA6b_RPC() {
 var wallet = "0x6a3530ad9e5b1779de37f5e6af82999c325ea3f7";
 var token = "0xeA6b729919DB1ea6b046b722B1869EF746fa5d90";
 return TokenDiag.checkTokenBalance(BASE_CONFIG, wallet, token);
}

/**
 * 2. Comparer les resultats entre tous les RPCs
 */
function DIAG_TOKEN_0xeA6b_COMPARE_RPCS() {
 var wallet = "0x6a3530ad9e5b1779de37f5e6af82999c325ea3f7";
 var token = "0xeA6b729919DB1ea6b046b722B1869EF746fa5d90";
 return TokenDiag.compareRpcs(BASE_CONFIG, wallet, token);
}

/**
 * 3. Verifier l'etat du token dans le cache
 */
function DIAG_TOKEN_0xeA6b_CACHE_STATUS() {
 var wallet = "0x6a3530ad9e5b1779de37f5e6af82999c325ea3f7";
 var token = Addr.normalize("0xeA6b729919DB1ea6b046b722B1869EF746fa5d90");
 
 var out = [["Metric", "Value", "Details"]];
 out.push(["Token", token, ""]);
 out.push(["Wallet", wallet, ""]);
 out.push(["", "", ""]);
 
 try {
 CacheManager.init();
 var timer = createTimer(15000);
 var cache = WalletCache.load(Addr.normalize(wallet), timer, BASE_CONFIG);
 
 if (!cache) {
 out.push(["Cache", "NOT FOUND", "No cache for this wallet"]);
 return out;
 }
 
 out.push(["Cache.version", cache.version || "?", ""]);
 out.push(["Cache.updatedAt", cache.updatedAt ? new Date(cache.updatedAt).toISOString() : "?", ""]);
 out.push(["", "", ""]);
 
 // Verifier si le token est dans assets
 var inAssets = false;
 var assetBalance = null;
 if (cache.assets && cache.assets.length) {
 for (var i = 0; i < cache.assets.length; i++) {
 var a = cache.assets[i];
 if (a && Addr.normalize(a.contract) === token) {
 inAssets = true;
 assetBalance = a.balance;
 break;
 }
 }
 }
 out.push(["In cache.assets?", inAssets ? "YES" : "NO", inAssets ? "Balance: " + assetBalance : "Token NOT in cached assets"]);
 
 // Verifier balanceTsMap
 var balanceTs = (cache.balanceTsMap && cache.balanceTsMap[token]) || null;
 out.push(["balanceTsMap[token]", balanceTs ? new Date(balanceTs).toISOString() : "NEVER SCANNED", balanceTs ? "Last scan timestamp" : "Token never scanned!"]);
 
 // Verifier attemptTsMap
 var attemptTs = (cache.attemptTsMap && cache.attemptTsMap[token]) || null;
 out.push(["attemptTsMap[token]", attemptTs ? new Date(attemptTs).toISOString() : "NO ATTEMPT", attemptTs ? "Last attempt timestamp" : ""]);
 
 // Verifier purgedTsMap
 var purgedTs = (cache.purgedTsMap && cache.purgedTsMap[token]) || null;
 out.push(["purgedTsMap[token]", purgedTs ? new Date(purgedTs).toISOString() : "NOT PURGED", purgedTs ? "TOKEN WAS PURGED!" : ""]);
 
 // Verifier priceMap
 var price = (cache.priceMap && cache.priceMap[token]) || null;
 out.push(["priceMap[token]", price || "NO PRICE", price ? "EUR price cached" : ""]);
 
 // Position dans le round-robin
 out.push(["", "", ""]);
 out.push(["rrCursor", cache.rrCursor || 0, "Current round-robin position"]);
 
 // Determiner la position du token dans otherContracts
 // (tokens sans balance connue sont scannes en round-robin)
 out.push(["", "", ""]);
 out.push(["=== DIAGNOSIS ===", "", ""]);
 
 if (purgedTs) {
 out.push(["PROBLEM", "TOKEN WAS PURGED", "Balance was detected as 0 at " + new Date(purgedTs).toISOString()]);
 out.push(["SOLUTION", "Clear purgedTsMap or force full scan", "See function below"]);
 } else if (!balanceTs) {
 out.push(["PROBLEM", "TOKEN NEVER SCANNED", "Round-robin hasn't reached this token yet"]);
 out.push(["SOLUTION", "Run DIAG_FORCE_SCAN_TOKEN() below", ""]);
 } else if (!inAssets) {
 out.push(["PROBLEM", "TOKEN SCANNED BUT NOT IN ASSETS", "Balance was 0 or scan failed"]);
 out.push(["SOLUTION", "Run DIAG_TOKEN_0xeA6b_RPC() to verify RPC response", ""]);
 }
 
 } catch (e) {
 out.push(["ERROR", e.message, e.stack ? e.stack.substring(0, 100) : ""]);
 }
 
 return out;
}

/**
 * 4. Forcer le scan de ce token specifique (PRIORITY)
 */
function DIAG_FORCE_SCAN_TOKEN_0xeA6b() {
 var wallet = "0x6a3530ad9e5b1779de37f5e6af82999c325ea3f7";
 var token = "0xeA6b729919DB1ea6b046b722B1869EF746fa5d90";
 var tokenNorm = Addr.normalize(token);
 
 var out = [["Step", "Result", "Details"]];
 out.push(["Token", tokenNorm, ""]);
 out.push(["Wallet", wallet, ""]);
 
 try {
 CacheManager.init();
 var timer = createTimer(20000);
 var config = BASE_CONFIG;
 var walletNorm = Addr.normalize(wallet);
 
 // 1. Charger le cache existant
 var cache = WalletCache.load(walletNorm, timer, config);
 var assetByKey = {};
 var balanceTsMap = {};
 var attemptTsMap = {};
 var purgedTsMap = {};
 var metaMap = {};
 var nowMs = Date.now();
 
 if (cache) {
 // Restaurer les assets existants
 if (cache.assets) {
 for (var i = 0; i < cache.assets.length; i++) {
 var a = cache.assets[i];
 if (a && a.contract) {
 var k = (a.contract === "native") ? "native" : Addr.normalize(a.contract);
 assetByKey[k] = a;
 }
 }
 }
 balanceTsMap = cache.balanceTsMap || {};
 attemptTsMap = cache.attemptTsMap || {};
 purgedTsMap = cache.purgedTsMap || {};
 }
 
 out.push(["Cache loaded", cache ? "YES" : "NO", "Assets: " + Object.keys(assetByKey).length]);
 
 // 2. Supprimer le token du purgedTsMap si present
 if (purgedTsMap[tokenNorm]) {
 delete purgedTsMap[tokenNorm];
 out.push(["Removed from purgedTsMap", "YES", "Token was purged, now cleared"]);
 }
 
 // 3. Scanner ce token specifique avec PRIORITY (consensus RPC)
 var rpc = RpcSelector.pickBest(null, config);
 out.push(["RPC selected", rpc ? rpc.substring(0, 40) + "..." : "?", ""]);
 
 var budget = { allowMetaStrings: true };
 var scanned = BalanceFetcher.getErc20BalancesPriority(
 rpc, walletNorm, [tokenNorm], assetByKey, balanceTsMap, attemptTsMap, purgedTsMap, metaMap, nowMs, timer, budget, config
 );
 
 out.push(["Scan result", scanned + " token(s)", ""]);
 
 // 4. Verifier le resultat
 var asset = assetByKey[tokenNorm];
 if (asset && Num.isPositive(asset.balance)) {
 out.push(["BALANCE DETECTED", asset.balance, "SUCCESS!"]);
 out.push(["Symbol", asset.symbol || "?", ""]);
 out.push(["Name", asset.name || "?", ""]);
 
 // 5. Sauvegarder le cache mis ÃƒÂ  jour
 var assetsArray = AssetManager.toArray(assetByKey);
 var lastUpdateStr = Format.now();
 
 var newCache = {
 version: config.CACHE_VERSION,
 updatedAt: nowMs,
 last_cache_update: lastUpdateStr,
 last_update: lastUpdateStr,
 assets: AssetManager.filterForCache(assetsArray),
 priceMap: cache ? (cache.priceMap || {}) : {},
 priceTsMap: cache ? (cache.priceTsMap || {}) : {},
 balanceTsMap: balanceTsMap,
 attemptTsMap: attemptTsMap,
 purgedTsMap: purgedTsMap,
 usd_to_eur_rate: cache ? cache.usd_to_eur_rate : null,
 rrCursor: cache ? cache.rrCursor : 0,
 last_full_scan_ms: cache ? cache.last_full_scan_ms : null,
 last_full_price_ms: cache ? cache.last_full_price_ms : null
 };
 
 WalletCache.save(walletNorm, newCache, config);
 out.push(["Cache saved", "YES", "Token now in cache"]);
 out.push(["", "", ""]);
 out.push(["NEXT STEP", "Run GET_WALLET_ASSETS_BASE()", "Token should now appear"]);
 
 } else {
 out.push(["BALANCE", "0 or NOT DETECTED", "RPC returned empty/zero"]);
 out.push(["", "", ""]);
 out.push(["NEXT STEP", "Run DIAG_TOKEN_0xeA6b_COMPARE_RPCS()", "Check all RPCs"]);
 }
 
 } catch (e) {
 out.push(["ERROR", e.message, e.stack ? e.stack.substring(0, 100) : ""]);
 }
 
 return out;
}

/**
 * 5. Recuperer le prix sur GeckoTerminal pour ce token
 */
function DIAG_TOKEN_0xeA6b_PRICE() {
 var token = "0xeA6b729919DB1ea6b046b722B1869EF746fa5d90";
 var out = [["Source", "Price USD", "Details"]];
 
 try {
 var timer = createTimer(10000);
 var config = BASE_CONFIG;
 var chainSlug = (config.CHAIN && config.CHAIN.DEXSCREENER_CHAIN) || "base";
 var gtSlug = (config.CHAIN && config.CHAIN.GECKOTERMINAL_NETWORK) || "base";
 
 // 1. DexScreener
 try {
 var dexUrl = "https://api.dexscreener.com/tokens/v1/" + chainSlug + "/" + token;
 var dexResp = Http.get(dexUrl, 5000, config);
 if (dexResp) {
 var dexJson = JSON.parse(dexResp);
 if (dexJson && dexJson.length > 0 && dexJson[0].priceUsd) {
 out.push(["DexScreener", dexJson[0].priceUsd, "Symbol: " + (dexJson[0].symbol || "?")]);
 } else {
 out.push(["DexScreener", "NOT FOUND", ""]);
 }
 }
 } catch (e) {
 out.push(["DexScreener", "ERROR", e.message.substring(0, 40)]);
 }
 
 // 2. GeckoTerminal
 try {
 var gtUrl = "https://api.geckoterminal.com/api/v2/networks/" + gtSlug + "/tokens/" + token;
 var gtResp = Http.get(gtUrl, 5000, config);
 if (gtResp) {
 var gtJson = JSON.parse(gtResp);
 if (gtJson && gtJson.data && gtJson.data.attributes && gtJson.data.attributes.price_usd) {
 out.push(["GeckoTerminal", gtJson.data.attributes.price_usd, "Name: " + (gtJson.data.attributes.name || "?")]);
 } else {
 out.push(["GeckoTerminal", "NOT FOUND", ""]);
 }
 }
 } catch (e) {
 out.push(["GeckoTerminal", "ERROR", e.message.substring(0, 40)]);
 }
 
 // 3. DefiLlama
 try {
 var llamaKey = "base:" + token.toLowerCase();
 var llamaUrl = "https://coins.llama.fi/prices/current/" + llamaKey;
 var llamaResp = Http.get(llamaUrl, 5000, config);
 if (llamaResp) {
 var llamaJson = JSON.parse(llamaResp);
 if (llamaJson && llamaJson.coins && llamaJson.coins[llamaKey] && llamaJson.coins[llamaKey].price) {
 out.push(["DefiLlama", llamaJson.coins[llamaKey].price, "Symbol: " + (llamaJson.coins[llamaKey].symbol || "?")]);
 } else {
 out.push(["DefiLlama", "NOT FOUND", ""]);
 }
 }
 } catch (e) {
 out.push(["DefiLlama", "ERROR", e.message.substring(0, 40)]);
 }
 
 } catch (e) {
 out.push(["FATAL", e.message, ""]);
 }
 
 return out;
}

// ============================================================
// FROM: DIAG_TOKEN_META.gs
// ============================================================
function DIAG_TOKEN_META(contract, chain) {
 var out = [["Source", "Field", "Value", "Status"]];
 
 try {
 var contractNorm = Addr.normalize(contract);
 out.push(["INPUT", "Contract", contractNorm, ""]);
 out.push(["INPUT", "Chain", chain || "base", ""]);
 out.push(["", "", "", ""]);
 
 // Get config for the chain
 var config = null;
 var chainUpper = String(chain || "base").toUpperCase().replace(/-/g, "_");
 try {
 if (typeof window !== 'undefined' && window["_" + chainUpper]) {
 config = window["_" + chainUpper].getConfig();
 } else if (typeof this["_" + chainUpper] !== 'undefined') {
 config = this["_" + chainUpper].getConfig();
 }
 } catch (e) {}
 
 // Fallback to BASE config
 if (!config && typeof _BASE !== 'undefined') {
 config = _BASE.getConfig();
 out.push(["CONFIG", "Using", "BASE (fallback)", ""]);
 }
 
 var gtNetwork = (config && config.CHAIN && config.CHAIN.GT_NETWORK) || "base";
 out.push(["CONFIG", "GT_NETWORK", gtNetwork, ""]);
 out.push(["", "", "", ""]);
 
 var timer = createTimer(25000);
 
 // ============================================================
 // 1. TEST GECKOTERMINAL API
 // ============================================================
 out.push(["=== GECKOTERMINAL API ===", "", "", ""]);
 
 var gtUrl = "https://api.geckoterminal.com/api/v2/networks/" + gtNetwork + "/tokens/" + contractNorm;
 out.push(["GT", "URL", gtUrl, ""]);
 
 try {
 var gtResponse = UrlFetchApp.fetch(gtUrl, {
 method: "get",
 headers: { 
 "Accept": "application/json",
 "User-Agent": "Mozilla/5.0"
 },
 muteHttpExceptions: true
 });
 
 var gtCode = gtResponse.getResponseCode();
 out.push(["GT", "HTTP Code", gtCode, gtCode === 200 ? "OK" : "ERROR"]);
 
 if (gtCode === 200) {
 var gtText = gtResponse.getContentText();
 var gtJson = JSON.parse(gtText);
 
 if (gtJson && gtJson.data && gtJson.data.attributes) {
 var attr = gtJson.data.attributes;
 out.push(["GT", "symbol", attr.symbol || "(empty)", attr.symbol ? "OK" : "MISSING"]);
 out.push(["GT", "name", attr.name || "(empty)", attr.name ? "OK" : "MISSING"]);
 out.push(["GT", "decimals", attr.decimals, ""]);
 out.push(["GT", "price_usd", attr.price_usd || "(empty)", ""]);
 out.push(["GT", "total_supply", attr.total_supply || "(empty)", ""]);
 } else {
 out.push(["GT", "Response", "No data.attributes", "ERROR"]);
 out.push(["GT", "Raw", String(gtText).substring(0, 200), ""]);
 }
 } else {
 out.push(["GT", "Response", gtResponse.getContentText().substring(0, 200), ""]);
 }
 } catch (eGt) {
 out.push(["GT", "Error", eGt.message, "FAILED"]);
 }
 
 out.push(["", "", "", ""]);
 
 // ============================================================
 // 2. TEST DEXSCREENER API
 // ============================================================
 out.push(["=== DEXSCREENER API ===", "", "", ""]);
 
 var dexSlug = (config && config.CHAIN && config.CHAIN.DEX_SLUG) || "base";
 var dexUrl = "https://api.dexscreener.com/tokens/v1/" + dexSlug + "/" + contractNorm;
 out.push(["DEX", "URL", dexUrl, ""]);
 
 try {
 var dexResponse = UrlFetchApp.fetch(dexUrl, {
 method: "get",
 headers: { "Accept": "application/json" },
 muteHttpExceptions: true
 });
 
 var dexCode = dexResponse.getResponseCode();
 out.push(["DEX", "HTTP Code", dexCode, dexCode === 200 ? "OK" : "ERROR"]);
 
 if (dexCode === 200) {
 var dexText = dexResponse.getContentText();
 var dexJson = JSON.parse(dexText);
 
 if (dexJson && Array.isArray(dexJson) && dexJson.length > 0) {
 var token = dexJson[0];
 out.push(["DEX", "symbol", token.baseToken && token.baseToken.symbol || "(empty)", ""]);
 out.push(["DEX", "name", token.baseToken && token.baseToken.name || "(empty)", ""]);
 out.push(["DEX", "priceUsd", token.priceUsd || "(empty)", ""]);
 } else if (dexJson && dexJson.pairs && dexJson.pairs.length > 0) {
 var pair = dexJson.pairs[0];
 out.push(["DEX", "symbol", pair.baseToken && pair.baseToken.symbol || "(empty)", ""]);
 out.push(["DEX", "name", pair.baseToken && pair.baseToken.name || "(empty)", ""]);
 out.push(["DEX", "priceUsd", pair.priceUsd || "(empty)", ""]);
 } else {
 out.push(["DEX", "Response", "Empty or no pairs", "NOT FOUND"]);
 }
 } else {
 out.push(["DEX", "Response", dexResponse.getContentText().substring(0, 200), ""]);
 }
 } catch (eDex) {
 out.push(["DEX", "Error", eDex.message, "FAILED"]);
 }
 
 out.push(["", "", "", ""]);
 
 // ============================================================
 // 3. TEST RPC CALLS (symbol, name, decimals)
 // ============================================================
 out.push(["=== RPC CALLS ===", "", "", ""]);
 
 var rpc = (config && config.RPC && config.RPC.ENDPOINTS && config.RPC.ENDPOINTS[0]) || "https://base.drpc.org";
 out.push(["RPC", "Endpoint", rpc.substring(0, 40) + "...", ""]);
 
 // symbol()
 try {
 var symResult = RpcClient.call(rpc, "eth_call", [{ to: contractNorm, data: "0x95d89b41" }, "latest"], timer, 1, config);
 var sym = AbiDecode.decodeStringOrBytes32(symResult);
 out.push(["RPC", "symbol()", sym || "(empty)", sym ? "OK" : "NO RESPONSE"]);
 } catch (eSym) {
 out.push(["RPC", "symbol()", eSym.message, "FAILED"]);
 }
 
 // name()
 try {
 var nameResult = RpcClient.call(rpc, "eth_call", [{ to: contractNorm, data: "0x06fdde03" }, "latest"], timer, 1, config);
 var name = AbiDecode.decodeStringOrBytes32(nameResult);
 out.push(["RPC", "name()", name || "(empty)", name ? "OK" : "NO RESPONSE"]);
 } catch (eName) {
 out.push(["RPC", "name()", eName.message, "FAILED"]);
 }
 
 // decimals()
 try {
 var decResult = RpcClient.call(rpc, "eth_call", [{ to: contractNorm, data: "0x313ce567" }, "latest"], timer, 1, config);
 var dec = parseInt(decResult, 16);
 out.push(["RPC", "decimals()", isNaN(dec) ? "(invalid)" : dec, !isNaN(dec) ? "OK" : "FAILED"]);
 } catch (eDec) {
 out.push(["RPC", "decimals()", eDec.message, "FAILED"]);
 }
 
 out.push(["", "", "", ""]);
 
 // ============================================================
 // 4. CHECK CACHE
 // ============================================================
 out.push(["=== CACHE STATUS ===", "", "", ""]);
 
 try {
 CacheManager.init();
 var metaKey = (config && config.KEYS && config.KEYS.META) ? String(config.KEYS.META) : "META_CACHE";
 var metaCache = CacheManager.safeGetJson(metaKey, config);
 
 if (metaCache && metaCache[contractNorm]) {
 var cached = metaCache[contractNorm];
 out.push(["CACHE", "In MetaCache", "YES", ""]);
 out.push(["CACHE", "symbol", cached.symbol || "(empty)", ""]);
 out.push(["CACHE", "name", cached.name || "(empty)", ""]);
 out.push(["CACHE", "decimals", cached.decimals, ""]);
 out.push(["CACHE", "lastSeenMs", cached.lastSeenMs ? new Date(cached.lastSeenMs).toISOString() : "(none)", ""]);
 } else {
 out.push(["CACHE", "In MetaCache", "NO", "Token not cached"]);
 }
 } catch (eCache) {
 out.push(["CACHE", "Error", eCache.message, ""]);
 }
 
 out.push(["", "", "", ""]);
 
 // ============================================================
 // 5. TEST PriceSources.getGeckoTerminalMeta
 // ============================================================
 out.push(["=== INTERNAL FUNCTION TEST ===", "", "", ""]);
 
 try {
 var gtMeta = PriceSources.getGeckoTerminalMeta(contractNorm, timer, config);
 if (gtMeta) {
 out.push(["getGeckoTerminalMeta", "Result", "Object returned", "OK"]);
 out.push(["getGeckoTerminalMeta", "symbol", gtMeta.symbol || "(empty)", gtMeta.symbol ? "OK" : "MISSING"]);
 out.push(["getGeckoTerminalMeta", "name", gtMeta.name || "(empty)", gtMeta.name ? "OK" : "MISSING"]);
 out.push(["getGeckoTerminalMeta", "decimals", gtMeta.decimals, ""]);
 } else {
 out.push(["getGeckoTerminalMeta", "Result", "NULL", "FAILED - No data returned"]);
 }
 } catch (eGtMeta) {
 out.push(["getGeckoTerminalMeta", "Error", eGtMeta.message, "EXCEPTION"]);
 }
 
 } catch (e) {
 out.push(["ERROR", e.message, e.stack ? e.stack.substring(0, 200) : "", ""]);
 }
 
 return out;
}

/**
 * Shortcut for BASE chain
 */
function DIAG_TOKEN_META_BASE(contract) {
 return DIAG_TOKEN_META(contract, "base");
}

/**
 * Test the specific problematic token
 */
function DIAG_FLIPIT_META() {
 return DIAG_TOKEN_META("0xeA6b729919DB1ea6b046b722B1869EF746fa5d90", "base");
}

// ============================================================
// FROM: DIAG_TOKEN_POSITION.gs
// ============================================================
function DIAG_TOKEN_POSITION_BASE(wallet, token, tokensRange) {
 return _diagTokenPosition(wallet, token, tokensRange, _BASE.getConfig());
}

function DIAG_TOKEN_POSITION_ETHEREUM(wallet, token, tokensRange) {
 return _diagTokenPosition(wallet, token, tokensRange, _ETHEREUM.getConfig());
}

function DIAG_TOKEN_POSITION_POLYGON(wallet, token, tokensRange) {
 return _diagTokenPosition(wallet, token, tokensRange, _POLYGON.getConfig());
}

function DIAG_TOKEN_POSITION_ARBITRUM_ONE(wallet, token, tokensRange) {
 return _diagTokenPosition(wallet, token, tokensRange, _ARBITRUM_ONE.getConfig());
}

/**
 * Raccourci pour test rapide
 */
function DIAG_FLIPIT_POSITION(tokensRange) {
 return DIAG_TOKEN_POSITION_BASE(
 "0x6a3530ad9e5b1779de37f5e6af82999c325ea3f7",
 "0xeA6b729919DB1ea6b046b722B1869EF746fa5d90",
 tokensRange
 );
}

function _diagTokenPosition(wallet, token, tokensRange, config) {
 var out = [["Category", "Key", "Value", "Details"]];
 
 var walletNorm = Addr.normalize(wallet);
 var tokenNorm = Addr.normalize(token);
 
 out.push(["INPUT", "Wallet", walletNorm.substring(0, 12) + "...", ""]);
 out.push(["INPUT", "Token", tokenNorm.substring(0, 12) + "...", ""]);
 out.push(["INPUT", "Token (orig)", token, "Before normalize"]);
 out.push(["INPUT", "tokensRange provided", tokensRange ? "YES" : "NO", ""]);
 out.push(["", "", "", ""]);
 
 try {
 CacheManager.init();
 var timer = createTimer(15000);
 
 // 1. Charger le cache
 var cache = WalletCache.load(walletNorm, timer, config);
 if (!cache) {
 out.push(["ERROR", "No cache", "", "Run GET_WALLET_ASSETS first"]);
 return out;
 }
 
 out.push(["CACHE", "Version", cache.version, ""]);
 out.push(["CACHE", "rrCursor", cache.rrCursor || 0, "Current round-robin position"]);
 out.push(["", "", "", ""]);
 
 // 2. Reconstruire assetByKey
 var assetByKey = {};
 if (cache.assets) {
 for (var i = 0; i < cache.assets.length; i++) {
 var a = cache.assets[i];
 if (a && a.contract) {
 var k = (a.contract === "native") ? "native" : Addr.normalize(a.contract);
 assetByKey[k] = a;
 }
 }
 }
 out.push(["CACHE", "Assets in cache", Object.keys(assetByKey).length, ""]);
 
 // 3. Verifier si le token est dans assetByKey
 var inAssetByKey = !!assetByKey[tokenNorm];
 var hasBalance = inAssetByKey && Num.isPositive(assetByKey[tokenNorm].balance);
 out.push(["CACHE", "Token in assetByKey", inAssetByKey ? "YES" : "NO", ""]);
 out.push(["CACHE", "Token has balance", hasBalance ? "YES (" + assetByKey[tokenNorm].balance + ")" : "NO", ""]);
 out.push(["", "", "", ""]);
 
 // 4. Construire allContracts avec le tokensRange fourni
 out.push(["=== SIMULATION FULLSCAN (v4.12.24) ===", "", "", ""]);
 
 var allContracts = ContractListBuilder.build(tokensRange || "", assetByKey, config);
 out.push(["LISTS", "allContracts.length", allContracts.length, "Total contracts to scan"]);
 
 // Chercher le token dans allContracts
 var posInAll = -1;
 for (var j = 0; j < allContracts.length; j++) {
 if (Addr.normalize(allContracts[j]) === tokenNorm) {
 posInAll = j;
 break;
 }
 }
 out.push(["LISTS", "Token in allContracts", posInAll >= 0 ? "YES at pos " + posInAll : "NO!", posInAll < 0 ? "BUG: Token missing!" : ""]);
 out.push(["", "", "", ""]);
 
 // ============================================================
 // v4.12.24: 3-CATEGORY CLASSIFICATION (matches 08_ASSETS.gs)
 // ============================================================
 out.push(["=== 3-CATEGORY CLASSIFICATION ===", "", "", ""]);
 
 var balanceTsMap = cache.balanceTsMap || {};
 var attemptTsMap = cache.attemptTsMap || {};
 var purgedTsMap = cache.purgedTsMap || {};
 var priceMap = cache.priceMap || {};
 
 var priorityContracts = [];
 var neverScannedContracts = [];
 var otherContracts = [];
 
 for (var k = 0; k < allContracts.length; k++) {
 var addr = Addr.normalize(allContracts[k]);
 if (!addr) continue;
 
 var assetHasBalance = assetByKey && assetByKey[addr] && Num.isPositive(assetByKey[addr].balance);
 
 // v4.12.24: Check if token was EVER attempted (same logic as 08_ASSETS.gs)
 var wasEverAttempted = (attemptTsMap && attemptTsMap[addr]) || 
 (balanceTsMap && balanceTsMap[addr]) ||
 (purgedTsMap && purgedTsMap[addr]);
 
 if (assetHasBalance) {
 // Token has balance - priority refresh
 var asset = assetByKey[addr];
 var bal = Num.parse(asset.balance) || 0;
 var price = Num.parse(asset.price_eur) || Num.parse(priceMap[addr]) || 0;
 var value = bal * price;
 priorityContracts.push({ addr: addr, value: value, pos: k });
 } else if (!wasEverAttempted) {
 // v4.12.24: NEVER SCANNED - HIGH PRIORITY!
 neverScannedContracts.push({ addr: addr, pos: k });
 } else {
 // Already scanned, no balance - low priority round-robin
 otherContracts.push({ addr: addr, pos: k });
 }
 }
 
 out.push(["CATEGORY", "1. PRIORITY (has balance)", priorityContracts.length, "Scanned FIRST (top 15 individual)"]);
 out.push(["CATEGORY", "2. NEVER_SCANNED (new)", neverScannedContracts.length, "Scanned SECOND (v4.12.24 GUARANTEED)"]);
 out.push(["CATEGORY", "3. DISCOVERY (round-robin)", otherContracts.length, "Scanned LAST (if time permits)"]);
 out.push(["", "", "", ""]);
 
 // 7. Chercher le token dans les 3 listes
 var posInPriority = -1;
 for (var p = 0; p < priorityContracts.length; p++) {
 if (priorityContracts[p].addr === tokenNorm) {
 posInPriority = p;
 break;
 }
 }
 
 var posInNeverScanned = -1;
 for (var n = 0; n < neverScannedContracts.length; n++) {
 if (neverScannedContracts[n].addr === tokenNorm) {
 posInNeverScanned = n;
 break;
 }
 }
 
 var posInOther = -1;
 for (var o = 0; o < otherContracts.length; o++) {
 if (otherContracts[o].addr === tokenNorm) {
 posInOther = o;
 break;
 }
 }
 
 out.push(["POSITION", "In PRIORITY", posInPriority >= 0 ? "YES at pos " + posInPriority : "NO", posInPriority >= 0 ? "Will be scanned every run" : ""]);
 out.push(["POSITION", "In NEVER_SCANNED", posInNeverScanned >= 0 ? "YES at pos " + posInNeverScanned : "NO", posInNeverScanned >= 0 ? "GUARANTEED to be scanned next run!" : ""]);
 out.push(["POSITION", "In DISCOVERY (RR)", posInOther >= 0 ? "YES at pos " + posInOther : "NO", posInOther >= 0 ? "Round-robin, may take several runs" : ""]);
 out.push(["", "", "", ""]);
 
 // 8. Analyser le round-robin si dans DISCOVERY
 if (posInOther >= 0) {
 var rrCursor = cache.rrCursor || 0;
 out.push(["ROUND-ROBIN", "Current rrCursor", rrCursor, ""]);
 out.push(["ROUND-ROBIN", "otherContracts.length", otherContracts.length, ""]);
 
 var effectiveCursor = otherContracts.length > 0 ? (rrCursor % otherContracts.length) : 0;
 out.push(["ROUND-ROBIN", "Effective cursor", effectiveCursor, "rrCursor % length"]);
 out.push(["ROUND-ROBIN", "Token at position", posInOther, ""]);
 
 // Calculer combien de batches avant d'atteindre ce token
 var batchSize = 15; // AGGRESSIVE profile
 var distanceToToken = (posInOther - effectiveCursor + otherContracts.length) % otherContracts.length;
 var batchesNeeded = Math.ceil(distanceToToken / batchSize);
 
 out.push(["ROUND-ROBIN", "Distance to token", distanceToToken, "positions to scan before reaching token"]);
 out.push(["ROUND-ROBIN", "Batches needed", batchesNeeded, "at batchSize=" + batchSize]);
 out.push(["", "", "", ""]);
 }
 
 // 9. Verifier l'historique de scan
 out.push(["=== SCAN HISTORY ===", "", "", ""]);
 var balanceTs = balanceTsMap[tokenNorm];
 var attemptTs = attemptTsMap[tokenNorm];
 var purgedTs = purgedTsMap[tokenNorm];
 
 out.push(["HISTORY", "balanceTsMap", balanceTs ? new Date(balanceTs).toISOString() : "NEVER", balanceTs ? "Was scanned with balance" : "Never had balance"]);
 out.push(["HISTORY", "attemptTsMap", attemptTs ? new Date(attemptTs).toISOString() : "NEVER", attemptTs ? "Attempt made" : "Never attempted!"]);
 out.push(["HISTORY", "purgedTsMap", purgedTs ? new Date(purgedTs).toISOString() : "NO", purgedTs ? "WAS PURGED!" : ""]);
 out.push(["", "", "", ""]);
 
 // 10. DIAGNOSTIC FINAL
 out.push(["=== DIAGNOSTIC v4.12.24 ===", "", "", ""]);
 
 if (posInAll < 0) {
 out.push(["BUG", "Token NOT in allContracts!", "", "Check tokensRange or ContractListBuilder"]);
 } else if (posInPriority >= 0) {
 out.push(["OK", "Token in PRIORITY list", "Position " + posInPriority, "Should be scanned every run"]);
 if (!balanceTs) {
 out.push(["WARN", "But never scanned!", "", "Will be scanned on next refresh"]);
 }
 } else if (posInNeverScanned >= 0) {
 out.push(["OK", "Token in NEVER_SCANNED list", "Position " + posInNeverScanned + "/" + neverScannedContracts.length, "GUARANTEED to be scanned on next run!"]);
 out.push(["INFO", "v4.12.24 Fix", "", "Never-scanned tokens now run BEFORE batch priority"]);
 } else if (posInOther >= 0) {
 out.push(["INFO", "Token in DISCOVERY list (RR)", "Position " + posInOther + "/" + otherContracts.length, ""]);
 out.push(["INFO", "Status", "Already scanned before (no balance found)", "Will be re-checked via round-robin"]);
 } else {
 out.push(["BUG", "Token in allContracts but NOT classified!", "", "Logic error"]);
 }
 
 // 11. Resume de l'ordre des phases
 out.push(["", "", "", ""]);
 out.push(["=== PHASE ORDER (v4.12.24) ===", "", "", ""]);
 out.push(["PHASE 1", "PRIORITY Individual", "Top 15 by value", "Consensus scan"]);
 out.push(["PHASE 1b", "NEVER_SCANNED", "All new tokens", "GUARANTEED 4s budget"]);
 out.push(["PHASE 1c", "PRIORITY Batch", "Remaining with balance", "8s max time"]);
 out.push(["PHASE 2", "DISCOVERY", "Round-robin", "If time permits"]);
 
 } catch (e) {
 out.push(["ERROR", e.message, e.stack ? e.stack.substring(0, 100) : "", ""]);
 }
 
 return out;
}

// ============================================================
// FROM: DIAG_ZOMBIE_TRACE.gs
// ============================================================
function _getBaseConfig() {
 if (typeof _BASE !== 'undefined' && _BASE.getConfig) {
 return _BASE.getConfig();
 }
 if (typeof BASE_CONFIG !== 'undefined') {
 return BASE_CONFIG;
 }
 return null;
}

/**
 * Trace le probleme zombie pour un token specifique
 * @param {string} wallet - Adresse du wallet
 * @param {string} contract - Adresse du contrat token
 * @customfunction
 */
function DIAG_ZOMBIE_TRACE(wallet, contract) {
 var out = [["Check", "Value", "Details"]];
 
 try {
 wallet = String(wallet || "").toLowerCase().trim();
 contract = String(contract || "").toLowerCase().trim();
 
 if (!wallet || !contract) {
 return [["ERROR", "Missing wallet or contract address"]];
 }
 
 var config = _getBaseConfig();
 if (!config) {
 return [["ERROR", "Config not found. _BASE or BASE_CONFIG undefined."]];
 }
 
 var nowMs = Date.now();
 var STALE_TIMEOUT_MS = 6 * 60 * 60 * 1000; // 6 hours
 
 out.push(["=== ZOMBIE TRACE ===", "", ""]);
 out.push(["Wallet", wallet.substring(0, 15) + "...", ""]);
 out.push(["Contract", contract.substring(0, 15) + "...", ""]);
 out.push(["Now (ms)", nowMs, new Date(nowMs).toISOString()]);
 out.push(["Stale timeout", STALE_TIMEOUT_MS + " ms", "6 hours"]);
 
 // Check if ASSETS 4.12.15 is deployed
 var assetsVersion = "unknown";
 if (typeof ROTATION_CONFIG !== "undefined" && ROTATION_CONFIG.STALE_BALANCE_TIMEOUT_MS) {
 assetsVersion = "4.12.15 (anti-zombie)";
 } else if (typeof AssetManager !== "undefined") {
 assetsVersion = "4.12.12 or earlier";
 }
 out.push(["ASSETS version", assetsVersion, ""]);
 
 // 1. Load cache
 out.push(["", "", ""]);
 out.push(["=== CACHE STATE ===", "", ""]);
 
 var cache = null;
 try {
 CacheManager.init();
 cache = WalletCache.load(wallet, null, config);
 } catch (e) {
 out.push(["Cache load error", e.message, ""]);
 }
 
 if (!cache) {
 out.push(["Cache", "NOT FOUND", "No cache for this wallet"]);
 return out;
 }
 
 out.push(["Cache found", "YES", "updatedAt: " + (cache.updatedAt ? new Date(cache.updatedAt).toISOString() : "N/A")]);
 out.push(["Cache assets count", (cache.assets || []).length, ""]);
 
 // 2. Check assetByKey
 var assetByKey = {};
 if (cache.assets && Array.isArray(cache.assets)) {
 for (var i = 0; i < cache.assets.length; i++) {
 var a = cache.assets[i];
 if (a && a.contract) {
 var key = String(a.contract).toLowerCase();
 assetByKey[key] = a;
 }
 }
 }
 
 var existing = assetByKey[contract];
 var hadPositiveBalance = existing && existing.balance && Number(existing.balance) > 0;
 
 out.push(["Token in assetByKey?", existing ? "YES" : "NO", ""]);
 if (existing) {
 out.push([" balance", existing.balance, ""]);
 out.push([" symbol", existing.symbol || "(empty)", ""]);
 out.push(["hadPositiveBalance", hadPositiveBalance ? "TRUE" : "FALSE", ""]);
 }
 
 // 3. Check balanceTsMap
 out.push(["", "", ""]);
 out.push(["=== BALANCE TIMESTAMP ===", "", ""]);
 
 var balanceTsMap = cache.balanceTsMap || {};
 var lastPositiveConfirmation = balanceTsMap[contract] || 0;
 
 out.push(["balanceTsMap[contract]", lastPositiveConfirmation || "NOT SET", ""]);
 
 if (lastPositiveConfirmation > 0) {
 var ageMs = nowMs - lastPositiveConfirmation;
 var ageHours = (ageMs / 3600000).toFixed(2);
 out.push(["Confirmation age", ageMs + " ms", ageHours + " hours"]);
 out.push(["Last confirmed at", new Date(lastPositiveConfirmation).toISOString(), ""]);
 
 var isStale = ageMs > STALE_TIMEOUT_MS;
 out.push(["isStaleConfirmation", isStale ? "TRUE (>6h)" : "FALSE (<6h)", ""]);
 } else {
 out.push(["isStaleConfirmation", "TRUE (no timestamp)", "No confirmation on record"]);
 }
 
 // 4. Query RPC for current balance
 out.push(["", "", ""]);
 out.push(["=== RPC QUERY ===", "", ""]);
 
 var rpcBalance = null;
 var rpcError = null;
 
 try {
 var rpc = config.RPC && config.RPC.ENDPOINTS && config.RPC.ENDPOINTS[0];
 if (!rpc) rpc = "https://base.drpc.org";
 
 out.push(["RPC", rpc, ""]);
 
 var callData = "0x70a08231" + "000000000000000000000000" + wallet.replace("0x", "");
 var payload = JSON.stringify({
 jsonrpc: "2.0",
 id: 1,
 method: "eth_call",
 params: [{ to: contract, data: callData }, "latest"]
 });
 
 var resp = UrlFetchApp.fetch(rpc, {
 method: "post",
 contentType: "application/json",
 payload: payload,
 muteHttpExceptions: true
 });
 
 if (resp.getResponseCode() === 200) {
 var json = JSON.parse(resp.getContentText());
 if (json.result) {
 var raw = BigInt(json.result || "0x0");
 rpcBalance = Number(raw) / 1e18; // Assume 18 decimals
 out.push(["RPC hex result", json.result.substring(0, 20) + "...", ""]);
 out.push(["RPC balance (18 dec)", rpcBalance, ""]);
 } else if (json.error) {
 rpcError = json.error.message || JSON.stringify(json.error);
 out.push(["RPC error", rpcError, ""]);
 }
 } else {
 rpcError = "HTTP " + resp.getResponseCode();
 out.push(["RPC HTTP error", rpcError, ""]);
 }
 } catch (e) {
 rpcError = e.message;
 out.push(["RPC exception", e.message, ""]);
 
 // Check if quota exhausted
 if (e.message && e.message.indexOf("too many times") >= 0) {
 out.push(["aÅ¡Â iÂ¸Â QUOTA EXHAUSTED", "HTTP quota for today is used up!", ""]);
 out.push(["Solution", "Wait until midnight UTC (1h France)", ""]);
 }
 }
 
 // 5. Analyze what would happen
 out.push(["", "", ""]);
 out.push(["=== ANTI-ZOMBIE ANALYSIS ===", "", ""]);
 
 var isStaleConfirmation = (lastPositiveConfirmation === 0) || 
 ((nowMs - lastPositiveConfirmation) > STALE_TIMEOUT_MS);
 
 // Simulate consensus check (assume no consensus since health=60%)
 var hasConsensus = false; // Simulated
 out.push(["Simulated hasConsensus", "FALSE", "(RPC health 60%)"]);
 
 if (rpcBalance !== null && rpcBalance === 0) {
 out.push(["RPC says balance", "0", ""]);
 
 if (!hadPositiveBalance) {
 out.push(["RESULT", "aÅ“âEUR¦ WOULD UPDATE", "Token not in cache, no protection needed"]);
 } else if (hasConsensus) {
 out.push(["RESULT", "aÅ“âEUR¦ WOULD PURGE", "Has consensus"]);
 } else if (isStaleConfirmation) {
 out.push(["RESULT", "aÅ“âEUR¦ WOULD PURGE (v4.12.15)", "Stale confirmation >6h allows purge"]);
 } else {
 out.push(["RESULT", "aÂÅ’ BLOCKED", "No consensus + recent confirmation = ZOMBIE PROTECTION"]);
 out.push(["FIX NEEDED", "Wait 6h OR clear cache", ""]);
 }
 } else if (rpcBalance !== null && rpcBalance > 0) {
 out.push(["RPC says balance", rpcBalance, ""]);
 out.push(["RESULT", "Token has real balance", "Not a zombie"]);
 } else {
 out.push(["RPC query", "FAILED", rpcError || "Unknown error"]);
 out.push(["Cannot determine", "zombie status", "RPC call failed"]);
 }
 
 // 6. Check if in tokensRange/watchlist
 out.push(["", "", ""]);
 out.push(["=== WATCHLIST CHECK ===", "", ""]);
 out.push(["NOTE", "If token is in your tokensRange", "It will be re-scanned every time"]);
 out.push(["To check", "Look at your formula's 3rd parameter", ""]);
 
 } catch (e) {
 out.push(["FATAL ERROR", e.message, e.stack ? e.stack.substring(0, 200) : ""]);
 }
 
 return out;
}


/**
 * Force la purge d'un token zombie specifique
 * @param {string} wallet - Adresse du wallet 
 * @param {string} contract - Adresse du contrat ÃƒÂ  purger
 * @customfunction
 */
function FORCE_PURGE_ZOMBIE(wallet, contract) {
 var out = [["Action", "Result", "Details"]];
 
 try {
 wallet = String(wallet || "").toLowerCase().trim();
 contract = String(contract || "").toLowerCase().trim();
 
 if (!wallet || !contract) {
 return [["ERROR", "Missing wallet or contract address"]];
 }
 
 var config = _getBaseConfig();
 if (!config) {
 return [["ERROR", "Config not found. _BASE or BASE_CONFIG undefined."]];
 }
 
 // Load cache
 CacheManager.init();
 var cache = WalletCache.load(wallet, null, config);
 
 if (!cache) {
 return [["ERROR", "No cache found for wallet"]];
 }
 
 out.push(["Cache loaded", "YES", "Assets: " + (cache.assets || []).length]);
 
 // Find and remove the token
 var found = false;
 var newAssets = [];
 var removedBalance = 0;
 
 for (var i = 0; i < (cache.assets || []).length; i++) {
 var a = cache.assets[i];
 if (!a) continue;
 
 var key = String(a.contract || "").toLowerCase();
 if (key === contract) {
 found = true;
 removedBalance = a.balance;
 out.push(["Found token", a.symbol || contract.substring(0, 10), "Balance: " + a.balance]);
 // Don't add to newAssets = remove it
 } else {
 newAssets.push(a);
 }
 }
 
 if (!found) {
 out.push(["Token", "NOT FOUND in cache", contract.substring(0, 20) + "..."]);
 return out;
 }
 
 // Update cache
 cache.assets = newAssets;
 cache.updatedAt = Date.now();
 
 // Clear balanceTsMap for this contract
 if (cache.balanceTsMap && cache.balanceTsMap[contract]) {
 delete cache.balanceTsMap[contract];
 out.push(["balanceTsMap", "CLEARED for contract", ""]);
 }
 
 // Add to purgedTsMap
 if (!cache.purgedTsMap) cache.purgedTsMap = {};
 cache.purgedTsMap[contract] = Date.now();
 out.push(["purgedTsMap", "MARKED as purged", ""]);
 
 // Save cache
 var saved = WalletCache.save(wallet, cache, null, config);
 
 if (saved) {
 out.push(["Cache saved", "SUCCESS", "Token removed"]);
 out.push(["Removed balance", removedBalance, ""]);
 out.push(["New asset count", newAssets.length, ""]);
 } else {
 out.push(["Cache save", "FAILED", "Unknown error"]);
 }
 
 } catch (e) {
 out.push(["ERROR", e.message, ""]);
 }
 
 return out;
}
// ============================================================
// FROM: 10C_BASE_ENGINE_ACTIVITY_FIX.gs (DIAG functions only)
// ============================================================
function DIAG_ACTIVITY_LOOKUP(chain, wallet) {
 var out = [["Check", "Value", "Details"]];
 
 try {
 chain = String(chain || "").trim();
 wallet = String(wallet || "").toLowerCase().trim();
 
 out.push(["Input chain", chain, ""]);
 out.push(["Input wallet", wallet.substring(0, 15) + "...", ""]);
 
 // What key will ActivityTracker use?
 var expectedKey = String(chain).toUpperCase() + ":" + String(wallet).toLowerCase();
 out.push(["Expected key", expectedKey.substring(0, 40) + "...", ""]);
 
 // Check if ActivityTracker exists
 if (typeof ActivityTracker === "undefined") {
 out.push(["ActivityTracker", "NOT DEFINED", "27_ACTIVITY_REFRESH.gs not loaded?"]);
 return out;
 }
 
 out.push(["ActivityTracker", "DEFINED", ""]);
 
 // Try to get info
 var info = ActivityTracker.getInfo(chain, wallet);
 
 if (!info) {
 out.push(["Result", "NOT FOUND", "No entry for this chain:wallet"]);
 
 // List some keys from NONCE_MAP for comparison
 try {
 var props = PropertiesService.getScriptProperties();
 var raw = props.getProperty("ACTIVITY_NONCE_MAP");
 if (raw) {
 var map = JSON.parse(raw);
 var keys = Object.keys(map).slice(0, 5);
 out.push(["", "", ""]);
 out.push(["=== Sample keys in NONCE_MAP ===", "", ""]);
 for (var i = 0; i < keys.length; i++) {
 out.push(["Key " + (i+1), keys[i], ""]);
 }
 }
 } catch (e) {}
 
 } else {
 out.push(["Result", "FOUND!", ""]);
 out.push(["nonce", info.nonce, ""]);
 out.push(["lastCheck", info.lastCheck ? new Date(info.lastCheck).toISOString() : "N/A", ""]);
 out.push(["lastActivity", info.lastActivity ? new Date(info.lastActivity).toISOString() : "N/A", ""]);
 }
 
 } catch (e) {
 out.push(["ERROR", e.message, ""]);
 }
 
 return out;
}

function CLEANUP_TEST_TOKEN() {
 var out = [["Step", "Result"]];
 
 var walletAddr = "0x6a3530ad9e5b1779de37f5e6af82999c325ea3f7";
 var config = { KEYS: { PREFIX: "BASE_CACHE_" } };
 
 try {
 CacheManager.init();
 
 // Load current cache
 var cache = WalletCache.load(walletAddr, null, config);
 if (!cache) {
 out.push(["Cache", "NOT FOUND"]);
 return out;
 }
 
 out.push(["Cache loaded", "YES, " + (cache.assets || []).length + " assets"]);
 
 // Filter out the test token
 var originalCount = (cache.assets || []).length;
 cache.assets = (cache.assets || []).filter(function(a) {
 if (!a || !a.contract) return false;
 return a.contract !== "0xtest" && a.contract.toLowerCase() !== "0xtest";
 });
 
 var newCount = cache.assets.length;
 out.push(["Removed", (originalCount - newCount) + " test token(s)"]);
 
 // Save back
 WalletCache.save(walletAddr, cache, config);
 out.push(["Saved", "OK"]);
 
 // Also clear from L1
 try {
 var key = "BASE_CACHE_WALLET_" + walletAddr;
 CacheService.getScriptCache().remove(key);
 out.push(["L1 cleared", "OK"]);
 } catch (e) {}
 
 out.push(["Done", "Refresh Base wallet to verify"]);
 
 } catch (e) {
 out.push(["Error", e.message]);
 }
 
 return out;
}

function DIAG_FAKE_TOKENS() {
 var out = [["Contract", "Balance", "Source", "RPC Check"]];
 
 var suspects = [
 "0x25008f56688c20a907662ff567b2160ac284f3e3",
 "0xba72b8e600145e8d254bd565241a935b130f0112",
 "0x560b0307ffe0efe72fe567f30faacc927a03d5f3"
 ];
 
 var walletAddr = "0x6a3530ad9e5b1779de37f5e6af82999c325ea3f7";
 
 try {
 // Check if these are in tokensRange
 var ss = SpreadsheetApp.getActiveSpreadsheet();
 var tokensSheet = ss.getSheetByName("Tokens") || ss.getSheetByName("tokens");
 var inTokensRange = {};
 
 if (tokensSheet) {
 var tokensData = tokensSheet.getDataRange().getValues();
 for (var i = 0; i < tokensData.length; i++) {
 for (var j = 0; j < tokensData[i].length; j++) {
 var cell = String(tokensData[i][j] || "").toLowerCase();
 if (cell.indexOf("0x") === 0) {
 inTokensRange[cell] = true;
 }
 }
 }
 }
 
 // Check each suspect
 for (var s = 0; s < suspects.length; s++) {
 var contract = suspects[s].toLowerCase();
 var inRange = inTokensRange[contract] ? "YES - in Tokens sheet!" : "no";
 
 // Try RPC call to check real balance
 var rpcBalance = "?";
 try {
 var config = BASE_CONFIG || {};
 var rpc = (config.RPC && config.RPC.ENDPOINTS && config.RPC.ENDPOINTS[0]) || "https://mainnet.base.org";
 
 var payload = {
 jsonrpc: "2.0",
 id: 1,
 method: "eth_call",
 params: [{
 to: contract,
 data: "0x70a08231000000000000000000000000" + walletAddr.substring(2)
 }, "latest"]
 };
 
 var response = UrlFetchApp.fetch(rpc, {
 method: "post",
 contentType: "application/json",
 payload: JSON.stringify(payload),
 muteHttpExceptions: true
 });
 
 var json = JSON.parse(response.getContentText());
 if (json.result) {
 var bal = parseInt(json.result, 16);
 rpcBalance = bal > 0 ? bal.toString() : "0";
 } else if (json.error) {
 rpcBalance = "ERROR: " + (json.error.message || "?").substring(0, 30);
 }
 } catch (e) {
 rpcBalance = "EXCEPTION: " + e.message.substring(0, 30);
 }
 
 out.push([contract.substring(0, 15) + "...", "?", inRange, rpcBalance]);
 }
 
 } catch (e) {
 out.push(["Error", e.message, "", ""]);
 }
 
 return out;
}

function DIAG_VERIFY_REAL_BALANCES() {
 var out = [["Token", "Contract", "Cache Balance", "RPC Balance", "Match?"]];
 
 var walletAddr = "0x6a3530ad9e5b1779de37f5e6af82999c325ea3f7";
 var rpc = "https://mainnet.base.org";
 
 // Tokens suspects
 var tokens = [
 { name: "LOUDER", contract: "0x120edc8e391ba4c94cb98bb65d8856ae6ec1525f", cacheBal: 9808 },
 { name: "DAYS", contract: "0xb58372a5bb18e10229e680d8bcc4201ca3c98301", cacheBal: 74000 },
 { name: "IJN", contract: "0x2da1f02de055cebe51c6f6526ed67ad0dc86f431", cacheBal: 53560 },
 { name: "SWEET", contract: "0x8da2a47f76d928a97a8f44498db25aa787198087", cacheBal: 96500 },
 { name: "CREATE", contract: "0x8a9cf9ae6536127129727938cb1a6438273e4f94", cacheBal: 54000 },
 { name: "TELL", contract: "0xed9bba84974a06e3886fa6228b27de43c93b4147", cacheBal: 19500 },
 { name: "DRINK", contract: "0xc2a5afd72f62b4ccac9d47f33c93974da570fa34", cacheBal: 21500 },
 { name: "ONCHAIN", contract: "0xfef2d7b013b88fec2bfe4d2fee0aeb719af73481", cacheBal: 2880 },
 { name: "USDC", contract: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", cacheBal: 0.14 }
 ];
 
 for (var i = 0; i < tokens.length; i++) {
 var t = tokens[i];
 var rpcBal = "?";
 
 try {
 // balanceOf(address) = 0x70a08231
 var data = "0x70a08231000000000000000000000000" + walletAddr.substring(2).toLowerCase();
 
 var payload = {
 jsonrpc: "2.0",
 id: 1,
 method: "eth_call",
 params: [{ to: t.contract, data: data }, "latest"]
 };
 
 var response = UrlFetchApp.fetch(rpc, {
 method: "post",
 contentType: "application/json",
 payload: JSON.stringify(payload),
 muteHttpExceptions: true
 });
 
 var json = JSON.parse(response.getContentText());
 
 if (json.result && json.result !== "0x") {
 var rawBal = parseInt(json.result, 16);
 // Assume 18 decimals for most tokens, 6 for USDC
 var decimals = (t.name === "USDC") ? 6 : 18;
 rpcBal = (rawBal / Math.pow(10, decimals)).toFixed(2);
 } else if (json.error) {
 rpcBal = "ERR: " + (json.error.message || "?").substring(0, 20);
 } else {
 rpcBal = "0";
 }
 } catch (e) {
 rpcBal = "EXC: " + e.message.substring(0, 20);
 }
 
 var match = "?";
 var rpcNum = parseFloat(rpcBal);
 if (!isNaN(rpcNum)) {
 if (rpcNum === 0 && t.cacheBal > 0) match = "aÂÅ’ ZOMBIE!";
 else if (Math.abs(rpcNum - t.cacheBal) < t.cacheBal * 0.01) match = "aÅ“âEUR¦";
 else match = "aÅ¡Â iÂ¸Â DIFF";
 }
 
 out.push([t.name, t.contract.substring(0, 10) + "...", t.cacheBal, rpcBal, match]);
 }
 
 return out;
}

function DIAG_RPC_ZOMBIE_TEST() {
 var out = [["RPC", "LOUDER", "IJN", "SWEET", "ONCHAIN", "Verdict"]];
 
 var walletAddr = "0x6a3530ad9e5b1779de37f5e6af82999c325ea3f7";
 
 // Tokens zombies (RPC devrait retourner 0)
 var zombies = [
 { name: "LOUDER", contract: "0x120edc8e391ba4c94cb98bb65d8856ae6ec1525f" },
 { name: "IJN", contract: "0x2da1f02de055cebe51c6f6526ed67ad0dc86f431" },
 { name: "SWEET", contract: "0x8da2a47f76d928a97a8f44498db25aa787198087" },
 { name: "ONCHAIN", contract: "0xfef2d7b013b88fec2bfe4d2fee0aeb719af73481" }
 ];
 
 // Get all Base RPCs
 var rpcs = [];
 try {
 if (typeof BASE_CONFIG !== 'undefined' && BASE_CONFIG.RPC && BASE_CONFIG.RPC.ENDPOINTS) {
 rpcs = BASE_CONFIG.RPC.ENDPOINTS.slice(0, 10);
 }
 } catch (e) {}
 
 // Add public RPCs
 var publicRpcs = [
 "https://mainnet.base.org",
 "https://base.llamarpc.com",
 "https://base.drpc.org",
 "https://base-mainnet.public.blastapi.io",
 "https://1rpc.io/base"
 ];
 
 for (var i = 0; i < publicRpcs.length; i++) {
 if (rpcs.indexOf(publicRpcs[i]) < 0) rpcs.push(publicRpcs[i]);
 }
 
 // Test each RPC
 for (var r = 0; r < rpcs.length; r++) {
 var rpc = rpcs[r];
 var rpcName = rpc.replace("https://", "").split("/")[0].substring(0, 25);
 var results = [];
 var badCount = 0;
 
 for (var z = 0; z < zombies.length; z++) {
 var contract = zombies[z].contract;
 var bal = "?";
 
 try {
 var data = "0x70a08231000000000000000000000000" + walletAddr.substring(2).toLowerCase();
 var payload = {
 jsonrpc: "2.0",
 id: 1,
 method: "eth_call",
 params: [{ to: contract, data: data }, "latest"]
 };
 
 var response = UrlFetchApp.fetch(rpc, {
 method: "post",
 contentType: "application/json",
 payload: JSON.stringify(payload),
 muteHttpExceptions: true,
 timeout: 5000
 });
 
 var json = JSON.parse(response.getContentText());
 if (json.result && json.result !== "0x") {
 var rawBal = parseInt(json.result, 16);
 if (rawBal > 0) {
 bal = (rawBal / 1e18).toFixed(0);
 badCount++;
 } else {
 bal = "0 aÅ“âEURœ";
 }
 } else if (json.error) {
 bal = "ERR";
 } else {
 bal = "0 aÅ“âEURœ";
 }
 } catch (e) {
 bal = "TIMEOUT";
 }
 
 results.push(bal);
 }
 
 var verdict = badCount === 0 ? "aÅ“âEUR¦ GOOD" : "aÂÅ’ BAD (" + badCount + " zombies)";
 out.push([rpcName, results[0], results[1], results[2], results[3], verdict]);
 }
 
 return out;
}

