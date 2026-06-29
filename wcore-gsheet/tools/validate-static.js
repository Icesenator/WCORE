const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const srcDir = path.join(root, "src");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function readIfExists(rel) {
  const filePath = path.join(root, rel);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : null;
}

function fail(errors, message) {
  errors.push(message);
}

function listGsFiles() {
  return fs.readdirSync(srcDir)
    .filter((name) => name.endsWith(".gs"))
    .map((name) => path.join(srcDir, name));
}

const errors = [];

// Global Apps Script functions all share one namespace. Duplicate declarations
// are almost always accidental because the last loaded file silently wins.
const globals = new Map();
for (const file of listGsFiles()) {
  const rel = path.relative(root, file).replace(/\\/g, "/");
  const text = fs.readFileSync(file, "utf8");
  const re = /^function\s+([A-Za-z_$][\w$]*)\s*\(/gm;
  let match;
  while ((match = re.exec(text))) {
    const name = match[1];
    if (!globals.has(name)) globals.set(name, []);
    globals.get(name).push(rel);
  }
}

for (const [name, files] of globals.entries()) {
  if (files.length > 1) {
    fail(errors, `Duplicate global function ${name}: ${files.join(", ")}`);
  }
}

const base = read("src/10A_BASE_ENGINE.gs");
const baseVersionIdx = base.indexOf('var BASE_ENGINE_VERSION = "');
const baseRegisterIdx = base.indexOf('ModuleRegistry.register("BASE_ENGINE"');
if (baseVersionIdx < 0) fail(errors, "BASE_ENGINE_VERSION declaration not found");
if (baseRegisterIdx < 0) fail(errors, "BASE_ENGINE ModuleRegistry registration not found");
if (baseVersionIdx >= 0 && baseRegisterIdx >= 0 && baseVersionIdx > baseRegisterIdx) {
  fail(errors, "BASE_ENGINE_VERSION is declared after ModuleRegistry.register");
}

const chainFactory = read("src/19_CHAIN_FACTORY.gs");
if (/var\s+expected\s*=\s*['"]4\.12\.1['"]/.test(chainFactory)) {
  fail(errors, "ChainFactory.checkVersionSync still uses stale expected 4.12.1");
}

const init = read("src/01_INIT.gs");
const versionMatch = init.match(/MAJOR:\s*(\d+)[\s\S]*?MINOR:\s*(\d+)[\s\S]*?PATCH:\s*(\d+)/);
if (!versionMatch) {
  fail(errors, "WCORE_VERSION declaration is missing");
} else {
  const [, major, minor, patch] = versionMatch.map(Number);
  const versionNumber = major * 10000 + minor * 100 + patch;
  const minimumVersion = 4 * 10000 + 15 * 100 + 28;
  if (versionNumber < minimumVersion) {
    fail(errors, `WCORE_VERSION must be at least v4.15.28, found v${major}.${minor}.${patch}`);
  }
}
if (/function\s+WCORE_VERSION_CHECK\s*\([\s\S]*var\s+targetVersion\s*=\s*['"]/.test(init)) {
  fail(errors, "WCORE_VERSION_CHECK still uses a hardcoded targetVersion");
}

const tempo = read("src/TEMPO.gs");
if (!/NATIVE_SYMBOL:\s*""/.test(tempo)) {
  fail(errors, "Tempo native symbol must remain disabled");
}
if (!/NATIVE_NAME:\s*""/.test(tempo)) {
  fail(errors, "Tempo native name must remain disabled");
}
if (!/NATIVE_DECIMALS:\s*0/.test(tempo)) {
  fail(errors, "Tempo native decimals must remain 0");
}
if (!tempo.includes("0x20c0000000000000000000000000000000000000")) {
  fail(errors, "Tempo USD token contract comment is missing");
}
if (!tempo.includes("0x20c000000000000000000000b9537d11c60e8b50")) {
  fail(errors, "Tempo USDC.e token contract comment is missing");
}

const evm = read("src/11_EVM_ENGINE.gs");
if (!evm.includes("NATIVE_BALANCE_TOKEN_CONTRACT")) {
  fail(errors, "EVM engine no longer handles NATIVE_BALANCE_TOKEN_CONTRACT");
}
if (!evm.includes("NATIVE_BALANCE_RPC")) {
  fail(errors, "EVM engine no longer honors NATIVE_BALANCE_RPC");
}
if (!evm.includes("Cached Ledger sheets can call only CACHED_WALLET_ASSETS_*")) {
  fail(errors, "EVM cached native override guard is missing");
}
if (!evm.includes("CACHED_LIVE_METADATA === true")) {
  fail(errors, "EVM cached live metadata opt-in guard is missing");
}
if (!evm.includes("cachedQuotaBlocked")) {
  fail(errors, "EVM cached native override is not quota-aware");
}
if (!evm.includes('nativeInfo.replace("cycle:DONE", "cycle:partial")')) {
  fail(errors, "EVM INFO_NATIVE must not report cycle:DONE while metadata or price gaps remain");
}

const baseEngineStats = read("src/10A_BASE_ENGINE.gs");
if (!baseEngineStats.includes("scanStats.missingPrices || 0") || !baseEngineStats.includes("scanStats.missingMeta || 0") ||
    !baseEngineStats.includes("cycleDone = totalContracts === 0 || (scanStats.fullCycleComplete && missingPrices <= 0 && missingMeta <= 0)")) {
  fail(errors, "BaseEngine Rotation.cycle must not report DONE while metadata or price gaps remain");
}

const activityRefresh = read("src/27_ACTIVITY_REFRESH.gs");
if (!activityRefresh.includes("cycleDone = !!(scanStats.fullCycleComplete && missingPrices <= 0 && missingMeta <= 0)")) {
  fail(errors, "Activity refresh cycle status must not report DONE while metadata or price gaps remain");
}

const degraded = read("src/24_DEGRADED_MODE.gs");
if (/function\s*\([^)]*\)\s*\{[\s\S]*?assets:\s*\[\][\s\S]*?WalletCache\.save/.test(degraded)) {
  fail(errors, "DegradedMode must not save empty wallet cache entries when cache is unavailable");
}

const listing = read("src/17_LISTING.gs");
if (/function\s+onOpen\s*\(/.test(listing)) {
  fail(errors, "WCORE must not depend on onOpen; automation must run from installable triggers");
}
if (/createMenu\s*\(\s*["']WCORE["']\s*\)/.test(listing)) {
  fail(errors, "WCORE menu must not be created; manual UI actions are not part of normal operations");
}
if (/function\s+MENU_[A-Za-z0-9_]*\s*\(/.test(listing)) {
  fail(errors, "WCORE menu wrapper functions must be removed or renamed to non-UI automation entry points");
}
if (!listing.includes("LEDGER_RETIRED_NAMES")) {
  fail(errors, "Listing must keep an explicit retired-ledger filter");
}
if (!listing.includes('"ledger - mint"')) {
  fail(errors, "Ledger - Mint must be excluded from Recap Chain listings");
}
if (!/getRange\(\s*newLastRow\s*\+\s*1\s*,\s*1\s*,\s*lastRow\s*-\s*newLastRow\s*,\s*10\s*\)\.clearContent\(\)/.test(listing)) {
  fail(errors, "Recap Chain stale cleanup must clear the managed A:J block, not only column A");
}

const http = read("src/03_HTTP.gs");
if (!http.includes("canFetchNow: function")) {
  fail(errors, "Http module must expose canFetchNow() as the central no-fetch quota gate");
}
if (!http.includes("isBlocked: function")) {
  fail(errors, "Http module must expose isBlocked() for cache-first quota checks");
}
if (!http.includes("BudgetHTTP.allow")) {
  fail(errors, "Http.canFetchNow() must enforce category budgets through BudgetHTTP.allow()");
}
if (!http.includes("WcoreHttpMode.isAllowed")) {
  fail(errors, "Http.canFetchNow() must enforce WCORE_HTTP_MODE through WcoreHttpMode.isAllowed()");
}
for (const method of ["get", "post", "fetchAll", "fetchAllSafe", "fetchWithRetry"]) {
  const pattern = new RegExp(`${method}: function[\\s\\S]*?this\\.canFetchNow`);
  if (!pattern.test(http)) {
    fail(errors, `Http.${method} must call canFetchNow() before UrlFetchApp`);
  }
}

const savings = read("src/26B_HTTP_SAVINGS.gs");
if (!savings.includes("Http.canFetchNow(\"26B.fetch\")")) {
  fail(errors, "HttpCallCounter fetch patch must not increment when quota is already blocked");
}
if (!savings.includes("Http.canFetchNow(\"26B.fetchAll\")")) {
  fail(errors, "HttpCallCounter fetchAll patch must not increment when quota is already blocked");
}

const prices = read("src/07_PRICES.gs");
const webPriceIdx = prices.indexOf("PriceSources.wcoreWebBatchPrices(list");
const dexBulkIdx = prices.indexOf("PriceSources.dexBulkTokens(list");
if (webPriceIdx < 0) {
  fail(errors, "Price engine must call WCORE Web batch pricing source");
}
if (webPriceIdx >= 0 && dexBulkIdx >= 0 && webPriceIdx > dexBulkIdx) {
  fail(errors, "WCORE Web batch pricing must run before DexScreener/GT fallbacks");
}
if (!prices.includes("/api/gsheet/prices")) {
  fail(errors, "Price engine must call /api/gsheet/prices for delegated web pricing");
}
if (!prices.includes("function _pxHttpBlocked")) {
  fail(errors, "Prices must have a direct-fetch no-fetch guard");
}
if (!prices.includes("PriceManager.setAttemptTs_")) {
  fail(errors, "PriceManager must support structured variable attempt cooldowns");
}
if (!prices.includes("PRICE_NEGATIVE_TTL_MS")) {
  fail(errors, "Price negative-cache TTL must be explicit");
}
if (!prices.includes("_pxHttpBlocked(\"llama-buffer\")")) {
  fail(errors, "Llama flush buffer must skip direct fetches when HTTP is blocked");
}
if (!prices.includes("_pxHttpBlocked(\"price-json-retry\")")) {
  fail(errors, "Price JSON retry helper must skip direct fetches when HTTP is blocked");
}
if (!prices.includes("_pxHttpBlocked(\"gt-meta\")")) {
  fail(errors, "GeckoTerminal metadata direct fetch must skip when HTTP is blocked");
}
if (!prices.includes("dexL1Seen") || !prices.includes("misses.push(aaMiss)")) {
  fail(errors, "DexScreener bulk L1 cache misses must still be fetched from the network");
}
if (!prices.includes("var bestTry3Usd = null;") || !prices.includes("var bestTry3Reserve = -1;")) {
  fail(errors, "GeckoTerminal Try3 must rank candidate pools instead of taking the first priced pool");
}
if (!prices.includes("pa.token_price_usd")) {
  fail(errors, "GeckoTerminal Try3 must accept token_price_usd from /pools responses");
}
if (!prices.includes("allPools = allPools.concat(pass.pools);")) {
  fail(errors, "On-chain V3 inspector must aggregate pools across Base factories");
}
if (prices.includes("if (chosen) break;")) {
  fail(errors, "On-chain V3 inspector must not stop at the first factory with a price");
}

const cacheGlobal = read("src/04C_CACHE_GLOBAL.gs");
if (!cacheGlobal.includes("touchTargets = function")) {
  fail(errors, "GlobalPriceCache must expose touchTargets() so pricing worker can process unpriced active contracts");
}
if (!cacheGlobal.includes("num === 0 && Object.prototype.hasOwnProperty.call(ptSrc, k)")) {
  fail(errors, "WalletCache migration must preserve explicit no-market zero prices when priceTsMap has the key");
}
if (!cacheGlobal.includes('reason: "partial_less_assets"') || !cacheGlobal.includes("fullCycleComplete === false")) {
  fail(errors, "WalletCache.save must preserve fuller caches when partial scans return fewer assets");
}

const cacheWallet = read("src/04B_CACHE_WALLET.gs");
if (!cacheWallet.includes("pn === 0 && Object.prototype.hasOwnProperty.call(ptSrc, pk)") || !cacheWallet.includes("out.pt = obj.priceTsMap")) {
  fail(errors, "Packed wallet deflate must preserve no-market zero prices and their timestamps");
}

const baseEngine = read("src/10A_BASE_ENGINE.gs");
if (!baseEngine.includes("registerPricingWorkerTargets")) {
  fail(errors, "BaseEngine must register active pricing targets for the pricing worker");
}
if (!baseEngine.includes('reason: "partial_less_assets"') || !baseEngine.includes("fullCycleComplete === false")) {
  fail(errors, "BaseEngine cache write guard must preserve fuller caches on partial shorter scans");
}
if (baseEngine.includes('cached.src === "no-market"') || baseEngine.includes("priceEur: 0") ||
    baseEngine.includes("_noMarketPrice")) {
  fail(errors, "BaseEngine must not apply no-market worker entries as zero prices");
}
if (!baseEngine.includes("return null; // no-market is not a price")) {
  fail(errors, "BaseEngine must ignore historical no-market entries as non-prices");
}

const output = read("src/10_OUTPUT.gs");
if (output.includes("_isExplicitZeroPrice") || output.includes("priceVal === 0") ||
    output.includes("Number(priceMap[key]) === 0")) {
  fail(errors, "OutputBuilder must render missing/no-market prices as blank cells, not 0");
}

const bitpandaSync = read("src/35_BITPANDA_SYNC.gs");
if (!bitpandaSync.includes("ACTION_REBALANCING_REFRESH_FLAG_PROP") ||
    !bitpandaSync.includes("CRYPTO_CEX_REFRESH_FLAG_PROP")) {
  fail(errors, "Bitpanda manual refresh must use separate flags for Action Rebalancing Z1 and Portefeuille Crypto AC2");
}
if (!bitpandaSync.includes("UPDATE_BITPANDA_STOCKS_FIAT") ||
    !bitpandaSync.includes("UPDATE_BITPANDA_CRYPTO_FIAT")) {
  fail(errors, "Bitpanda sync must expose targeted Stocks/Fiat and Crypto/Fiat refresh functions");
}
if (!bitpandaSync.includes('"Action Rebalancing": {') ||
    !bitpandaSync.includes('"Z1": BITPANDA_SYNC_CONFIG.ACTION_REBALANCING_REFRESH_FLAG_PROP') ||
    !bitpandaSync.includes('"Portefeuille Crypto": {') ||
    !bitpandaSync.includes('"AC2": BITPANDA_SYNC_CONFIG.CRYPTO_CEX_REFRESH_FLAG_PROP')) {
  fail(errors, "Action Rebalancing Z1 and Portefeuille Crypto AC2 must be mapped to their targeted refresh flags");
}
if (!bitpandaSync.includes("UPDATE_BINANCE_SPOT")) {
  fail(errors, "Portefeuille Crypto AC2 refresh must also trigger Binance Crypto refresh");
}

const evmEngine = read("src/11_EVM_ENGINE.gs");
if (!evmEngine.includes("Explicit no-market zero prices are display values, not completion signals") ||
    !evmEngine.includes("state._scanStats.missingPrices = missingPriceCount")) {
  fail(errors, "EVM missing price accounting must keep visible no-market zero prices in partial cycle");
}
if (!evmEngine.includes("gpcPriceMap") || !evmEngine.includes("cache.priceMap[gpKey] = Number(gpEur)") ||
    !evmEngine.includes("background pricing worker") ||
    !evmEngine.includes("BaseEngine.getWorkerCachedPriceEur(config, gpKey, gpFxRate")) {
  fail(errors, "EVM cached Ledger reads must merge GlobalPriceCache prices found by the pricing worker");
}

const pricingWorkerForRegistry = read("src/28_PRICING_WORKER.gs");
if (!chainFactory.includes("ChainFactory.registerChain") ||
    !chainFactory.includes("ChainFactory.getRegistry") ||
    !pricingWorkerForRegistry.includes("ChainFactory.getRegistry")) {
  fail(errors, "Pricing worker must resolve chain configs through ChainFactory registry");
}
if (!pricingWorkerForRegistry.includes("attr.token_price_usd")) {
  fail(errors, "Pricing worker GT pools fallback must accept token_price_usd from /pools responses");
}
if (!pricingWorkerForRegistry.includes("bestReserve")) {
  fail(errors, "Pricing worker GT pools fallback must choose the deepest priced pool");
}
const registerStart = chainFactory.indexOf("ChainFactory.registerChain = function");
const registerEnd = chainFactory.indexOf("ChainFactory.getRegistry = function");
const registerBody = registerStart >= 0 && registerEnd > registerStart ? chainFactory.slice(registerStart, registerEnd) : "";
if (registerBody.includes(".getConfig(")) {
  fail(errors, "ChainFactory.registerChain must stay lazy and not build every chain config at load time");
}

const rpc = read("src/05_RPC.gs");
if (!rpc.includes("batchCallChunked: function")) {
  fail(errors, "RpcClient must expose batchCallChunked() for shared JSON-RPC batching");
}

const httpCore = read("src/03_HTTP.gs");
if (!httpCore.includes("_lastJsonStatus") || !httpCore.includes("_setCooldown(host")) {
  fail(errors, "HTTP.getJson must expose last JSON HTTP status and apply cooldown on 429");
}

const rotation = read("src/09_SIMPLE_ROTATION.gs");
if (!rotation.includes("RpcClient.batchCallChunked")) {
  fail(errors, "Simple rotation must use RpcClient.batchCallChunked() instead of local chunked HTTP loops");
}
if (!rotation.includes("SELECTOR_SYMBOL") || !rotation.includes("SELECTOR_NAME")) {
  fail(errors, "Simple rotation must batch ERC20 symbol/name metadata with balance scans");
}
if (!rotation.includes("AbiDecode.decodeStringOrBytes32")) {
  fail(errors, "Simple rotation must decode batched ERC20 symbol/name responses");
}
if (!rotation.includes("metaSymbolUpdated") || !rotation.includes("metaNameUpdated")) {
  fail(errors, "Simple rotation must expose batched metadata counters for diagnostics");
}

const pricingWorker = read("src/28_PRICING_WORKER.gs");
if (!pricingWorker.includes("_pricingWorkerMergeSheetContracts_")) {
  fail(errors, "Pricing worker must discover active contracts directly from Ledger sheets");
}
if (!pricingWorker.includes("SpreadsheetApp.getActiveSpreadsheet")) {
  fail(errors, "Pricing worker sheet discovery must use SpreadsheetApp, not UrlFetch");
}
if (pricingWorker.includes("markNoMarket") || pricingWorker.includes("stats.noMarketMarked")) {
  fail(errors, "Pricing worker must not write no-market price sentinels");
}
if (!pricingWorker.includes("UNRESOLVED_RETRY_MS") || !pricingWorker.includes("_pricingWorkerIsFreshUnresolved_")) {
  fail(errors, "Pricing worker must throttle unresolved retries without writing no-market prices");
}
if (!pricingWorker.includes("_pricingWorkerMarkUnresolved_") || !pricingWorker.includes("!gtLimited")) {
  fail(errors, "Pricing worker must only throttle unresolved tokens after a completed non-rate-limited cascade");
}
if (!pricingWorker.includes("_pricingWorkerGtBlockedThisRun_") || !pricingWorker.includes("_pricingWorkerSetGtBlocked_")) {
  fail(errors, "Pricing worker must stop further GT attempts after the first GT rate-limit in a run");
}
if (!pricingWorker.includes("_pricingWorkerGtSimpleBatch_") || !pricingWorker.includes("/token_price/")) {
  fail(errors, "Pricing worker must use direct GeckoTerminal simple batch before expensive deep fallbacks");
}
if (!pricingWorker.includes("_pricingWorkerGtPoolsFallback_") || !pricingWorker.includes("/pools?page=1")) {
  fail(errors, "Pricing worker must use GeckoTerminal pools fallback for tokens whose simple token_price is null");
}
if (!prices.includes("cmcDexTokenPrices") || !prices.includes("dex.coinmarketcap.com/token/")) {
  fail(errors, "PriceSources must expose CMC DEX HTML fallback for DEX tokens missing from DexScreener/GT/CG");
}
if (!prices.includes("dapi.coinmarketcap.com/dex/v1/token") || !prices.includes("json.data") || !prices.includes("data.p")) {
  fail(errors, "CMC DEX fallback must use the lightweight token JSON endpoint before HTML");
}
if (!prices.includes("function DIAG_CMC_DEX_TOKEN_BASE(contract)") || !prices.includes("function DIAG_CMC_DEX_BASE_MISSING()") || !prices.includes("function DIAG_CMC_DEX_BASE_MISSING_SOURCE()") || !prices.includes("price_p")) {
  fail(errors, "CMC DEX JSON fallback must have a GAS diagnostic entry point");
}
if (!prices.includes('"addr":"') || !prices.includes("[\\\\s\\\\S]{0,5000}") || !prices.includes("escRx(c)")) {
  fail(errors, "CMC DEX parser must search the embedded token JSON block, not only the first contract occurrence");
}
if (!prices.includes("out._partial = true") || !prices.includes("out._attemptedContracts = attempted")) {
  fail(errors, "CMC DEX fallback must report partial runs and attempted contracts so retry rotation can advance");
}
if (!pricingWorker.includes("_pxTryCmcDex") || !pricingWorker.includes("cmc-dex")) {
  fail(errors, "Pricing worker must include CMC DEX fallback after Dex/GT failures");
}
if (!pricingWorker.includes("attemptedCmcMisses") || !pricingWorker.includes('sourceCounts["cmc-dex-partial"]')) {
  fail(errors, "Pricing worker must only cooldown CMC DEX misses that were actually attempted during partial runs");
}
if (!pricingWorker.includes("MAX_PRIORITY_CHAINS_PER_RUN") || !pricingWorker.includes("chainIds = chainIds.slice(0, maxPriorityChains)")) {
  fail(errors, "Pricing worker must process priority Ledger chains incrementally instead of scanning every chain per run");
}
if (!pricingWorker.includes("function RUN_PRICING_WORKER_FORCE()") || !pricingWorker.includes("_runPricingWorker(true)")) {
  fail(errors, "Pricing worker must expose a force-run admin wrapper for interval-independent recovery diagnostics");
}
if (!pricingWorker.includes("QuotaCircuitBreaker.testOnce")) {
  fail(errors, "Pricing worker must probe stale quota breaker state so automatic recovery can resume after quota reset");
}
if (!pricingWorker.includes('prev.skipped !== "quota_or_degraded"')) {
  fail(errors, "Pricing worker quota/degraded skips must not enforce the normal pricing interval after recovery");
}
if (!cacheWallet.includes("PACKED_LOCK_MISS") || !cacheWallet.includes("if (lock && !gotLock)")) {
  fail(errors, "Wallet packed cache writes must fail closed when ScriptLock is unavailable");
}
if (!cacheWallet.includes("usedL1") || !cacheWallet.includes("readFromPacked(packedProps)") ||
    !cacheWallet.includes("stale GLOBAL_WALLET blob")) {
  fail(errors, "Wallet packed cache reads must fall back to ScriptProperties when CacheService L1 misses an entry");
}
if (!cacheWallet.includes("_mergePackedWalletCache_") || !cacheWallet.includes("_packedEntryAssetCount_") ||
    !cacheWallet.includes("A stale writer can no longer replace GLOBAL_WALLET")) {
  fail(errors, "Wallet packed cache saves must merge with ScriptProperties to prevent stale snapshot loss");
}
if (!pricingWorker.includes("_pricingWorkerMergeSheetContracts_(byChain, force)") || !pricingWorker.includes("_pricingWorkerActiveContracts_(force)")) {
  fail(errors, "Pricing worker forced runs must retry sheet/cache unresolved rows");
}
if (!pricingWorker.includes("__priority") || !pricingWorker.includes("_pricingWorkerPushPriority_")) {
  fail(errors, "Pricing worker must prioritize chains with visible unpriced Ledger rows before broad background work");
}
if (!pricingWorker.includes('priceState !== "positive" && !force && _pricingWorkerIsFreshUnresolved_')) {
  fail(errors, "Pricing worker must respect unresolved cooldown for visible blank/zero Ledger price gaps");
}

const refresh = read("src/16_REFRESH.gs");
const activity = read("src/27_ACTIVITY_REFRESH.gs");
const autoHeal = readIfExists("src/16B_AUTO_HEAL.gs");
if (!autoHeal) {
  fail(errors, "src/16B_AUTO_HEAL.gs must exist for trigger-based self-healing");
} else if (!autoHeal.includes("function WCORE_AUTO_HEAL")) {
  fail(errors, "WCORE_AUTO_HEAL must exist as the central automatic self-heal entry point");
}
if (autoHeal && (!autoHeal.includes("ACTIVITY_WATCHDOG") || !autoHeal.includes("WATCHDOG_FROM_RECAP") ||
    !autoHeal.includes("QUOTA_RECOVERY_SWEEP") || !autoHeal.includes("LEDGER_ON_CHANGE") ||
    !autoHeal.includes("_runPricingWorker"))) {
  fail(errors, "WCORE_AUTO_HEAL must ensure activity, recap, quota recovery, ledger, and pricing-worker triggers");
}
if (autoHeal && (!autoHeal.includes("PHASE_C_ENABLED") || !autoHeal.includes("PRICING_WORKER_ENABLED"))) {
  fail(errors, "WCORE_AUTO_HEAL must enable the pricing worker automatically");
}
if (autoHeal && (!autoHeal.includes("PRUNE_ACTIVITY_NONCE_MAP_STALE") || !autoHeal.includes("DISCOVER_AND_REGISTER_WALLETS"))) {
  fail(errors, "WCORE_AUTO_HEAL must prune stale activity state and bootstrap nonce tracking automatically");
}
if (!refresh.includes("WCORE_AUTO_HEAL(\"WATCHDOG_FROM_RECAP\"")) {
  fail(errors, "WATCHDOG_FROM_RECAP must invoke WCORE_AUTO_HEAL automatically");
}
if (!refresh.includes("WCORE_AUTO_HEAL(\"QUOTA_RECOVERY_SWEEP\"")) {
  fail(errors, "QUOTA_RECOVERY_SWEEP must invoke WCORE_AUTO_HEAL automatically");
}
if (!/function\s+MASTER_ON_EDIT\s*\(/.test(refresh)) {
  fail(errors, "MASTER_ON_EDIT installable onEdit wrapper must exist for Ledger A1 refresh");
}
if (!autoHeal || !autoHeal.includes("MASTER_ON_EDIT")) {
  fail(errors, "WCORE_AUTO_HEAL must ensure the MASTER_ON_EDIT trigger");
}
if (!activity.includes("WCORE_AUTO_HEAL(\"ACTIVITY_WATCHDOG\"")) {
  fail(errors, "ACTIVITY_WATCHDOG must invoke WCORE_AUTO_HEAL automatically");
}
if (!activity.includes("function _activityCanFetch_")) {
  fail(errors, "Activity watchdog must have a local no-fetch guard");
}
for (const marker of [
  "activity-evm-nonce-batch",
  "activity-svm-signature-batch",
  "activity-cosmos-sequence-batch",
  "activity-evm-native-balance",
  "activity-svm-native-balance",
  "activity-cosmos-native-balance",
]) {
  if (!activity.includes(marker)) fail(errors, `Activity watchdog missing quota guard ${marker}`);
}

const dynamicRpc = read("src/33_DYNAMIC_RPC.gs");
if (!dynamicRpc.includes("function _dynamicRpcCanFetch_")) {
  fail(errors, "Dynamic RPC admin flow must have a local no-fetch guard");
}
for (const marker of ["dynamic-rpc-chainlist", "dynamic-rpc-cosmos-registry", "dynamic-rpc-latency"]) {
  if (!dynamicRpc.includes(marker)) fail(errors, `Dynamic RPC missing quota guard ${marker}`);
}
if (!dynamicRpc.includes("BudgetHTTP.allow(\"admin\"")) {
  fail(errors, "Dynamic RPC must require admin HTTP budget before maintenance fetches");
}

const manifest = JSON.parse(read("src/appsscript.json"));
if (!manifest.executionApi || manifest.executionApi.access !== "ANYONE") {
  fail(errors, "Apps Script manifest must expose executionApi.access=ANYONE for clasp run");
}
const scopes = manifest.oauthScopes || [];
for (const scope of [
  "https://www.googleapis.com/auth/script.scriptapp",
  "https://www.googleapis.com/auth/script.external_request",
  "https://www.googleapis.com/auth/script.storage",
  "https://www.googleapis.com/auth/spreadsheets",
]) {
  if (!scopes.includes(scope)) {
    fail(errors, `Apps Script manifest missing OAuth scope ${scope}`);
  }
}

const quota = read("src/03E_QUOTA_CIRCUIT_BREAKER.gs");
if (!quota.includes("var WcoreHttpMode")) {
  fail(errors, "WCORE_HTTP_MODE controller must be defined");
}
if (!quota.includes("SET_WCORE_HTTP_MODE")) {
  fail(errors, "WCORE_HTTP_MODE must be user-configurable from Apps Script/Sheet");
}
if (!quota.includes("getEffectiveMode")) {
  fail(errors, "WCORE_HTTP_MODE must expose an automatic effective mode");
}
if (!quota.includes("_autoMode")) {
  fail(errors, "WCORE_HTTP_MODE must compute mode automatically from quota state");
}
if (!quota.includes("manualMode")) {
  fail(errors, "WCORE_HTTP_MODE status must report manual override separately from effective mode");
}
for (const mode of ['"CACHE_ONLY"', '"NORMAL"', '"RECOVERY"', '"ADMIN"']) {
  if (!quota.includes(mode)) fail(errors, `WCORE_HTTP_MODE missing ${mode}`);
}
if (!quota.includes("allow: function(categoryOrReason")) {
  fail(errors, "BudgetHTTP must expose allow(categoryOrReason)");
}
if (!quota.includes("categoryForReason")) {
  fail(errors, "BudgetHTTP must classify fetch reasons into categories");
}
if (!quota.includes("adminMinRemaining")) {
  fail(errors, "BudgetHTTP admin maintenance must require a high remaining quota");
}

const initSafe = read("src/01_INIT.gs");
if (!initSafe.includes("WcoreHttpMode.getMode")) {
  fail(errors, "WCORE_IS_SAFE must report current WCORE_HTTP_MODE");
}
if (!initSafe.includes("WcoreHttpMode.getEffectiveMode")) {
  fail(errors, "WCORE_IS_SAFE must use automatic effective WCORE_HTTP_MODE");
}

if (!refresh.includes("WD_MAX_PULSES_PER_RUN")) {
  fail(errors, "WATCHDOG_FROM_RECAP must cap B1 pulses per run");
}
if (!refresh.includes("_wd_actionPriority_")) {
  fail(errors, "WATCHDOG_FROM_RECAP must prioritize refresh actions");
}

if (!activity.includes("_activityPriorityScore_")) {
  fail(errors, "ACTIVITY_WATCHDOG must score tracked wallets before selecting a batch");
}
if (!activity.includes("tracked.sort(function(a, b)")) {
  fail(errors, "ACTIVITY_WATCHDOG must sort tracked wallets by priority score");
}

if (errors.length) {
  console.error("Static validation failed:");
  for (const err of errors) console.error(`- ${err}`);
  process.exit(1);
}

console.log(`Static validation OK (${globals.size} global functions checked).`);
