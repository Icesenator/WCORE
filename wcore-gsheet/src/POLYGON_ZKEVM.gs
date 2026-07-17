/**
 * POLYGON_ZKEVM.gs - Polygon zkEVM (v4.16.31 DISABLED)
 * Sequencer sunset 2026-07-01. Revalidation 2026-07-17: RPCs repondent encore
 * mais chaine HALTED — dernier bloc 33391890 date du 2026-07-03T15:55:44Z.
 * ChainFactory pattern with explicit function declarations
 */

var _POLYGON_ZKEVM = ChainFactory.createEvmChain("POLYGON_ZKEVM", {
 CACHE_VERSION: 63,
 FLAGS: { DISABLE_CHAIN: true },
 RPC: { ENDPOINTS: ["https://zkevm-rpc.com", "https://polygon-zkevm.drpc.org", "https://1rpc.io/polygon/zkevm"] },
 CHAIN: {
 NAME: "Polygon zkEVM",
 CHAIN_ID: 1101,
 NATIVE_SYMBOL: "ETH",
 NATIVE_NAME: "Ether",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:ethereum",
 NATIVE_GECKO_ID: "ethereum",
 DEX_SLUG: "polygon-zkevm",
 GT_NETWORK: "polygon-zkevm"
 },
 LLAMA_ID_MAP: { "DAI":"coingecko:dai", "ETH":"coingecko:ethereum", "MATIC":"coingecko:matic-network", "USDC":"coingecko:usd-coin", "USDT":"coingecko:tether", "WBTC":"coingecko:wrapped-bitcoin", "WETH":"coingecko:weth" }
});

// Main functions
function GET_WALLET_ASSETS_POLYGON_ZKEVM(a,r,t,f,g){return _POLYGON_ZKEVM.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_POLYGON_ZKEVM(a){return _POLYGON_ZKEVM.getCachedWalletAssets(a);}
function POLYGON_ZKEVM_REFRESH_STATUS(a,r,t,f,g){return _POLYGON_ZKEVM.getRefreshStatus(a,r,t,f,g);}
function POLYGON_ZKEVM_STATS(a,t){return _POLYGON_ZKEVM.getStats(a,t);}

// Diagnostic functions
function DIAG_POLYGON_ZKEVM_TOKEN(w,t,r){return _POLYGON_ZKEVM.diag.tokenBalance(w,t,r);}
function DIAG_POLYGON_ZKEVM_COMPARE_RPCS(w,t){return _POLYGON_ZKEVM.diag.compareRpcs(w,t);}
function DIAG_POLYGON_ZKEVM_CHECK_ERC20(t){return _POLYGON_ZKEVM.diag.checkErc20(t);}
function DIAG_POLYGON_ZKEVM_RPC_HEALTH(){return _POLYGON_ZKEVM.diag.rpcHealth();}
function DIAG_POLYGON_ZKEVM_NATIVE_BALANCE(w){return _POLYGON_ZKEVM.diag.nativeBalance(w);}
function DIAG_POLYGON_ZKEVM_CACHE(w){return _POLYGON_ZKEVM.diag.cacheInspect(w);}
function DIAG_POLYGON_ZKEVM_CACHE_TOKEN(w,t){return _POLYGON_ZKEVM.diag.cacheFindToken(w,t);}
function DIAG_POLYGON_ZKEVM_CACHE_ASSETS(w){return _POLYGON_ZKEVM.diag.cacheListAssets(w);}
function DIAG_POLYGON_ZKEVM_TOKEN_PRICE(t){return _POLYGON_ZKEVM.diag.tokenPrice(t);}
function DIAG_POLYGON_ZKEVM_NATIVE_PRICE(){return _POLYGON_ZKEVM.diag.nativePrice();}
function DIAG_POLYGON_ZKEVM_WALLET(w){return _POLYGON_ZKEVM.diag.walletFull(w);}
function DIAG_POLYGON_ZKEVM_CACHE_STATS(){return _POLYGON_ZKEVM.diag.cacheStats();}
function DIAG_POLYGON_ZKEVM_CLEAR_CACHE(w,c){return _POLYGON_ZKEVM.diag.clearCache(w,c);}
