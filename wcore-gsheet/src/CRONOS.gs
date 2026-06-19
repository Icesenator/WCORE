/**
 * CRONOS.gs - Cronos (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _CRONOS = ChainFactory.createEvmChain("CRONOS", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://evm.cronos.org", "https://cronos.drpc.org", "https://cronos-evm-rpc.publicnode.com", "https://cronos.blockpi.network/v1/rpc/public"] },
 CHAIN: {
 NAME: "Cronos",
 CHAIN_ID: 25,
 NATIVE_SYMBOL: "CRO",
 NATIVE_NAME: "Cronos",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:crypto-com-chain",
 NATIVE_GECKO_ID: "crypto-com-chain",
 DEX_SLUG: "cronos",
 GT_NETWORK: "cro"
 },
 LLAMA_ID_MAP: { "CRO":"coingecko:crypto-com-chain", "DAI":"coingecko:dai", "FERRO":"coingecko:ferro", "USDC":"coingecko:usd-coin", "USDT":"coingecko:tether", "VVS":"coingecko:vvs-finance", "WBTC":"coingecko:wrapped-bitcoin", "WCRO":"coingecko:wrapped-cro", "WETH":"coingecko:weth" }
});

// Main functions
function GET_WALLET_ASSETS_CRONOS(a,r,t,f,g){return _CRONOS.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_CRONOS(a){return _CRONOS.getCachedWalletAssets(a);}
function CRONOS_REFRESH_STATUS(a,r,t,f,g){return _CRONOS.getRefreshStatus(a,r,t,f,g);}
function CRONOS_STATS(a,t){return _CRONOS.getStats(a,t);}

// Diagnostic functions
function DIAG_CRONOS_TOKEN(w,t,r){return _CRONOS.diag.tokenBalance(w,t,r);}
function DIAG_CRONOS_COMPARE_RPCS(w,t){return _CRONOS.diag.compareRpcs(w,t);}
function DIAG_CRONOS_CHECK_ERC20(t){return _CRONOS.diag.checkErc20(t);}
function DIAG_CRONOS_RPC_HEALTH(){return _CRONOS.diag.rpcHealth();}
function DIAG_CRONOS_NATIVE_BALANCE(w){return _CRONOS.diag.nativeBalance(w);}
function DIAG_CRONOS_CACHE(w){return _CRONOS.diag.cacheInspect(w);}
function DIAG_CRONOS_CACHE_TOKEN(w,t){return _CRONOS.diag.cacheFindToken(w,t);}
function DIAG_CRONOS_CACHE_ASSETS(w){return _CRONOS.diag.cacheListAssets(w);}
function DIAG_CRONOS_TOKEN_PRICE(t){return _CRONOS.diag.tokenPrice(t);}
function DIAG_CRONOS_NATIVE_PRICE(){return _CRONOS.diag.nativePrice();}
function DIAG_CRONOS_WALLET(w){return _CRONOS.diag.walletFull(w);}
function DIAG_CRONOS_CACHE_STATS(){return _CRONOS.diag.cacheStats();}
function DIAG_CRONOS_CLEAR_CACHE(w,c){return _CRONOS.diag.clearCache(w,c);}
