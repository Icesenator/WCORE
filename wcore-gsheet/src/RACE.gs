/**
 * RACE.gs - RACE (v4.15.50)
 * ChainFactory pattern with explicit function declarations.
 * v4.15.50 - Removed chain-specific Blockscout hack; now uses the generic
 *            Blockscout RPC fallback derived from ACTIVITY_EXPLORER.BASE_URL.
 */

var _RACE = ChainFactory.createEvmChain("RACE", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://racemainnet.io", "https://6805.rpc.thirdweb.com"] },
 ACTIVITY_EXPLORER: { TYPE: "blockscout", BASE_URL: "https://racescan.io", TX_PATH: "/api/v2/addresses/{address}/transactions" },
 CHAIN: {
 NAME: "RACE",
 CHAIN_ID: 6805,
 NATIVE_SYMBOL: "ETH",
 NATIVE_NAME: "Ether",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:ethereum",
 NATIVE_GECKO_ID: "ethereum",
 DEX_SLUG: "race",
 GT_NETWORK: "race"
 },
 LLAMA_ID_MAP: { "ETH":"coingecko:ethereum" }
});

// Main functions
function GET_WALLET_ASSETS_RACE(a,r,t,f,g){return _RACE.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_RACE(a){return _RACE.getCachedWalletAssets(a);}
function RACE_REFRESH_STATUS(a,r,t,f,g){return _RACE.getRefreshStatus(a,r,t,f,g);}
function RACE_STATS(a,t){return _RACE.getStats(a,t);}

// Diagnostic functions
function DIAG_RACE_TOKEN(w,t,r){return _RACE.diag.tokenBalance(w,t,r);}
function DIAG_RACE_COMPARE_RPCS(w,t){return _RACE.diag.compareRpcs(w,t);}
function DIAG_RACE_CHECK_ERC20(t){return _RACE.diag.checkErc20(t);}
function DIAG_RACE_RPC_HEALTH(){return _RACE.diag.rpcHealth();}
function DIAG_RACE_NATIVE_BALANCE(w){return _RACE.diag.nativeBalance(w);}
function DIAG_RACE_CACHE(w){return _RACE.diag.cacheInspect(w);}
function DIAG_RACE_CACHE_TOKEN(w,t){return _RACE.diag.cacheFindToken(w,t);}
function DIAG_RACE_CACHE_ASSETS(w){return _RACE.diag.cacheListAssets(w);}
function DIAG_RACE_TOKEN_PRICE(t){return _RACE.diag.tokenPrice(t);}
function DIAG_RACE_NATIVE_PRICE(){return _RACE.diag.nativePrice();}
function DIAG_RACE_WALLET(w){return _RACE.diag.walletFull(w);}
function DIAG_RACE_CACHE_STATS(){return _RACE.diag.cacheStats();}
function DIAG_RACE_CLEAR_CACHE(w,c){return _RACE.diag.clearCache(w,c);}
