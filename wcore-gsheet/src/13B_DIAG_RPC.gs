/************************************************************
 * 13B_DIAG_RPC.gs - RPC and external API diagnostics
 * 
 * Version: v4.12.10
 * 
 * v4.12.10: Added DIAG_CHAIN_RPC_TEST() generic function
 *           Factorized from ETHEREUM, LISK, ZERO, UNICHAIN, SYNDICATE_COMMONS
 * 
 * CONSOLIDATED FROM:
 * - DIAG_ANKR.gs
 * - DIAG_BLOCKSCOUT.gs
 * - DIAG_GT_DIRECT.gs
 * - DIAG_WATCHDOG.gs
 ************************************************************/


// ============================================================
// FROM: DIAG_ANKR.gs
// ============================================================
function DIAG_ANKR_TEST_BASE() {
 return DIAG_ANKR_TEST("0x17d518736Ee9341dcDc0A2498e013D33cFcDD080", "base");
}

function DIAG_ANKR_TEST(wallet, chainId) {
 var out = [["Step", "Result", "Details"]];
 
 try {
 var address = (wallet || "").toLowerCase();
 out.push(["Wallet", address, ""]);
 out.push(["Chain", chainId, ""]);
 
 // Test 1: Basic API call
 var url = "https://rpc.ankr.com/multichain";
 var payload = {
 jsonrpc: "2.0",
 method: "ankr_getAccountBalance",
 params: {
 walletAddress: address,
 blockchain: [chainId],
 onlyWhitelisted: false
 },
 id: 1
 };
 
 out.push(["", "", ""]);
 out.push(["=== API CALL ===", "", ""]);
 out.push(["URL", url, ""]);
 out.push(["Payload", JSON.stringify(payload).substring(0, 100), ""]);
 
 var options = {
 method: "POST",
 contentType: "application/json",
 payload: JSON.stringify(payload),
 muteHttpExceptions: true
 };
 
 var response = UrlFetchApp.fetch(url, options);
 var code = response.getResponseCode();
 out.push(["HTTP Code", code, ""]);
 
 var text = response.getContentText();
 out.push(["Response length", text.length + " chars", ""]);
 
 // Parse response
 var data = JSON.parse(text);
 
 if (data.error) {
 out.push(["ERROR", data.error.code, data.error.message]);
 return out;
 }
 
 if (!data.result) {
 out.push(["Result", "NULL", "No result in response"]);
 out.push(["Raw (first 500)", text.substring(0, 500), ""]);
 return out;
 }
 
 out.push(["", "", ""]);
 out.push(["=== RESULT ===", "", ""]);
 
 if (data.result.totalBalanceUsd !== undefined) {
 out.push(["totalBalanceUsd", data.result.totalBalanceUsd, ""]);
 }
 
 if (!data.result.assets) {
 out.push(["Assets", "NULL", "No assets array"]);
 return out;
 }
 
 var assets = data.result.assets;
 out.push(["Assets count", assets.length, ""]);
 
 // List first 10 assets
 out.push(["", "", ""]);
 out.push(["=== FIRST 10 ASSETS ===", "", ""]);
 
 for (var i = 0; i < Math.min(10, assets.length); i++) {
 var a = assets[i];
 var val = (parseFloat(a.balanceUsd) || 0).toFixed(2);
 out.push([
 a.tokenSymbol || "???",
 a.balance + " ($" + val + ")",
 (a.contractAddress || "native").substring(0, 20)
 ]);
 }
 
 } catch (e) {
 out.push(["FATAL ERROR", e.message, e.stack ? e.stack.substring(0, 200) : ""]);
 }
 
 return out;
}

/**
 * Test with different Ankr endpoints
 */
function DIAG_ANKR_ENDPOINTS() {
 var out = [["Endpoint", "Status", "Assets"]];
 
 var wallet = "0x17d518736Ee9341dcDc0A2498e013D33cFcDD080".toLowerCase();
 
 var endpoints = [
 "https://rpc.ankr.com/multichain",
 "https://rpc.ankr.com/multichain/?ankr_getAccountBalance"
 ];
 
 for (var i = 0; i < endpoints.length; i++) {
 try {
 var payload = {
 jsonrpc: "2.0",
 method: "ankr_getAccountBalance",
 params: {
 walletAddress: wallet,
 blockchain: ["base"]
 },
 id: 1
 };
 
 var response = UrlFetchApp.fetch(endpoints[i], {
 method: "POST",
 contentType: "application/json",
 payload: JSON.stringify(payload),
 muteHttpExceptions: true
 });
 
 var data = JSON.parse(response.getContentText());
 var count = (data.result && data.result.assets) ? data.result.assets.length : 0;
 var err = data.error ? data.error.message : "";
 
 out.push([endpoints[i], response.getResponseCode(), count + " assets " + err]);
 } catch (e) {
 out.push([endpoints[i], "ERROR", e.message]);
 }
 }
 
 return out;
}

// ============================================================
// FROM: DIAG_BLOCKSCOUT.gs
// ============================================================
function DIAG_BLOCKSCOUT_TEST_BASE() {
 return DIAG_BLOCKSCOUT_TEST("0x17d518736Ee9341dcDc0A2498e013D33cFcDD080", "base");
}

function DIAG_BLOCKSCOUT_TEST(wallet, chain) {
 var out = [["Step", "Result", "Details"]];
 
 try {
 var address = wallet.toLowerCase();
 out.push(["Wallet", address, ""]);
 out.push(["Chain", chain, ""]);
 
 // Blockscout URLs per chain
 var BLOCKSCOUT_URLS = {
 "base": "https://base.blockscout.com",
 "ethereum": "https://eth.blockscout.com",
 "optimism": "https://optimism.blockscout.com",
 "arbitrum": "https://arbitrum.blockscout.com",
 "polygon": "https://polygon.blockscout.com",
 "gnosis": "https://gnosis.blockscout.com",
 "scroll": "https://scroll.blockscout.com",
 "zksync": "https://zksync.blockscout.com",
 "linea": "https://linea.blockscout.com"
 };
 
 var baseUrl = BLOCKSCOUT_URLS[chain];
 if (!baseUrl) {
 out.push(["ERROR", "Chain not supported", "Supported: " + Object.keys(BLOCKSCOUT_URLS).join(", ")]);
 return out;
 }
 
 // API endpoint for token balances
 var url = baseUrl + "/api/v2/addresses/" + address + "/tokens?type=ERC-20";
 out.push(["", "", ""]);
 out.push(["=== API CALL ===", "", ""]);
 out.push(["URL", url, ""]);
 
 var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
 var code = response.getResponseCode();
 out.push(["HTTP Code", code, ""]);
 
 if (code !== 200) {
 out.push(["ERROR", "HTTP " + code, response.getContentText().substring(0, 200)]);
 return out;
 }
 
 var text = response.getContentText();
 out.push(["Response length", text.length + " chars", ""]);
 
 var data = JSON.parse(text);
 
 out.push(["", "", ""]);
 out.push(["=== RESULT ===", "", ""]);
 
 // Blockscout v2 API returns { items: [...], next_page_params: {...} }
 var items = data.items || data;
 if (!Array.isArray(items)) {
 out.push(["Format", "Unknown", JSON.stringify(data).substring(0, 300)]);
 return out;
 }
 
 out.push(["Tokens found", items.length, ""]);
 
 // List first 15 tokens with value
 out.push(["", "", ""]);
 out.push(["=== TOKENS (first 15) ===", "", ""]);
 out.push(["Symbol", "Balance", "Value USD"]);
 
 var count = 0;
 for (var i = 0; i < items.length && count < 15; i++) {
 var item = items[i];
 var token = item.token || {};
 var symbol = token.symbol || "???";
 var decimals = parseInt(token.decimals) || 18;
 var rawBalance = item.value || "0";
 var balance = parseFloat(rawBalance) / Math.pow(10, decimals);
 
 // Exchange rate (USD value)
 var priceUsd = 0;
 if (token.exchange_rate) {
 priceUsd = parseFloat(token.exchange_rate) || 0;
 }
 var valueUsd = balance * priceUsd;
 
 // Only show tokens with balance
 if (balance > 0) {
 out.push([
 symbol,
 balance.toFixed(4),
 valueUsd > 0 ? "$" + valueUsd.toFixed(2) : "(no price)"
 ]);
 count++;
 }
 }
 
 // Check for pagination
 if (data.next_page_params) {
 out.push(["", "", ""]);
 out.push(["PAGINATION", "More tokens available", "next_page_params present"]);
 }
 
 } catch (e) {
 out.push(["FATAL ERROR", e.message, e.stack ? e.stack.substring(0, 200) : ""]);
 }
 
 return out;
}

/**
 * Test multiple Blockscout instances
 */
function DIAG_BLOCKSCOUT_CHAINS() {
 var out = [["Chain", "Status", "Tokens"]];
 
 var wallet = "0x17d518736Ee9341dcDc0A2498e013D33cFcDD080".toLowerCase();
 
 var chains = {
 "base": "https://base.blockscout.com",
 "optimism": "https://optimism.blockscout.com",
 "arbitrum": "https://arbitrum.blockscout.com"
 };
 
 for (var chain in chains) {
 try {
 var url = chains[chain] + "/api/v2/addresses/" + wallet + "/tokens?type=ERC-20";
 var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
 var code = response.getResponseCode();
 
 if (code === 200) {
 var data = JSON.parse(response.getContentText());
 var items = data.items || data;
 out.push([chain, "OK", Array.isArray(items) ? items.length + " tokens" : "?"]);
 } else {
 out.push([chain, "HTTP " + code, ""]);
 }
 } catch (e) {
 out.push([chain, "ERROR", e.message.substring(0, 50)]);
 }
 }
 
 return out;
}

// ============================================================
// FROM: DIAG_GT_DIRECT.gs
// ============================================================
function DIAG_GT_DIRECT_BASE() {
 var out = [["Step", "Value", "Details"]];
 
 var tokens = [
 { addr: "0xb3b32f9f8827d4634fe7d973fa1034ec9fddb3b3", name: "B3" },
 { addr: "0x23418de10d422ad71c9d5713a2b8991a9c586443", name: "BGCI" },
 { addr: "0x514d8e8099286a13486ef6c525c120f51c239b52", name: "OBT" },
 { addr: "0x1d008f50fb828ef9debbbeae1b71fffe929bf317", name: "CLANKFUN" },
 { addr: "0x48c6740bcf807d6c47c864faeea15ed4da3910ab", name: "SPACE" }
 ];
 
 // Test GeckoTerminal network for BASE
 var network = "base"; // GeckoTerminal network identifier
 
 for (var i = 0; i < tokens.length; i++) {
 var t = tokens[i];
 out.push(["", "", ""]);
 out.push(["=== " + t.name + " ===", t.addr, ""]);
 
 // Direct API call to GeckoTerminal
 var url = "https://api.geckoterminal.com/api/v2/networks/" + network + "/tokens/" + t.addr.toLowerCase();
 out.push(["URL", url.substring(0, 60) + "...", ""]);
 
 try {
 var response = UrlFetchApp.fetch(url, {
 muteHttpExceptions: true,
 headers: { 
 "accept": "application/json",
 "User-Agent": "Mozilla/5.0"
 }
 });
 
 var code = response.getResponseCode();
 out.push(["HTTP Code", code, ""]);
 
 if (code === 200) {
 var data = JSON.parse(response.getContentText());
 if (data && data.data && data.data.attributes) {
 var attr = data.data.attributes;
 out.push(["GT symbol", attr.symbol || "(empty)", ""]);
 out.push(["GT name", attr.name || "(empty)", ""]);
 out.push(["GT decimals", attr.decimals, ""]);
 } else {
 out.push(["Result", "No attributes", JSON.stringify(data).substring(0, 100)]);
 }
 } else if (code === 404) {
 out.push(["Result", "NOT FOUND on GeckoTerminal", ""]);
 
 // Try DexScreener as fallback
 var dexUrl = "https://api.dexscreener.com/latest/dex/tokens/" + t.addr.toLowerCase();
 var dexResp = UrlFetchApp.fetch(dexUrl, { muteHttpExceptions: true });
 if (dexResp.getResponseCode() === 200) {
 var dexData = JSON.parse(dexResp.getContentText());
 if (dexData.pairs && dexData.pairs.length > 0) {
 var pair = dexData.pairs[0];
 var baseToken = pair.baseToken || {};
 out.push(["DexScreener symbol", baseToken.symbol || "(empty)", ""]);
 out.push(["DexScreener name", baseToken.name || "(empty)", ""]);
 } else {
 out.push(["DexScreener", "No pairs found", ""]);
 }
 }
 } else {
 out.push(["Result", "HTTP " + code, response.getContentText().substring(0, 100)]);
 }
 } catch (e) {
 out.push(["Error", e.message, ""]);
 }
 }
 
 return out;
}

/**
 * Force inject metadata into cache for all 5 tokens
 */
function REPAIR_INJECT_METADATA_BASE() {
 var out = [["Token", "Action", "Result"]];
 
 var tokens = [
 { addr: "0xb3b32f9f8827d4634fe7d973fa1034ec9fddb3b3", symbol: "B3", name: "B3" },
 { addr: "0x23418de10d422ad71c9d5713a2b8991a9c586443", symbol: "BGCI", name: "Bloomberg Galaxy Crypto Index" },
 { addr: "0x514d8e8099286a13486ef6c525c120f51c239b52", symbol: "OBT", name: "Orbiter Token" },
 { addr: "0x1d008f50fb828ef9debbbeae1b71fffe929bf317", symbol: "CLANKFUN", name: "clank.fun" },
 { addr: "0x48c6740bcf807d6c47c864faeea15ed4da3910ab", symbol: "SPACE", name: "Nounspace" }
 ];
 
 try {
 var config = _BASE.getConfig();
 var wallet = "0x17d518736ee9341dcdc0a2498e013d33cfcdd080";
 
 // Load cache
 var cache = WalletCache.load(wallet, null, config);
 if (!cache || !cache.assets) {
 out.push(["ERROR", "Cache not found", ""]);
 return out;
 }
 
 // Update each token
 var updated = 0;
 for (var i = 0; i < tokens.length; i++) {
 var t = tokens[i];
 var tAddr = t.addr.toLowerCase();
 
 for (var j = 0; j < cache.assets.length; j++) {
 var asset = cache.assets[j];
 if (asset && asset.contract && asset.contract.toLowerCase() === tAddr) {
 var changed = false;
 if (!asset.symbol && t.symbol) { asset.symbol = t.symbol; changed = true; }
 if (!asset.name && t.name) { asset.name = t.name; changed = true; }
 
 if (changed) {
 out.push([t.symbol, "UPDATED", "symbol=" + asset.symbol + ", name=" + asset.name]);
 updated++;
 } else {
 out.push([t.symbol, "SKIPPED", "Already has metadata"]);
 }
 break;
 }
 }
 }
 
 // Save cache
 if (updated > 0) {
 WalletCache.save(wallet, cache, config);
 out.push(["", "", ""]);
 out.push(["SAVED", updated + " tokens updated", ""]);
 } else {
 out.push(["", "", ""]);
 out.push(["NO CHANGES", "All tokens already have metadata", ""]);
 }
 
 } catch (e) {
 out.push(["FATAL ERROR", e.message, ""]);
 }
 
 return out;
}

// ============================================================
// FROM: DIAG_WATCHDOG.gs
// ============================================================
function DIAG_WATCHDOG() {
 var out = [["Check", "Status", "Details", "Action"]];
 var hasIssue = false;
 
 // ============================================================
 // 1. Verifier si le trigger est installe
 // ============================================================
 try {
 var triggers = ScriptApp.getProjectTriggers();
 var watchdogTrigger = null;
 var triggerCount = 0;
 
 for (var i = 0; i < triggers.length; i++) {
 if (triggers[i].getHandlerFunction() === "WATCHDOG_FROM_RECAP") {
 watchdogTrigger = triggers[i];
 triggerCount++;
 }
 }
 
 if (triggerCount === 0) {
 out.push(["1. Trigger installe", "aÂÅ’ NON", "Aucun trigger WATCHDOG_FROM_RECAP trouve", "Executer INSTALL_WATCHDOG()"]);
 hasIssue = true;
 } else if (triggerCount > 1) {
 out.push(["1. Trigger installe", "aÅ¡Â iÂ¸Â MULTIPLE", triggerCount + " triggers trouves (devrait ÃƒÂªtre 1)", "Executer UNINSTALL_WATCHDOG() puis INSTALL_WATCHDOG()"]);
 hasIssue = true;
 } else {
 out.push(["1. Trigger installe", "aÅ“âEUR¦ OUI", "1 trigger actif", ""]);
 }
 } catch (e) {
 out.push(["1. Trigger installe", "aÂÅ’ ERREUR", e.message, "Verifier les permissions"]);
 hasIssue = true;
 }
 
 // ============================================================
 // 2. Verifier la feuille "Recap Chain"
 // ============================================================
 try {
 var ss = SpreadsheetApp.getActiveSpreadsheet();
 var recap = ss.getSheetByName("Recap Portfolio");
 
 if (!recap) {
 out.push(["2. Feuille Recap Chain", "aÂÅ’ ABSENTE", "La feuille 'Recap Chain' n'existe pas", "Creer une feuille 'Recap Chain' avec les noms des feuilles en colonne A"]);
 hasIssue = true;
 } else {
 var lastRow = recap.getLastRow();
 if (lastRow < 2) {
 out.push(["2. Feuille Recap Chain", "aÅ¡Â iÂ¸Â VIDE", "Aucune feuille listee", "Ajouter les noms des feuilles ÃƒÂ  monitorer en colonne A (ÃƒÂ  partir de A2)"]);
 hasIssue = true;
 } else {
 var sheetNames = recap.getRange(2, 1, lastRow - 1, 1).getValues()
 .map(function(r) { return String(r[0] || "").trim(); })
  .filter(function(n) { return n && n !== "Recap Portfolio"; });
 
 out.push(["2. Feuille Recap Chain", "aÅ“âEUR¦ OK", sheetNames.length + " feuilles listees", ""]);
 
 // Lister les 5 premieres feuilles
 var sample = sheetNames.slice(0, 5).join(", ");
 if (sheetNames.length > 5) sample += "...";
 out.push([" Feuilles trouvees", "", sample, ""]);
 }
 }
 } catch (e) {
 out.push(["2. Feuille Recap Chain", "aÂÅ’ ERREUR", e.message, ""]);
 hasIssue = true;
 }
 
 // ============================================================
 // 3. Verifier les dernieres stats du Watchdog
 // ============================================================
 try {
 var props = PropertiesService.getScriptProperties();
 var lastStats = props.getProperty("WD_LAST_STATS_v1");
 
 if (!lastStats) {
 out.push(["3. Derniere execution", "aÅ¡Â iÂ¸Â AUCUNE", "Le watchdog n'a jamais ete execute", "Attendre 1 minute ou executer WATCHDOG_FROM_RECAP() manuellement"]);
 hasIssue = true;
 } else {
 var stats = JSON.parse(lastStats);
 var execTime = stats.ts ? new Date(stats.ts) : null;
 var ageMinutes = execTime ? Math.round((Date.now() - execTime.getTime()) / 60000) : -1;
 
 if (ageMinutes > 5) {
 out.push(["3. Derniere execution", "aÅ¡Â iÂ¸Â ANCIENNE", "Il y a " + ageMinutes + " minutes", "Le trigger ne semble pas s'executer"]);
 hasIssue = true;
 } else {
 out.push(["3. Derniere execution", "aÅ“âEUR¦ RÃƒâEUR°CENTE", "Il y a " + ageMinutes + " min (" + stats.ts + ")", ""]);
 }
 
 // Details de la derniere execution
 out.push([" Status", "", stats.ok ? "OK" : "ERREUR: " + stats.note, ""]);
 out.push([" Feuilles scannees", "", stats.probe + " sur " + stats.N, ""]);
 out.push([" J1 synchronises", "", stats.synced + " / " + stats.toSync + " en attente", ""]);
 out.push([" B1 pulses", "", stats.b1Set + " (empty:" + (stats.b1Empty||0) + " stale:" + (stats.b1Stale||0) + " error:" + (stats.b1Error||0) + ")", ""]);
 out.push([" Duree exec", "", stats.exec_ms + " ms", ""]);
 
 if (stats.note && stats.note !== "ok") {
 out.push([" Note/Erreur", "aÅ¡Â iÂ¸Â", stats.note, ""]);
 hasIssue = true;
 }
 }
 } catch (e) {
 out.push(["3. Derniere execution", "aÂÅ’ ERREUR", e.message, ""]);
 hasIssue = true;
 }
 
 // ============================================================
 // 4. Verifier le curseur de rotation
 // ============================================================
 try {
 var props = PropertiesService.getScriptProperties();
 var cursor = props.getProperty("WD_CURSOR_v2");
 var installedAt = props.getProperty("WD_INSTALLED_AT_v2");
 
 out.push(["4. Curseur rotation", "", "Position actuelle: " + (cursor || "0"), ""]);
 if (installedAt) {
 out.push([" Installe le", "", installedAt, ""]);
 }
 } catch (e) {
 out.push(["4. Curseur rotation", "aÂÅ’ ERREUR", e.message, ""]);
 }
 
 // ============================================================
 // 5. Test d'une feuille specifique (premiere de la liste)
 // ============================================================
 try {
 var ss = SpreadsheetApp.getActiveSpreadsheet();
 var recap = ss.getSheetByName("Recap Portfolio");
 
 if (recap && recap.getLastRow() >= 2) {
 var firstSheetName = String(recap.getRange("A2").getValue() || "").trim();
 
 if (firstSheetName && firstSheetName !== "Recap Portfolio") {
 var testSheet = ss.getSheetByName(firstSheetName);
 
 if (!testSheet) {
 out.push(["5. Test feuille '" + firstSheetName + "'", "aÂÅ’ INTROUVABLE", "La feuille listee n'existe pas", "Verifier le nom dans Recap Chain"]);
 hasIssue = true;
 } else {
 var vA2 = String(testSheet.getRange("A2").getDisplayValue() || "");
 var vI1 = String(testSheet.getRange("I1").getDisplayValue() || "");
 var vJ1 = String(testSheet.getRange("J1").getDisplayValue() || "");
 var vB1 = String(testSheet.getRange("B1").getDisplayValue() || "");
 
 out.push(["5. Test feuille '" + firstSheetName + "'", "Ã°Å¸âEURœâEUR¹ VALEURS", "", ""]);
 out.push([" A2 (chain_name)", "", vA2.substring(0, 50), ""]);
 out.push([" I1 (last_update)", "", vI1, _isValidDateFormat(vI1) ? "aÅ“âEUR¦ Format OK" : "aÅ¡Â iÂ¸Â Format invalide"]);
 out.push([" J1 (synced)", "", vJ1, ""]);
 out.push([" B1 (pulse)", "", vB1, ""]);
 
 // Verifier si I1 > J1 (devrait ÃƒÂªtre synchronise)
 if (_isValidDateFormat(vI1)) {
 var i1Ms = _parseDate(vI1);
 var j1Ms = _isValidDateFormat(vJ1) ? _parseDate(vJ1) : 0;
 
 if (i1Ms > j1Ms) {
 out.push([" aÅ¡Â iÂ¸Â DÃƒâEUR°SYNCHRONISÃƒâEUR°", "", "I1 (" + vI1 + ") > J1 (" + vJ1 + ")", "Le watchdog devrait synchroniser"]);
 hasIssue = true;
 } else if (i1Ms === j1Ms) {
 out.push([" aÅ“âEUR¦ SYNCHRONISÃƒâEUR°", "", "I1 = J1", ""]);
 }
 } else if (vI1) {
 out.push([" aÅ¡Â iÂ¸Â FORMAT I1", "", "'" + vI1 + "' n'est pas au format YYYY-MM-DD HH:MM:SS", "Verifier la formule qui genere I1"]);
 hasIssue = true;
 } else {
 out.push([" aÅ¡Â iÂ¸Â I1 VIDE", "", "Aucune valeur dans I1", "Verifier que GET_WALLET_ASSETS fonctionne"]);
 hasIssue = true;
 }
 }
 }
 }
 } catch (e) {
 out.push(["5. Test feuille", "aÂÅ’ ERREUR", e.message, ""]);
 hasIssue = true;
 }
 
 // ============================================================
 // Resume
 // ============================================================
 out.push(["", "", "", ""]);
 if (hasIssue) {
 out.push(["Ã°Å¸âEURÂ´ RÃƒâEUR°SUMÃƒâEUR°", "PROBLÃƒË†ME DÃƒâEUR°TECTÃƒâEUR°", "Voir les actions recommandees ci-dessus", ""]);
 } else {
 out.push(["Ã°Å¸Å¸Â¢ RÃƒâEUR°SUMÃƒâEUR°", "TOUT SEMBLE OK", "Si J1 ne se met pas ÃƒÂ  jour, attendre quelques minutes", ""]);
 }
 
 return out;
}

/**
 * Diagnostic d'une feuille specifique
 * @param {string} sheetName - Nom de la feuille ÃƒÂ  diagnostiquer
 * @returns {Array} Rapport de diagnostic
 * @customfunction
 */
function DIAG_WATCHDOG_SHEET(sheetName) {
 if (!sheetName) {
 return [["Usage", "=DIAG_WATCHDOG_SHEET(\"Base\")"]];
 }
 
 var out = [["Cell", "Value", "Status", "Details"]];
 
 try {
 var ss = SpreadsheetApp.getActiveSpreadsheet();
 var sheet = ss.getSheetByName(sheetName);
 
 if (!sheet) {
 return [["ERROR", "Feuille '" + sheetName + "' non trouvee", "", ""]];
 }
 
 // Lire les cellules cles
 var cells = {
 "A2": sheet.getRange("A2").getDisplayValue(),
 "B1": sheet.getRange("B1").getDisplayValue(),
 "I1": sheet.getRange("I1").getDisplayValue(),
 "J1": sheet.getRange("J1").getDisplayValue()
 };
 
 // A2 - chain_name
 var vA2 = String(cells["A2"] || "");
 var a2Status = vA2.startsWith("#") || vA2.toLowerCase().includes("erreur") ? "aÅ¡Â iÂ¸Â ERREUR" : "aÅ“âEUR¦ OK";
 out.push(["A2", vA2.substring(0, 60), a2Status, "chain_name de la premiere ligne de donnees"]);
 
 // B1 - pulse trigger
 var vB1 = String(cells["B1"] || "");
 var b1Status = vB1 ? (_isValidDateFormat(vB1) ? "aÅ“âEUR¦ OK" : "aÅ¡Â iÂ¸Â Format?") : "aÅ¡Âª Vide";
 out.push(["B1", vB1, b1Status, "Timestamp du dernier pulse (trigger refresh)"]);
 
 // I1 - last_update
 var vI1 = String(cells["I1"] || "");
 var i1Status = "aÅ¡Âª Vide";
 if (vI1) {
 i1Status = _isValidDateFormat(vI1) ? "aÅ“âEUR¦ Format OK" : "aÂÅ’ Format invalide";
 }
 out.push(["I1", vI1, i1Status, "Dernier update des donnees (source)"]);
 
 // J1 - synced
 var vJ1 = String(cells["J1"] || "");
 var j1Status = vJ1 ? (_isValidDateFormat(vJ1) ? "aÅ“âEUR¦ OK" : "aÅ¡Â iÂ¸Â Format?") : "aÅ¡Âª Vide";
 out.push(["J1", vJ1, j1Status, "Copie de I1 par le watchdog (destination)"]);
 
 // Analyse de synchronisation
 out.push(["", "", "", ""]);
 out.push(["--- ANALYSE ---", "", "", ""]);
 
 if (!vI1) {
 out.push(["Probleme", "I1 est vide", "aÂÅ’", "La formule GET_WALLET_ASSETS ne retourne pas de last_update"]);
 } else if (!_isValidDateFormat(vI1)) {
 out.push(["Probleme", "Format I1 invalide", "aÂÅ’", "Attendu: YYYY-MM-DD HH:MM:SS, recu: '" + vI1 + "'"]);
 } else {
 var i1Ms = _parseDate(vI1);
 var j1Ms = vJ1 && _isValidDateFormat(vJ1) ? _parseDate(vJ1) : 0;
 var nowMs = Date.now();
 var ageMinutes = Math.round((nowMs - i1Ms) / 60000);
 
 out.push(["ÃƒâEURšge de I1", ageMinutes + " minutes", ageMinutes > 60 ? "aÅ¡Â iÂ¸Â > 1h" : "aÅ“âEUR¦", ""]);
 
 if (j1Ms === 0) {
 out.push(["Sync status", "J1 vide ou invalide", "aÅ¡Â iÂ¸Â", "Le watchdog devrait copier I1 vers J1"]);
 } else if (i1Ms > j1Ms) {
 var diffSec = Math.round((i1Ms - j1Ms) / 1000);
 out.push(["Sync status", "DÃƒâEUR°SYNCHRONISÃƒâEUR°", "aÅ¡Â iÂ¸Â", "I1 est plus recent que J1 de " + diffSec + " secondes"]);
 } else {
 out.push(["Sync status", "SYNCHRONISÃƒâEUR°", "aÅ“âEUR¦", "I1 = J1"]);
 }
 }
 
 // Verifier si cette feuille est dans Recap Portfolio
 var recap = ss.getSheetByName("Recap Portfolio");
 if (recap) {
 var lastRow = recap.getLastRow();
 if (lastRow >= 2) {
 var recapNames = recap.getRange(2, 1, lastRow - 1, 1).getValues()
 .map(function(r) { return String(r[0] || "").trim(); });
 
 var isListed = recapNames.indexOf(sheetName) >= 0;
 out.push(["Dans Recap Chain", isListed ? "OUI" : "NON", isListed ? "aÅ“âEUR¦" : "aÂÅ’", isListed ? "" : "Ajouter '" + sheetName + "' dans Recap Chain!A"]);
 }
 }
 
 } catch (e) {
 out.push(["ERROR", e.message, "aÂÅ’", ""]);
 }
 
 return out;
}

/**
 * Reinstalle le watchdog (fix rapide)
 * @returns {Array} Resultat
 * @customfunction
 */
function DIAG_WATCHDOG_FIX() {
 var out = [["Action", "Status", "Details"]];
 
 try {
 // 1. Desinstaller les anciens triggers
 var triggers = ScriptApp.getProjectTriggers();
 var removed = 0;
 
 for (var i = 0; i < triggers.length; i++) {
 if (triggers[i].getHandlerFunction() === "WATCHDOG_FROM_RECAP") {
 ScriptApp.deleteTrigger(triggers[i]);
 removed++;
 }
 }
 out.push(["1. Suppression anciens triggers", "aÅ“âEUR¦", removed + " trigger(s) supprime(s)"]);
 
 // 2. Installer nouveau trigger (GAS n'accepte que 1/5/10/15/30 min; 5 min = compromis)
 ScriptApp.newTrigger("WATCHDOG_FROM_RECAP")
 .timeBased()
 .everyMinutes(5)
 .create();
 out.push(["2. Installation nouveau trigger", "aÅ“âEUR¦", "Trigger cree (every 5 min)"]);
 
 // 3. Reset du curseur
 var props = PropertiesService.getScriptProperties();
 props.setProperty("WD_CURSOR_v2", "0");
 props.setProperty("WD_INSTALLED_AT_v2", new Date().toISOString());
 out.push(["3. Reset curseur", "aÅ“âEUR¦", "Curseur remis ÃƒÂ  0"]);
 
 // 4. Execution manuelle pour test
 try {
 WATCHDOG_FROM_RECAP();
 out.push(["4. Execution test", "aÅ“âEUR¦", "Watchdog execute avec succes"]);
 } catch (e) {
 out.push(["4. Execution test", "aÅ¡Â iÂ¸Â", "Erreur: " + e.message]);
 }
 
 out.push(["", "", ""]);
 out.push(["Ã°Å¸Å¸Â¢ WATCHDOG RÃƒâEUR°INSTALLÃƒâEUR°", "", "Attendez 1-2 minutes et verifiez avec =DIAG_WATCHDOG()"]);
 
 } catch (e) {
 out.push(["ERREUR", "aÂÅ’", e.message]);
 }
 
 return out;
}

/**
 * Force la synchronisation I1 -> J1 pour une feuille
 * @param {string} sheetName - Nom de la feuille
 * @returns {string} Resultat
 * @customfunction
 */
function FORCE_SYNC_J1(sheetName) {
 if (!sheetName) {
 return "Usage: =FORCE_SYNC_J1(\"Base\")";
 }
 
 try {
 var ss = SpreadsheetApp.getActiveSpreadsheet();
 var sheet = ss.getSheetByName(sheetName);
 
 if (!sheet) {
 return "Feuille '" + sheetName + "' non trouvee";
 }
 
 var vI1 = String(sheet.getRange("I1").getDisplayValue() || "");
 
 if (!vI1) {
 return "I1 est vide - rien ÃƒÂ  synchroniser";
 }
 
 sheet.getRange("J1").setValue(vI1);
 
 return "J1 synchronise avec I1: " + vI1;
 
 } catch (e) {
 return "Erreur: " + e.message;
 }
}

// ============================================================
// Helpers
// ============================================================

function _isValidDateFormat(s) {
 s = String(s || "").replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
 return /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(s);
}

/**
 * v4.15.23: Diag cell reader — returns the last WATCHDOG_FROM_RECAP dump
 * Written by WATCHDOG_FROM_RECAP at end of every run (property WCORE_WD_LAST_DIAG)
 * Usage: =WCORE_WD_LAST_DIAG_READ() in any empty cell
 * @customfunction
 */
function WCORE_WD_LAST_DIAG_READ(_force) {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty("WCORE_WD_LAST_DIAG");
    if (!raw) return "[UNSET] WATCHDOG_FROM_RECAP jamais exécuté depuis déploiement du diag";
    return raw;
  } catch (e) {
    return "[ERR] " + e.message;
  }
}

/**
 * v4.15.23: Trigger inventory diag — lists handler functions installed as triggers.
 * Uses PropertiesService-cached snapshot written by WATCHDOG_FROM_RECAP diag path.
 * Falls back to empty string if no snapshot yet.
 * @customfunction
 */
function WCORE_WD_TRIGGER_SNAPSHOT_READ(_force) {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty("WCORE_WD_TRIGGER_SNAPSHOT");
    if (!raw) return "[UNSET] snapshot vide";
    return raw;
  } catch (e) {
    return "[ERR] " + e.message;
  }
}

/**
 * v4.15.83: Read compact WATCHDOG_FROM_RECAP heartbeat.
 * This is intentionally separate from WCORE_WD_LAST_DIAG, which is a large
 * diagnostic JSON blob and can be stale when ScriptProperties is under pressure.
 * @customfunction
 */
function WCORE_WD_HEARTBEAT_READ(_force) {
  try {
    var props = PropertiesService.getScriptProperties();
    var ms = props.getProperty("WCORE_WD_LAST_RUN_MS") || "";
    var iso = props.getProperty("WCORE_WD_LAST_RUN_ISO") || "";
    var ageMin = "UNKNOWN";
    var n = parseInt(ms, 10);
    if (isFinite(n) && n > 0) ageMin = Math.round((Date.now() - n) / 60000);
    return JSON.stringify({ ms: ms, iso: iso, ageMin: ageMin });
  } catch (e) {
    return "[ERR] " + e.message;
  }
}

function _parseDate(s) {
 s = String(s || "").replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
 if (!_isValidDateFormat(s)) return NaN;
 
 var parts = s.replace("T", " ").split(" ");
 if (parts.length < 2) return NaN;
 
 var d = parts[0].split("-");
 var hm = parts[1].split(":");
 if (d.length !== 3 || hm.length < 2) return NaN;
 
 var yyyy = parseInt(d[0], 10);
 var mm = parseInt(d[1], 10);
 var dd = parseInt(d[2], 10);
 var HH = parseInt(hm[0], 10);
 var MI = parseInt(hm[1], 10);
 var SS = hm.length >= 3 ? parseInt(hm[2], 10) : 0;
 
 var dt = new Date(yyyy, mm - 1, dd, HH, MI, SS, 0);
 return dt.getTime();
}


// ============================================================
// GENERIC RPC ENDPOINT TEST (v4.12.9)
// Factorized from ETHEREUM, LISK, ZERO, UNICHAIN, SYNDICATE_COMMONS
// ============================================================

/**
 * Generic RPC endpoint health test for any EVM chain
 * Tests each RPC endpoint by calling eth_chainId and measuring response time
 * 
 * @param {string} chainName - Chain name (e.g., "ETHEREUM", "LISK", "ZERO")
 * @param {Object} [options] - Optional configuration
 * @param {number} [options.timeout] - HTTP timeout in ms (default: 5000)
 * @param {number} [options.fastThreshold] - Time in ms below which is "FAST" (default: 1000)
 * @param {number} [options.okThreshold] - Time in ms below which is "OK" (default: 2000)
 * @returns {Array} Results table for Sheets display
 */
function DIAG_CHAIN_RPC_TEST(chainName, options) {
 options = options || {};
 var timeout = options.timeout || 5000;
 var fastThreshold = options.fastThreshold || 1000;
 var okThreshold = options.okThreshold || 2000;
 
 // Get chain config via eval (standard WCORE pattern)
 var chainObj;
 try {
   chainObj = eval("_" + chainName);
 } catch (e) {
   return [["Error", "Chain not found: " + chainName, ""]];
 }
 
 if (!chainObj || typeof chainObj.getConfig !== "function") {
   return [["Error", "Invalid chain object: " + chainName, ""]];
 }
 
 var config = chainObj.getConfig();
 var endpoints = (config.RPC && config.RPC.ENDPOINTS) || [];
 
 if (!endpoints.length) {
   return [["Error", "No RPC endpoints configured for " + chainName, ""]];
 }
 
 // v4.14.9: Use _originalUrlFetch to bypass QuotaCircuitBreaker patch
 // DIAG must test actual RPC connectivity, not breaker state
 var realFetch = (typeof _originalUrlFetch !== 'undefined') ? _originalUrlFetch : UrlFetchApp.fetch;

 var out = [["#", "RPC Endpoint", "Status", "Time (ms)", "Details"]];

 for (var i = 0; i < endpoints.length; i++) {
   var rpc = endpoints[i];
   var status = "FAIL";
   var timeMs = 0;
   var details = "";

   var t0 = Date.now();
   try {
     var response = realFetch.call(UrlFetchApp, rpc, {
       method: "post",
       contentType: "application/json",
       payload: JSON.stringify({
         jsonrpc: "2.0",
         id: 1,
         method: "eth_chainId",
         params: []
       }),
       muteHttpExceptions: true,
       timeout: timeout
     });
     
     timeMs = Date.now() - t0;
     
      if (response.getResponseCode() === 200) {
        var json = JSON.parse(response.getContentText());
        if (json.result) {
          var chainId = parseInt(json.result, 16);
          status = timeMs < fastThreshold ? "FAST" : (timeMs < okThreshold ? "OK" : "SLOW");
          details = "chainId=" + chainId;
        } else {
          // v4.15.50: some Blockscout proxies return null for eth_chainId but
          // serve eth_blockNumber correctly (e.g. racescan.io). Treat alive.
          var aliveViaBn = false;
          try {
            var bnResp = realFetch.call(UrlFetchApp, rpc, {
              method: "post", contentType: "application/json",
              payload: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
              muteHttpExceptions: true, timeout: timeout
            });
            if (bnResp.getResponseCode() === 200) {
              var bnJson = JSON.parse(bnResp.getContentText());
              if (bnJson && !bnJson.error && bnJson.result != null) aliveViaBn = true;
            }
          } catch (eBn) {}
          if (aliveViaBn) {
            status = timeMs < fastThreshold ? "FAST" : (timeMs < okThreshold ? "OK" : "SLOW");
            details = "alive (no chainId; blockNumber OK)";
          } else if (json.error) {
            details = json.error.message || "RPC error";
          }
        }
      } else {
        details = "HTTP " + response.getResponseCode();
      }
   } catch (e) {
     timeMs = Date.now() - t0;
     details = String(e.message || e).substring(0, 50);
   }
   
   var rpcDisplay = rpc.length > 45 ? rpc.substring(0, 42) + "..." : rpc;
   out.push([i + 1, rpcDisplay, status, timeMs, details]);
 }
 
 // Summary row
 var okCount = 0;
 for (var j = 1; j < out.length; j++) {
   var st = out[j][2];
   if (st === "FAST" || st === "OK" || st === "SLOW") okCount++;
 }
 out.push(["", "SUMMARY", okCount + "/" + endpoints.length + " healthy", "", chainName]);
 
 return out;
}
