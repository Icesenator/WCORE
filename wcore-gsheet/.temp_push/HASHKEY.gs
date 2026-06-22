/**
 * HASHKEY.gs - HashKey (v4.12.4)
 * ChainFactory pattern with explicit function declarations
 * 
 * v4.12.4 - Updated RPC endpoints (mainnet launched Dec 2024)
 */

var _HASHKEY = ChainFactory.createEvmChain("HASHKEY", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: [
 "https://mainnet.hsk.xyz",
 "https://hashkey.drpc.org",
 "https://rpc.hashkey.hsk.xyz",
 "https://hashkeychain-mainnet.alt.technology"
 ] },
 CHAIN: {
 NAME: "HashKey",
 CHAIN_ID: 177,
 NATIVE_SYMBOL: "HSK",
 NATIVE_NAME: "HashKey Token",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:hashkey-ecopoints",
 NATIVE_GECKO_ID: "hashkey-ecopoints",
 DEX_SLUG: "hashkey",
 GT_NETWORK: "hashkey"
 },
 LLAMA_ID_MAP: { "HSK":"coingecko:hashkey-ecopoints", "USDC":"coingecko:usd-coin", "USDT":"coingecko:tether", "WHSK":"coingecko:hashkey-ecopoints" }
});

// Main functions
function GET_WALLET_ASSETS_HASHKEY(a,r,t,f,g){return _HASHKEY.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_HASHKEY(a){return _HASHKEY.getCachedWalletAssets(a);}
function HASHKEY_REFRESH_STATUS(a,r,t,f,g){return _HASHKEY.getRefreshStatus(a,r,t,f,g);}
function HASHKEY_STATS(a,t){return _HASHKEY.getStats(a,t);}

// Diagnostic functions
function DIAG_HASHKEY_TOKEN(w,t,r){return _HASHKEY.diag.tokenBalance(w,t,r);}
function DIAG_HASHKEY_COMPARE_RPCS(w,t){return _HASHKEY.diag.compareRpcs(w,t);}
function DIAG_HASHKEY_CHECK_ERC20(t){return _HASHKEY.diag.checkErc20(t);}
function DIAG_HASHKEY_RPC_HEALTH(){return _HASHKEY.diag.rpcHealth();}
function DIAG_HASHKEY_NATIVE_BALANCE(w){return _HASHKEY.diag.nativeBalance(w);}
function DIAG_HASHKEY_CACHE(w){return _HASHKEY.diag.cacheInspect(w);}
function DIAG_HASHKEY_CACHE_TOKEN(w,t){return _HASHKEY.diag.cacheFindToken(w,t);}
function DIAG_HASHKEY_CACHE_ASSETS(w){return _HASHKEY.diag.cacheListAssets(w);}
function DIAG_HASHKEY_TOKEN_PRICE(t){return _HASHKEY.diag.tokenPrice(t);}
function DIAG_HASHKEY_NATIVE_PRICE(){return _HASHKEY.diag.nativePrice();}
function DIAG_HASHKEY_WALLET(w){return _HASHKEY.diag.walletFull(w);}
function DIAG_HASHKEY_CACHE_STATS(){return _HASHKEY.diag.cacheStats();}
function DIAG_HASHKEY_CLEAR_CACHE(w,c){return _HASHKEY.diag.clearCache(w,c);}