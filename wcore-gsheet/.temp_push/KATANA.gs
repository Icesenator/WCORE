/**
 * KATANA.gs - Katana (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _KATANA = ChainFactory.createEvmChain("KATANA", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://rpc.katana.network/", "https://katana.drpc.org/", "https://katana.gateway.tenderly.co", "https://747474.rpc.thirdweb.com/"] },
 CHAIN: {
 NAME: "Katana",
 CHAIN_ID: 747474,
 NATIVE_SYMBOL: "ETH",
 NATIVE_NAME: "Ethereum",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:ethereum",
 NATIVE_GECKO_ID: "ethereum",
 DEX_SLUG: "katana",
 GT_NETWORK: "katana"
 },
 LLAMA_ID_MAP: { "DAI":"coingecko:dai", "ETH":"coingecko:ethereum", "UBTC":"coingecko:wrapped-bitcoin", "USDC":"coingecko:usd-coin", "USDT":"coingecko:tether", "WBTC":"coingecko:wrapped-bitcoin", "WETH":"coingecko:weth" },
 LLAMA_CONTRACT_MAP: { "0xf1143f3a8d76f1ca740d29d5671d365f66c44ed1":"coingecko:wrapped-bitcoin" }
});

// Main functions
function GET_WALLET_ASSETS_KATANA(a,r,t,f,g){return _KATANA.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_KATANA(a){return _KATANA.getCachedWalletAssets(a);}
function KATANA_REFRESH_STATUS(a,r,t,f,g){return _KATANA.getRefreshStatus(a,r,t,f,g);}
function KATANA_STATS(a,t){return _KATANA.getStats(a,t);}

// Diagnostic functions
function DIAG_KATANA_TOKEN(w,t,r){return _KATANA.diag.tokenBalance(w,t,r);}
function DIAG_KATANA_COMPARE_RPCS(w,t){return _KATANA.diag.compareRpcs(w,t);}
function DIAG_KATANA_CHECK_ERC20(t){return _KATANA.diag.checkErc20(t);}
function DIAG_KATANA_RPC_HEALTH(){return _KATANA.diag.rpcHealth();}
function DIAG_KATANA_NATIVE_BALANCE(w){return _KATANA.diag.nativeBalance(w);}
function DIAG_KATANA_CACHE(w){return _KATANA.diag.cacheInspect(w);}
function DIAG_KATANA_CACHE_TOKEN(w,t){return _KATANA.diag.cacheFindToken(w,t);}
function DIAG_KATANA_CACHE_ASSETS(w){return _KATANA.diag.cacheListAssets(w);}
function DIAG_KATANA_TOKEN_PRICE(t){return _KATANA.diag.tokenPrice(t);}
function DIAG_KATANA_NATIVE_PRICE(){return _KATANA.diag.nativePrice();}
function DIAG_KATANA_WALLET(w){return _KATANA.diag.walletFull(w);}
function DIAG_KATANA_CACHE_STATS(){return _KATANA.diag.cacheStats();}
function DIAG_KATANA_CLEAR_CACHE(w,c){return _KATANA.diag.clearCache(w,c);}
