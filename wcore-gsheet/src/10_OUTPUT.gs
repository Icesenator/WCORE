/************************************************************
 * core/OUTPUT_CORE.gs - Formatage de sortie (multi-chain)
 * 
 * Ce fichier contient la logique de formatage de sortie.
 * 
 * v4.15.59 - Protected output snapshots for quota-blocked cache misses
 * v4.12.33 - render missing/no-market prices as blank, not zero
 *
 * v4.12.32 - render explicit no-market price as 0 instead of blank
 *
 * v4.12.31 - support chain sans native (NATIVE_SYMBOL="") : skip native row + INFO_NATIVE
 *
 * v4.12.30 - QUOTA: add INFO_HTTP diagnostic row when provided
 *
 * v4.12.29 - LABEL CLEANUP
 * - Changed dueScan1h -> dueScan (generic, not tied to interval)
 * - Changed duePrice6h -> duePrice (generic, not tied to interval)
 * 
 * v4.3.0 - Support autoForced, corrections encodage UTF-8
 * v4.5.x - Ajout buildOutput() pour CosmosEngine/SVM light outputs
 * v4.11.2 - Nettoyage UTF-8 complet
 ************************************************************/
var OUTPUT_VERSION = "4.15.100";

var OutputSnapshotCache = {
 key: function(config, walletKey) {
  var chain = (config && config.CHAIN && (config.CHAIN.NAME || config.CHAIN.DISPLAY_NAME)) || "UNKNOWN";
  var raw = String(chain).replace(/[^A-Za-z0-9_]/g, "_").toUpperCase() + "_" + String(walletKey || "").toLowerCase();
  var h = 0x811c9dc5;
  for (var i = 0; i < raw.length; i++) { h ^= raw.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; }
  return "OUTSNAP_" + h.toString(36);
 },

 isUsableOutput: function(out) {
  if (!out || !Array.isArray(out) || out.length < 2) return false;
  var s = "";
  try { s = JSON.stringify(out); } catch (e) { return false; }
  if (s.indexOf("NO_CACHE_WAITING_REFRESH") >= 0 || s.indexOf("[NO_CACHE]") >= 0) return false;
  return s.indexOf("INFO_TOTAL") >= 0 || out.length > 2;
 },

  save: function(config, walletKey, out) {
   try {
    if (!this.isUsableOutput(out)) return false;
    var payload = { ts: Date.now(), out: out };
    var s = JSON.stringify(payload);
    if (s.length > 30000) return false;
    var props = PropertiesService.getScriptProperties();
    this.pruneHttpCounters_(props);
    this.pruneSnapshots_(props);
    props.setProperty(this.key(config, walletKey), s);
    return true;
   } catch (e) { return false; }
  },

 load: function(config, walletKey, reason) {
  try {
   var raw = PropertiesService.getScriptProperties().getProperty(this.key(config, walletKey));
   if (!raw) return null;
   var payload = JSON.parse(raw);
   var out = payload && payload.out;
   if (!this.isUsableOutput(out)) return null;
   out = JSON.parse(JSON.stringify(out));
   var chainName = (out[1] && out[1][0]) || ((config && config.CHAIN && config.CHAIN.NAME) || "Ledger");
   out.push(OutputBuilder.infoRow(chainName, "INFO_SNAPSHOT", "served protected output snapshot; reason=" + (reason || "cache_missing_blocked")));
   out.push(OutputBuilder.metaRow("snapshot_ts", payload.ts ? Format.datetime(payload.ts) : ""));
   return out;
  } catch (e) { return null; }
 },

  pruneHttpCounters_: function(props) {
   try {
    props = props || PropertiesService.getScriptProperties();
    var all = props.getProperties();
    var keys = Object.keys(all || {});
    var keep = {};
    var d = new Date(Date.now() - 9 * 3600000);
    var today = d.getUTCFullYear() + "-" + (d.getUTCMonth() + 1) + "-" + d.getUTCDate();
    keep[today] = true;
    var removed = 0;
    for (var i = 0; i < keys.length && removed < 120; i++) {
     var k = keys[i];
     if (!/^WCORE_HTTP_(DAY|HOST|TRIGGER|T0|MILE)_/.test(k)) continue;
     if (k.indexOf(today) >= 0) continue;
     try { props.deleteProperty(k); removed++; } catch (eDel) {}
    }
   } catch (e) {}
  },

  // v4.15.62: hard cap on output snapshots. Until v4.15.61, OUTSNAP_*
  // accumulated without bound (one per chain×wallet) and could push
  // ScriptProperties over 500KB. Strategy:
  //  (a) drop snapshots older than MAX_AGE_MS (24h)
  //  (b) if still over MAX_ENTRIES, drop oldest until under the cap
  // Called from save() before every write.
  pruneSnapshots_: function(props) {
   try {
    props = props || PropertiesService.getScriptProperties();
    var all = props.getProperties();
    var MAX_ENTRIES = 15;
    var MAX_AGE_MS = 12 * 3600 * 1000;
    var now = Date.now();
    var snaps = [];
    for (var k in all) {
     if (k.indexOf("OUTSNAP_") !== 0) continue;
     var raw = all[k];
     var ts = 0;
     try { ts = JSON.parse(raw).ts || 0; } catch (eP) {}
     snaps.push({ k: k, ts: ts, size: k.length + String(raw || "").length });
    }
    if (!snaps.length) return 0;
    var removed = 0;
    // (a) age-based purge
    for (var i = 0; i < snaps.length; i++) {
     if (snaps[i].ts > 0 && (now - snaps[i].ts) > MAX_AGE_MS) {
      try { props.deleteProperty(snaps[i].k); removed++; } catch (eDel) {}
      snaps[i].k = null;
     }
    }
    // (b) count-based cap
    snaps = snaps.filter(function(s) { return s.k; });
    if (snaps.length > MAX_ENTRIES) {
     snaps.sort(function(a, b) { return a.ts - b.ts; });
     var drop = snaps.length - MAX_ENTRIES;
     for (var j = 0; j < drop; j++) {
      try { props.deleteProperty(snaps[j].k); removed++; } catch (eDel2) {}
     }
    }
    return removed;
   } catch (e) { return 0; }
  }
};

// ============================================================
// OUTPUT BUILDER - Construction des tables de sortie
// ============================================================

var OutputBuilder = {
 
 // En-tetes standard
 HEADERS: ["chain_name", "token_ticker", "token_name", "contract_address", "balance", "price_eur", "value_eur"],
 
 /**
 * Retourne la ligne d'en-tetes
 */
 headerRow: function() {
 return this.HEADERS.slice();
 },
 
 /**
 * Construit une ligne pour un asset
 */
 assetRow: function(chainName, asset, price) {
 var balance = Num.parseOr(asset.balance, 0);
 var priceVal = Num.isValidPositive(price) ? price : "";
 var value = (priceVal && balance !== 0) ? (balance * priceVal) : "";
 return [
 chainName,
 asset.symbol || "",
 asset.name || "",
 asset.contract || "",
 balance,
 priceVal,
 value
 ];
 },
 
 /**
 * Construit une ligne INFO
 */
 infoRow: function(chainName, infoKey, infoValue, lastCol) {
 return [
 chainName,
 infoKey,
 infoValue,
 "",
 "",
 "",
 lastCol !== undefined ? lastCol : ""
 ];
 },
 
 /**
 * Construit une ligne META
 */
 metaRow: function(metaKey, metaValue) {
 return ["META", metaKey, metaValue, "", "", "", ""];
 },

 // ============================================================
 // LIGHT OUTPUT (CosmosEngine / SvmEngine helper)
 // ============================================================

 /**
 * Builder "light" pour moteurs non-EVM (Cosmos aujourd'hui) ou usages simples.
 * Attendu par 15_COSMOS_ENGINE.gs: OutputBuilder.buildOutput(assets, config, timer)
 *
 * - Ajoute native en premier (si present)
 * - Ajoute INFO_FX / INFO_TOTAL + META last_update/exec_ms/script_version
 * - Prix: seulement natif si on peut (DefiLlama + FX). Les autres restent vides.
 */
 buildOutput: function(assets, config, timer) {
 var out = [this.headerRow()];
 assets = Array.isArray(assets) ? assets : [];

 var chainName =
 (config && config.CHAIN && (config.CHAIN.DISPLAY_NAME || config.CHAIN.NAME))
 ? ("Ledger - " + (config.CHAIN.DISPLAY_NAME ? String(config.CHAIN.DISPLAY_NAME).replace(/^Ledger\s*-\s*/i, "") : String(config.CHAIN.NAME)))
 : "Ledger - Cosmos";

 // FX USD->EUR (1 = no conversion si indispo)
 var fx = null;
 try { fx = FxRate.getUsdToEur(); } catch (eFx) { fx = null; }
 if (!Num.isValidPositive(fx)) fx = 1;

 // Determiner natif (symbol + coinId)
 var nativeSymbol = (config && config.CHAIN && config.CHAIN.NATIVE_SYMBOL) ? String(config.CHAIN.NATIVE_SYMBOL).toUpperCase() : null;
 var nativeName = (config && config.CHAIN && config.CHAIN.NATIVE_NAME) ? String(config.CHAIN.NATIVE_NAME) : (nativeSymbol || "Native");
 var nativePriceEur = "";

 try {
 if (nativeSymbol) {
 var coinId = PriceSources.getLlamaIdForSymbol(nativeSymbol, config);
 if (coinId) {
 var pUsd = PriceSources.getLlamaPrice(coinId, timer, config);
 if (Num.isValidPositive(pUsd)) nativePriceEur = pUsd * fx;
 }
 }
 } catch (e) {
 nativePriceEur = "";
 }

 // Normaliser assets en lignes standard
 // CosmosEngine donne: {symbol,name,balance,contractAddress,isNative,isStaked}
 var nativeRow = null;
 var otherRows = [];

 for (var i = 0; i < assets.length; i++) {
 var a = assets[i];
 if (!a) continue;

 var isNative = !!a.isNative;
 var isStaked = !!a.isStaked;

 var contract = "";
 if (isNative) contract = "native";
 else contract = String(a.contract || a.contractAddress || "");

 // Garder les staked meme si contrat "staked:..."
 var rowAsset = {
 symbol: a.symbol || (isNative ? (nativeSymbol || "") : ""),
 name: a.name || (isNative ? (nativeName || "") : (a.symbol || "")),
 contract: contract,
 balance: Num.parseOr(a.balance, 0)
 };

 // Filtre: afficher natif meme si 0, sinon seulement balances positives
 if (rowAsset.contract === "native") {
 nativeRow = this.assetRow(chainName, rowAsset, nativePriceEur);
 } else {
  if (Num.parseOr(rowAsset.balance, 0) === 0) continue;
 // Pas de pricing IBC/denoms pour l'instant
 otherRows.push(this.assetRow(chainName, rowAsset, ""));
 }
 }

 // Creer une ligne native si absente (comme EVM)
 if (!nativeRow) {
 var n = {
 symbol: nativeSymbol || "",
 name: nativeName || "",
 contract: "native",
 balance: 0
 };
 nativeRow = this.assetRow(chainName, n, nativePriceEur);
 }

 out.push(nativeRow);
 for (var j = 0; j < otherRows.length; j++) out.push(otherRows[j]);

 // Trier par value (native reste en premier)
 out = this._sortAssetRows(out);

 // Total
 var total = 0;
 for (var k = 1; k < out.length; k++) {
 var v = out[k][6];
  if (Num.isValid(v)) total += Num.parseOr(v, 0);
 }

 // INFO / META
 out.push(this.infoRow(chainName, "INFO_FX", fx ? ("USD->EUR=" + fx.toFixed(4)) : "USD->EUR=N/A"));
 out.push(this.infoRow(chainName, "INFO_TOTAL", "Total portefeuille (sum value_eur).", total));

 out.push(this.metaRow("last_update", Format.now()));
 out.push(this.metaRow("exec_ms", String(timer ? timer.elapsed() : 0)));
 out.push(this.metaRow("script_version", (config && config.VERSION) || "unknown"));

 return out;
 },
 
 /**
 * Recupere le prix d'un asset depuis les differentes sources
 */
 _getPrice: function(key, asset, priceMap) {
 var p1 = Num.parse(asset && asset.price_eur);
 if (Num.isValidPositive(p1)) return p1;
 var p2 = Num.parse(priceMap && priceMap[key]);
 if (Num.isValidPositive(p2)) return p2;

 // Fallback: some ecosystems (ex: Solana base58 mints) can be stored
 // with lowercased keys in caches (pricing APIs often normalize keys).
 if (priceMap && key && typeof key === 'string') {
 var kl = key.toLowerCase();
 if (kl !== key) {
 var p3 = Num.parse(priceMap[kl]);
 if (Num.isValidPositive(p3)) return p3;
 }
 }
 return "";
 },
 
 /**
 * Trie les lignes d'assets par value_eur decroissant
 * Native reste toujours en premier
 */
 _sortAssetRows: function(rows) {
 if (!rows || rows.length <= 2) return rows;
 
 var header = rows[0];
 var assetRows = rows.slice(1);
 
 // Separer native des autres
 var nativeRow = null;
 var otherRows = [];
 
 for (var i = 0; i < assetRows.length; i++) {
 var row = assetRows[i];
 if (row && row[3] === "native") {
 nativeRow = row;
 } else {
 otherRows.push(row);
 }
 }
 
 // Trier les autres par value_eur decroissant
 otherRows.sort(function(a, b) {
 var valA = Num.parseOr(a[6], 0);
 var valB = Num.parseOr(b[6], 0);
 return valB - valA;
 });
 
 // Reconstruire : header, native, puis les autres tries
 var result = [header];
 if (nativeRow) result.push(nativeRow);
 for (var j = 0; j < otherRows.length; j++) {
 result.push(otherRows[j]);
 }
 
 return result;
 },
 
 /**
 * Construit la sortie uniquement depuis le cache (sans INFO/META)
 */
 fromCacheOnly: function(chainName, cache, config) {
 var out = [this.headerRow()];
 var assets = (cache && cache.assets) ? cache.assets : [];
 var priceMap = (cache && cache.priceMap) ? cache.priceMap : {};
 
 AssetManager.normalizeMetadata(assets);
 
 // Separer native et ERC20
 var native = null, erc20 = [];
 for (var i = 0; i < assets.length; i++) {
 var a = assets[i];
 if (a && a.contract === "native" && !native) native = a;
 else if (a) erc20.push(a);
 }
 
 // Infos de la chain
 var nativeSymbol = (config && config.CHAIN && config.CHAIN.NATIVE_SYMBOL != null) ? config.CHAIN.NATIVE_SYMBOL : "ETH";
 var nativeName = (config && config.CHAIN && config.CHAIN.NATIVE_NAME != null) ? config.CHAIN.NATIVE_NAME : "Ether";
 var nativePriceKey = (config && config.KEYS && config.KEYS.NATIVE_PRICE) || "native";
 var hasNative = !!nativeSymbol; // false quand NATIVE_SYMBOL === ""

 // Ajouter le token natif (skip si chain sans native)
 if (hasNative) {
 if (!native) {
 native = { contract: "native", symbol: nativeSymbol, name: nativeName, balance: 0 };
 }
 native.symbol = native.symbol || nativeSymbol;
 native.name = native.name || nativeName;
 var nativePrice = this._getPrice(nativePriceKey, native, priceMap);
 out.push(this.assetRow(chainName, native, nativePrice));
 }
 
  // Ajouter les ERC20 avec balance non nulle (inclut les dettes negatives)
 for (var j = 0; j < erc20.length; j++) {
 var asset = erc20[j];
 if (!asset || asset.contract === "native") continue;
  if (Num.parseOr(asset.balance, 0) === 0) continue;
 var key = Addr.normalize(asset.contract);
 var price = this._getPrice(key, asset, priceMap);
 out.push(this.assetRow(chainName, asset, price));
 }
 
 // Trier par value_eur decroissant (native en premier)
 return this._sortAssetRows(out);
 },
 
 /**
 * Construit la sortie depuis le cache avec les INFO/META de fallback
 */
 fromCacheFallback: function(chainName, cache, timer, reason, config, overrideNativeBalance, overrideNativeInfo) {
 var out = this.fromCacheOnly(chainName, cache, config);
 var fxCached = (cache && Num.isValidPositive(cache.usd_to_eur_rate)) ? cache.usd_to_eur_rate : null;
 var version = (config && config.VERSION) || "unknown";
 
 // Calculer le total
 var total = 0;
 for (var i = 1; i < out.length; i++) {
 var val = out[i][6];
  if (Num.isValid(val)) total += Num.parseOr(val, 0);
 }
 
 // Override du solde natif si fourni
 if (overrideNativeBalance != null && out.length > 1) {
 out[1][4] = Num.parseOr(overrideNativeBalance, 0);
 var nPrice = out[1][5];
 out[1][6] = (Num.isValidPositive(nPrice) && out[1][4] > 0) ? (out[1][4] * nPrice) : "";
 }
 
 // Ajouter les lignes INFO
 out.push(this.infoRow(chainName, "INFO", reason || "Fallback cache."));
 // INFO_ROT aussi en fallback, pour garder la meme structure que la sortie normale
 out.push(this.infoRow(chainName, "INFO_ROT", "rot=FALLBACK; profile=CACHE; reason=" + (reason || "cache")));

 if (overrideNativeInfo) {
 out.push(this.infoRow(chainName, "INFO_NATIVE", String(overrideNativeInfo)));
 }
 out.push(this.infoRow(chainName, "INFO_FX", fxCached ? ("USD->EUR=" + fxCached.toFixed(4)) : "USD->EUR=N/A"));
 out.push(this.infoRow(chainName, "INFO_TOTAL", "Total portefeuille (sum value_eur).", total));
 
 // Ajouter les lignes META
 out.push(this.metaRow("last_update", Format.now()));
 out.push(this.metaRow("exec_ms", String(timer ? timer.elapsed() : 0)));
 out.push(this.metaRow("last_cache_update", WalletCache.getLastUpdateStr(cache)));
 out.push(this.metaRow("script_version", version));
 
 return out;
 },
 
 /**
 * Construit la sortie complete avec tous les details
 * @param {string} chainName - Nom de la chain
 * @param {Array} assets - Liste des assets
 * @param {Object} priceMap - Map des prix
 * @param {number} fxRate - Taux de change USD->EUR
 * @param {Object} budget - Budget d'execution
 * @param {string} nativeInfo - Info sur le solde natif
 * @param {Object} fullScanStats - Stats du full scan
 * @param {Object} timer - Timer d'execution
 * @param {number} rrCursor - Curseur de rotation
 * @param {number} allContractsCount - Nombre total de contrats
 * @param {number} pricesFetched - Nombre de prix recuperes
 * @param {Object} config - Configuration
 * @param {boolean} autoForced - Si auto-force a ete declenche
 * @param {Object} stateOptions - Options additionnelles {cacheVersionMismatch, staleCachePreserved}
 */
 full: function(chainName, assets, priceMap, fxRate, budget, nativeInfo, fullScanStats, timer, rrCursor, allContractsCount, pricesFetched, config, autoForced, stateOptions) {
 stateOptions = stateOptions || {};
 var out = [this.headerRow()];
 var total = 0;
 var version = (config && config.VERSION) || "unknown";
 var nativeSymbol = (config && config.CHAIN && config.CHAIN.NATIVE_SYMBOL != null) ? config.CHAIN.NATIVE_SYMBOL : "ETH";
 var nativeName = (config && config.CHAIN && config.CHAIN.NATIVE_NAME != null) ? config.CHAIN.NATIVE_NAME : "Ether";
 var nativePriceKey = (config && config.KEYS && config.KEYS.NATIVE_PRICE) || "native";
 var hasNative = !!nativeSymbol; // false quand NATIVE_SYMBOL === ""

 AssetManager.normalizeMetadata(assets);

 // Separer native et ERC20
 var native = null, erc20 = [];
 for (var i = 0; i < assets.length; i++) {
 var a = assets[i];
 if (a && a.contract === "native" && !native) native = a;
 else if (a) erc20.push(a);
 }

 // Ajouter le token natif (skip si chain sans native)
 if (hasNative) {
 if (!native) {
 native = { contract: "native", symbol: nativeSymbol, name: nativeName, balance: 0 };
 }
 native.symbol = native.symbol || nativeSymbol;
 native.name = native.name || nativeName;
 var nativePrice = this._getPrice(nativePriceKey, native, priceMap);
 var nativeRow = this.assetRow(chainName, native, nativePrice);
 out.push(nativeRow);
 if (Num.isValidPositive(nativeRow[6])) total += nativeRow[6];
 }
 
 // Ajouter les ERC20
 for (var j = 0; j < erc20.length; j++) {
 var asset = erc20[j];
 if (!asset || asset.contract === "native") continue;
  if (Num.parseOr(asset.balance, 0) === 0) continue;
 var key = Addr.normalize(asset.contract);
 var price = this._getPrice(key, asset, priceMap);
 var row = this.assetRow(chainName, asset, price);
 out.push(row);
  if (Num.isValid(row[6])) total += Num.parseOr(row[6], 0);
 }
 
 // Trier par value_eur decroissant (native en premier)
 out = this._sortAssetRows(out);
 
 // Recalculer le total apres tri
 total = 0;
 for (var k = 1; k < out.length; k++) {
 var val = out[k][6];
  if (Num.isValid(val)) total += Num.parseOr(val, 0);
 }
 
 // Statistiques de deduplication
 var dedupStats = RpcClient.getStats();
 
 // Construire rotInfo complet
 var rotInfo = this._buildRotInfo(chainName, budget, rrCursor, allContractsCount, pricesFetched, fullScanStats, dedupStats, autoForced, stateOptions);
 
 // Ajouter les lignes INFO
 out.push(this.infoRow(chainName, "INFO_ROT", rotInfo));
 if (hasNative) out.push(this.infoRow(chainName, "INFO_NATIVE", nativeInfo ? String(nativeInfo) : "N/A"));
 out.push(this.infoRow(chainName, "INFO_FX", fxRate ? ("USD->EUR=" + fxRate.toFixed(4)) : "USD->EUR=N/A"));

 // Dashboard-friendly diagnostics (optional)
 if (budget && budget.diagTiming) out.push(this.infoRow(chainName, "INFO_TIMING", String(budget.diagTiming)));
 if (budget && budget.diagRpc) out.push(this.infoRow(chainName, "INFO_RPC", String(budget.diagRpc)));
 if (budget && budget.diagHttp) out.push(this.infoRow(chainName, "INFO_HTTP", String(budget.diagHttp)));
 out.push(this.infoRow(chainName, "INFO_TOTAL", "Total portefeuille (sum value_eur).", total));
 
 // Ajouter les lignes META
 out.push(this.metaRow("last_update", Format.now()));
 out.push(this.metaRow("exec_ms", String(timer ? timer.elapsed() : 0)));
 out.push(this.metaRow("last_cache_update", Format.now()));
 out.push(this.metaRow("script_version", version));
 
 return out;
 },
 
 /**
 * Construit la chaine rotInfo complete
 */
 _buildRotInfo: function(chainName, budget, rrCursor, allContractsCount, pricesFetched, fullScanStats, dedupStats, autoForced, options) {
 options = options || {};
 var parts = [];
 
 parts.push("chain=" + chainName);
 parts.push("rot=" + (budget && budget.allowRotation ? "ON" : "OFF"));
 parts.push("profile=" + (budget ? (budget.profileName || "N/A") : "N/A"));
 if (budget && budget.risk != null) parts.push("risk=" + (Math.round(Number(budget.risk) * 100) / 100));
 parts.push("dynamic=" + (budget && budget.isDynamic ? "YES" : "NO"));
 parts.push("batch=" + (budget ? budget.maxTokensPerCall : "N/A"));
 parts.push("maxRef=" + (budget ? budget.maxRefreshPerRun : "N/A"));
 parts.push("rrCursor=" + (Num.isValid(rrCursor) ? rrCursor : 0));
 parts.push("contracts=" + (allContractsCount || 0));
 
 // Flags temporels - v4.12.29: renamed to generic labels (not tied to specific intervals)
 parts.push("dueScan=" + (budget && budget.dueFullScan ? "YES" : "NO"));
 parts.push("duePrice=" + (budget && budget.dueFullPrice ? "YES" : "NO"));
 parts.push("forceFull=" + (budget && budget.force ? "YES" : "NO"));
 
 // Auto-force (v4.3.0)
 if (autoForced) {
 parts.push("autoForced=YES");
 }
 
 // Version mismatch and stale cache (v4.11.1)
 if (options.cacheVersionMismatch) {
 parts.push("verMismatch=YES");
 }
 if (options.staleCachePreserved) {
 parts.push("stalePreserved=YES");
 }
 if (budget && budget.recoveryModeActive) {
 parts.push("recovery=YES");
 }
 
 // Pricing
 parts.push("pricingMode=" + (options.pricingMode || (budget && budget.pricingMode) || "legacy"));
 parts.push("pricing=" + (budget && budget.allowPrices ? "ON" : "OFF"));
 parts.push("parallelPrices=" + ((budget && (budget.allowDexBulk || budget.allowGT)) ? "YES" : "NO"));
 parts.push("pricesFetched=" + (pricesFetched | 0));
 
 // Dedup stats
 parts.push("dedup=" + (dedupStats ? (dedupStats.saved + "/" + dedupStats.total) : "0/0"));
 
 // Full scan stats
 if (fullScanStats && fullScanStats.did) {
 parts.push("fullScan=RAN(" + (fullScanStats.batches | 0) + "b," + (fullScanStats.scanned | 0) + "t)");
 }
 
 return parts.join("; ");
 },
 
 /**
 * Construit une sortie d'erreur
 */
 error: function(chainName, message, config) {
 var version = (config && config.VERSION) || "unknown";
 return [
 this.headerRow(),
 [chainName, "ERROR", message, "", "", "", ""],
 this.metaRow("script_version", version)
 ];
 },
 
 /**
 * Extrait les lignes INFO et META d'une table de sortie
 */
 extractInfoMetaRows: function(outTable, chainName) {
 var rows = [];
 if (!outTable || !outTable.length) return rows;
 
 for (var i = 0; i < outTable.length; i++) {
 var row = outTable[i];
 if (!row || row.length < 2) continue;
 
 var col0 = String(row[0] || "");
 var col1 = String(row[1] || "");
 
 // Inclure les lignes META
 if (col0 === "META") {
 rows.push(row.slice(0, 7));
 continue;
 }
 
 // Inclure les lignes INFO (sauf INFO_LAST_TX)
 if (col0 === String(chainName) && col1.indexOf("INFO") === 0) {
 rows.push(row.slice(0, 7));
 }
 }
 
 return rows;
 },

 /**
 * Deduplique les lignes INFO/META (garde la premiere occurrence).
 * - META: dedup par metaKey (col1)
 * - INFO: dedup par infoKey (col1)
 */
 dedupInfoMetaRows: function(rows) {
 if (!rows || !rows.length) return [];
 var out = [];
 var seenMeta = {};
 var seenInfo = {};

 for (var i = 0; i < rows.length; i++) {
 var r = rows[i];
 if (!r || r.length < 2) continue;
 var c0 = String(r[0] || '');
 var c1 = String(r[1] || '');

 if (c0 === 'META') {
 if (seenMeta[c1]) continue;
 seenMeta[c1] = true;
 out.push(r.slice(0, 7));
 continue;
 }

 if (c1.indexOf('INFO') === 0) {
 if (seenInfo[c1]) continue;
 seenInfo[c1] = true;
 out.push(r.slice(0, 7));
 continue;
 }

 // anything else: keep as-is
 out.push(r.slice(0, 7));
 }
 return out;
 }
};

// ============================================================
// DIAG: Output snapshot stats (v4.15.60)
// Compte les snapshots OUTSNAP_* sans consommer de quota HTTP.
// ============================================================
function DIAG_OUTPUT_SNAPSHOT_STATS() {
 var rows = [["Output Snapshot Cache", "", ""]];
 try {
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  var keys = Object.keys(all || {});
  var count = 0, bytes = 0, oldestTs = 0, newestTs = 0;
  var now = Date.now();
  for (var i = 0; i < keys.length; i++) {
   var k = keys[i];
   if (k.indexOf("OUTSNAP_") !== 0) continue;
   count++;
   var raw = all[k] || "";
   bytes += raw.length;
   try {
    var obj = JSON.parse(raw);
    var ts = (obj && obj.ts) || 0;
    if (ts) {
     if (!oldestTs || ts < oldestTs) oldestTs = ts;
     if (ts > newestTs) newestTs = ts;
    }
   } catch (e) {}
  }
  rows.push(["Snapshots", String(count), ""]);
  rows.push(["Total bytes", String(bytes), ""]);
  rows.push(["Oldest", oldestTs ? (Math.round((now - oldestTs) / 360000) / 10) + "h ago" : "n/a", ""]);
  rows.push(["Newest", newestTs ? (Math.round((now - newestTs) / 360000) / 10) + "h ago" : "n/a", ""]);
  rows.push(["Source", "NO_HTTP", ""]);
 } catch (e) {
  rows.push(["Error", String(e), ""]);
 }
 return rows;
}
