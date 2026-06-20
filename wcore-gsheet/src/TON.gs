/**
 * TON.gs - TON / The Open Network (v4.15.81)
 * Native TON + jettons via TonAPI, quota-safe standalone engine.
 */

var TON_VERSION = "4.15.81";

var TON_CONFIG = {
  VERSION: "TON_v4.15.81",
  CACHE_VERSION: 5,
  TIMEOUTS: { MAX_EXECUTION_MS: 30000, HTTP_MS: 4000 },
  CACHE: { WALLET_CACHE_TTL_SECONDS: 86400, WALLET_TTL_MS: 86400000, PRICE_TTL_MS: 43200000 },
  KEYS: { WALLET_CACHE_PREFIX: "TON_CACHE_WALLET_", NATIVE_PRICE: "native" },
  CHAIN: {
    VM: "TON",
    NAME: "TON",
    DISPLAY_NAME: "Space - TON",
    NATIVE_SYMBOL: "GRAM",
    NATIVE_NAME: "Gram",
    NATIVE_DECIMALS: 9,
    NATIVE_LLAMA_ID: "coingecko:the-open-network",
    NATIVE_GECKO_ID: "the-open-network"
  },
  API: {
    TONAPI_BASE: "https://tonapi.io/v2",
    TONCENTER_BALANCE: "https://toncenter.com/api/v2/getAddressBalance"
  },
  LLAMA_ID_MAP: {
    "GRAM": "coingecko:the-open-network",
    "TON": "coingecko:the-open-network",
    "USDT": "coingecko:tether",
    "USD₮": "coingecko:tether"
  }
};

CHAIN_CONFIG_SCHEMA.validate({
  key: "TON",
  vm: "TON",
  cacheVersion: 5,
  rpc: { endpoints: ["https://tonapi.io/v2", "https://toncenter.com/api/v2"] },
  chain: {
    name: "TON",
    nativeSymbol: TON_CONFIG.CHAIN.NATIVE_SYMBOL,
    nativeName: TON_CONFIG.CHAIN.NATIVE_NAME,
    nativeDecimals: TON_CONFIG.CHAIN.NATIVE_DECIMALS
  },
  timeouts: { httpMs: 4000, maxExecutionMs: 30000 },
  llamaIdMap: TON_CONFIG.LLAMA_ID_MAP
});

var _TON = ChainFactory.createTonChain("TON", {
  VERSION: "TON_v4.15.81",
  CACHE_VERSION: 5,
  RPC: {
    ENDPOINTS: [
      "https://tonapi.io/v2",
      "https://toncenter.com/api/v2"
    ],
    TIMEOUT_MS: 4000
  },
  TIMEOUTS: { MAX_EXECUTION_MS: 30000, HTTP_MS: 4000 },
  CACHE: { WALLET_CACHE_TTL_SECONDS: 86400, WALLET_TTL_MS: 86400000, PRICE_TTL_MS: 43200000 },
  KEYS: { WALLET_CACHE_PREFIX: "TON_CACHE_WALLET_", NATIVE_PRICE: "native" },
  CHAIN: {
    VM: "TON",
    NAME: "TON",
    DISPLAY_NAME: "Space - TON",
    NATIVE_SYMBOL: "GRAM",
    NATIVE_NAME: "Gram",
    NATIVE_DECIMALS: 9,
    NATIVE_LLAMA_ID: "coingecko:the-open-network",
    NATIVE_GECKO_ID: "the-open-network"
  },
  API: {
    TONAPI_BASE: "https://tonapi.io/v2",
    TONCENTER_BALANCE: "https://toncenter.com/api/v2/getAddressBalance"
  },
  LLAMA_ID_MAP: {
    "GRAM": "coingecko:the-open-network",
    "TON": "coingecko:the-open-network",
    "USDT": "coingecko:tether",
    "USD₮": "coingecko:tether"
  }
});

function _tonNow_() { return (typeof Format !== "undefined" && Format.now) ? Format.now() : Utilities.formatDate(new Date(), "Europe/Paris", "yyyy-MM-dd HH:mm:ss"); }
function _tonDisplayName_() { return TON_CONFIG.CHAIN.DISPLAY_NAME || "Space - TON"; }
function _tonTimer_() { return (typeof createTimer === "function") ? createTimer(TON_CONFIG.TIMEOUTS.MAX_EXECUTION_MS) : { elapsed: function(){ return 0; }, remaining: function(){ return 30000; } }; }

function _tonNormalizeAddress_(addr) {
  return String(addr || "").trim();
}

function _tonFetchJson_(url) {
  var resp = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    followRedirects: true,
    headers: { "Accept": "application/json" }
  });
  var code = resp.getResponseCode();
  var text = resp.getContentText() || "";
  if (code < 200 || code >= 300) throw new Error("TON_HTTP_" + code + ": " + text.substring(0, 160));
  return text ? JSON.parse(text) : {};
}

function _tonBalanceFromNano_(v, decimals) {
  decimals = (decimals == null) ? 9 : Number(decimals);
  var s = String(v == null ? "0" : v);
  var n = parseFloat(s);
  if (!isFinite(n)) return 0;
  return n / Math.pow(10, decimals);
}

function _tonGetFx_() {
  try {
    var fx = FxRate.getUsdToEur();
    return Num.isValidPositive(fx) ? fx : 1;
  } catch (e) { return 1; }
}

function _tonGetMappedPriceEur_(symbol, contract, timer) {
  var fx = _tonGetFx_();
  var llamaId = null;
  try {
    var sym = String(symbol || "").toUpperCase();
    if (TON_CONFIG.LLAMA_ID_MAP[sym]) llamaId = TON_CONFIG.LLAMA_ID_MAP[sym];
    if (!llamaId && contract && TON_CONFIG.LLAMA_ID_MAP[String(contract)]) llamaId = TON_CONFIG.LLAMA_ID_MAP[String(contract)];
    if (!llamaId) return "";
    var usd = PriceSources.llamaPriceUsd(llamaId, timer, TON_CONFIG);
    if (Num.isValidPositive(usd)) return usd * fx;
  } catch (e) {}
  return "";
}

function _tonLoadLive_(address, timer) {
  var a = _tonNormalizeAddress_(address);
  if (!a) throw new Error("Missing TON address");

  var account = null;
  var jettons = null;
  var accountUrl = TON_CONFIG.API.TONAPI_BASE + "/accounts/" + encodeURIComponent(a);
  var jettonsUrl = TON_CONFIG.API.TONAPI_BASE + "/accounts/" + encodeURIComponent(a) + "/jettons";

  try { account = _tonFetchJson_(accountUrl); } catch (eAcc) { account = null; }
  try { jettons = _tonFetchJson_(jettonsUrl); } catch (eJet) { jettons = { balances: [] }; }

  var nativeNano = account && account.balance;
  if (nativeNano == null) {
    var tc = _tonFetchJson_(TON_CONFIG.API.TONCENTER_BALANCE + "?address=" + encodeURIComponent(a));
    nativeNano = tc && tc.ok ? tc.result : 0;
  }

  var assets = [];
  assets.push({
    contract: "native",
    symbol: "GRAM",
    name: "Gram",
    decimals: 9,
    balance: _tonBalanceFromNano_(nativeNano, 9),
    isNative: true
  });

  var balances = (jettons && jettons.balances && Array.isArray(jettons.balances)) ? jettons.balances : [];
  for (var i = 0; i < balances.length; i++) {
    var b = balances[i] || {};
    var j = b.jetton || {};
    var dec = (j.decimals == null) ? 9 : Number(j.decimals);
    var bal = _tonBalanceFromNano_(b.balance, dec);
    if (!(bal > 0)) continue;
    assets.push({
      contract: String(j.address || (b.wallet_address && b.wallet_address.address) || ""),
      symbol: String(j.symbol || "JETTON"),
      name: String(j.name || j.symbol || "Jetton"),
      decimals: dec,
      balance: bal,
      isNative: false
    });
  }

  return assets;
}

function _tonBuildOutput_(cache, timer) {
  var out = [OutputBuilder.headerRow()];
  var chainName = _tonDisplayName_();
  var assets = (cache && cache.assets && Array.isArray(cache.assets)) ? cache.assets : [];
  var priceMap = (cache && cache.priceMap) || {};
  var total = 0;
  for (var i = 0; i < assets.length; i++) {
    var a = assets[i];
    if (!a) continue;
    var price = priceMap[a.contract] || priceMap[String(a.symbol || "").toUpperCase()] || "";
    var row = OutputBuilder.assetRow(chainName, a, price);
    if (Num.isValidPositive(row[6])) total += Number(row[6]);
    out.push(row);
  }
  out = OutputBuilder._sortAssetRows(out);
  out.push(OutputBuilder.infoRow(chainName, "INFO_ROT", "chain=Space - TON; rot=OFF; profile=STATIC; dynamic=NO; pricing=EXPLICIT_MAP_ONLY"));
  out.push(OutputBuilder.infoRow(chainName, "INFO_NATIVE", "tonapi"));
  out.push(OutputBuilder.infoRow(chainName, "INFO_FX", "USD->EUR=" + _tonGetFx_().toFixed(4)));
  out.push(OutputBuilder.infoRow(chainName, "INFO_TOTAL", "Total portefeuille (sum value_eur).", total));
  out.push(OutputBuilder.metaRow("last_update", _tonNow_()));
  out.push(OutputBuilder.metaRow("exec_ms", String(timer ? timer.elapsed() : 0)));
  out.push(OutputBuilder.metaRow("last_cache_update", WalletCache.getLastUpdateStr ? WalletCache.getLastUpdateStr(cache) : ""));
  out.push(OutputBuilder.metaRow("script_version", TON_CONFIG.VERSION));
  return out;
}

function _tonNoCacheOutput_(timer) {
  var chainName = _tonDisplayName_();
  var out = [OutputBuilder.headerRow()];
  out.push(OutputBuilder.assetRow(chainName, { contract: "native", symbol: "GRAM", name: "Gram", balance: 0 }, ""));
  out.push(OutputBuilder.infoRow(chainName, "INFO", "NO_CACHE_WAITING_REFRESH"));
  out.push(OutputBuilder.infoRow(chainName, "INFO_ROT", "rot=FALLBACK; profile=CACHE; reason=NO_CACHE_WAITING_REFRESH"));
  out.push(OutputBuilder.infoRow(chainName, "INFO_FX", "USD->EUR=N/A"));
  out.push(OutputBuilder.infoRow(chainName, "INFO_TOTAL", "Total portefeuille (sum value_eur).", 0));
  out.push(OutputBuilder.metaRow("last_update", _tonNow_()));
  out.push(OutputBuilder.metaRow("exec_ms", String(timer ? timer.elapsed() : 0)));
  out.push(OutputBuilder.metaRow("last_cache_update", ""));
  out.push(OutputBuilder.metaRow("script_version", TON_CONFIG.VERSION));
  return out;
}

function _tonRefresh_(address, forceFull) {
  var timer = _tonTimer_();
  var a = _tonNormalizeAddress_(address);
  if (!a) return OutputBuilder.error(_tonDisplayName_(), "Missing TON address");
  try {
    if (!(forceFull === true || forceFull === "TRUE" || forceFull === "true") && typeof BaseEngine !== "undefined" && BaseEngine.quotaPreCheck) {
      var blocked = BaseEngine.quotaPreCheck(a, TON_CONFIG);
      if (blocked) return blocked;
    }
  } catch (eQuota) {}

  try {
    var assets = _tonLoadLive_(a, timer);
    var priceMap = {};
    var priceTsMap = {};
    for (var i = 0; i < assets.length; i++) {
      var asset = assets[i];
      var p = _tonGetMappedPriceEur_(asset.symbol, asset.contract, timer);
      if (Num.isValidPositive(p)) {
        priceMap[asset.contract] = p;
        priceMap[String(asset.symbol || "").toUpperCase()] = p;
        priceTsMap[asset.contract] = Date.now();
      }
    }
    var cache = {
      v: TON_CONFIG.CACHE_VERSION,
      version: TON_CONFIG.CACHE_VERSION,
      assets: assets,
      priceMap: priceMap,
      priceTsMap: priceTsMap,
      balanceTsMap: { native: Date.now() },
      updatedAt: Date.now(),
      last_full_scan: _tonNow_(),
      last_full_price: _tonNow_(),
      last_full_scan_ms: Date.now(),
      last_full_price_ms: Date.now(),
      usd_to_eur: _tonGetFx_(),
      usd_to_eur_rate: _tonGetFx_(),
      scanStats: {
        totalContracts: Math.max(0, assets.length - 1),
        scannedCount: Math.max(0, assets.length - 1),
        fullCycleComplete: true,
        missingPrices: 0,
        missingMeta: 0,
        hasActivity: false,
        cursor: 0
      }
    };
    WalletCache.save(a, cache, TON_CONFIG);
    return _tonBuildOutput_(cache, timer);
  } catch (e) {
    var cached = null;
    try { cached = WalletCache.load(a, timer, TON_CONFIG); } catch (eLoad) {}
    if (cached) return _tonBuildOutput_(cached, timer);
    return OutputBuilder.error(_tonDisplayName_(), String((e && e.message) || e));
  }
}

function GET_WALLET_ASSETS_TON(a,r,t,f,g){ void r; void t; void g; return _tonRefresh_(a, f); }
function CACHED_WALLET_ASSETS_TON(a){ var timer=_tonTimer_(); var c=WalletCache.load(_tonNormalizeAddress_(a), timer, TON_CONFIG); return c ? _tonBuildOutput_(c, timer) : _tonNoCacheOutput_(timer); }
function TON_REFRESH_STATUS(a,r,t,f,g){ void r; void t; void g; var before=null; try{before=WalletCache.load(_tonNormalizeAddress_(a), null, TON_CONFIG);}catch(e){} _tonRefresh_(a, f); var after=null; try{after=WalletCache.load(_tonNormalizeAddress_(a), null, TON_CONFIG);}catch(e2){} var ts=WalletCache.getLastUpdateStr(after); if(ts) return ts; return before ? (WalletCache.getLastUpdateStr(before) || ("[BLOCKED:TIMEOUT] " + _tonNow_())) : ("[NO_CACHE] " + _tonNow_()); }
function TON_STATS(a,t){
  void t;
  var timer = _tonTimer_();
  var addr = _tonNormalizeAddress_(a);
  var c = WalletCache.load(addr, timer, TON_CONFIG);
  if (typeof BaseEngine !== "undefined" && BaseEngine.buildStatsBase) {
    var out = BaseEngine.buildStatsBase(addr, c, TON_CONFIG, "Space - TON", "TON", timer);
    out.push(["TON.api", "TonAPI + Toncenter fallback"]);
    out.push(["TON.jettons", c && c.assets ? Math.max(0, c.assets.length - 1) : 0]);
    out.push(["TON.pricing", "native + explicit jetton mappings only"]);
    return out;
  }
  return [["Metric","Value"],["Chain","Space - TON"],["Wallet",addr],["Cache",c?"FOUND":"MISSING"],["Assets",c&&c.assets?c.assets.length:0],["Version",TON_CONFIG.VERSION]];
}

function DIAG_TON_WALLET(a){ return GET_WALLET_ASSETS_TON(a,"","",true,"diag"); }
function DIAG_TON_CACHE(a){ var c=WalletCache.load(_tonNormalizeAddress_(a), null, TON_CONFIG); return [["Key","Value"],["Status",c?"FOUND":"MISSING"],["Assets",c&&c.assets?c.assets.length:0],["Updated",WalletCache.getLastUpdateStr(c)]]; }
function DIAG_TON_API(a){ var assets=_tonLoadLive_(_tonNormalizeAddress_(a), _tonTimer_()); return [["metric","value"],["assets",assets.length],["native",assets.length?assets[0].balance:0]]; }
