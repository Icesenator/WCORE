/**
 * ARBITRUM_NOVA.gs - Arbitrum Nova (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _ARBITRUM_NOVA = ChainFactory.createEvmChain("ARBITRUM_NOVA", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://nova.arbitrum.io/rpc", "https://arbitrum-nova.drpc.org", "https://arbitrum-nova.publicnode.com"] },
 CHAIN: {
 NAME: "Arbitrum Nova",
 CHAIN_ID: 42170,
 NATIVE_SYMBOL: "ETH",
 NATIVE_NAME: "Ether",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:ethereum",
 NATIVE_GECKO_ID: "ethereum",
 DEX_SLUG: "arbitrum-nova",
 GT_NETWORK: "arbitrum_nova"
 },
 LLAMA_ID_MAP: { "ARB":"coingecko:arbitrum", "DAI":"coingecko:dai", "ETH":"coingecko:ethereum", "USDC":"coingecko:usd-coin", "USDT":"coingecko:tether", "WETH":"coingecko:weth" }
});

// Main functions
function GET_WALLET_ASSETS_ARBITRUM_NOVA(a,r,t,f,g){return _ARBITRUM_NOVA.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_ARBITRUM_NOVA(a){return _ARBITRUM_NOVA.getCachedWalletAssets(a);}
function ARBITRUM_NOVA_REFRESH_STATUS(a,r,t,f,g){return _ARBITRUM_NOVA.getRefreshStatus(a,r,t,f,g);}
function ARBITRUM_NOVA_STATS(a,t){return _ARBITRUM_NOVA.getStats(a,t);}

// Diagnostic functions
function DIAG_ARBITRUM_NOVA_TOKEN(w,t,r){return _ARBITRUM_NOVA.diag.tokenBalance(w,t,r);}
function DIAG_ARBITRUM_NOVA_COMPARE_RPCS(w,t){return _ARBITRUM_NOVA.diag.compareRpcs(w,t);}
function DIAG_ARBITRUM_NOVA_CHECK_ERC20(t){return _ARBITRUM_NOVA.diag.checkErc20(t);}
function DIAG_ARBITRUM_NOVA_RPC_HEALTH(){return _ARBITRUM_NOVA.diag.rpcHealth();}
function DIAG_ARBITRUM_NOVA_NATIVE_BALANCE(w){return _ARBITRUM_NOVA.diag.nativeBalance(w);}
function DIAG_ARBITRUM_NOVA_CACHE(w){return _ARBITRUM_NOVA.diag.cacheInspect(w);}
function DIAG_ARBITRUM_NOVA_CACHE_TOKEN(w,t){return _ARBITRUM_NOVA.diag.cacheFindToken(w,t);}
function DIAG_ARBITRUM_NOVA_CACHE_ASSETS(w){return _ARBITRUM_NOVA.diag.cacheListAssets(w);}
function DIAG_ARBITRUM_NOVA_TOKEN_PRICE(t){return _ARBITRUM_NOVA.diag.tokenPrice(t);}
function DIAG_ARBITRUM_NOVA_NATIVE_PRICE(){return _ARBITRUM_NOVA.diag.nativePrice();}
function DIAG_ARBITRUM_NOVA_WALLET(w){return _ARBITRUM_NOVA.diag.walletFull(w);}
function DIAG_ARBITRUM_NOVA_CACHE_STATS(){return _ARBITRUM_NOVA.diag.cacheStats();}
function DIAG_ARBITRUM_NOVA_CLEAR_CACHE(w,c){return _ARBITRUM_NOVA.diag.clearCache(w,c);}
