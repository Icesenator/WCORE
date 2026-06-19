/**
 * WORLDCHAIN.gs - World Chain (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _WORLDCHAIN = ChainFactory.createEvmChain("WORLDCHAIN", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://worldchain-mainnet.g.alchemy.com/public", "https://world-chain.drpc.org", "https://worldchain-mainnet.gateway.tenderly.co", "https://480.rpc.thirdweb.com"] }, // Tenderly, Thirdweb
 CHAIN: {
 NAME: "World Chain",
 CHAIN_ID: 480,
 NATIVE_SYMBOL: "ETH",
 NATIVE_NAME: "Ether",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:ethereum",
 NATIVE_GECKO_ID: "ethereum",
 DEX_SLUG: "worldchain",
 GT_NETWORK: "world-chain"
 },
 LLAMA_ID_MAP: { "ETH":"coingecko:ethereum", "WLD":"coingecko:worldcoin-wld" }
});

// Main functions
function GET_WALLET_ASSETS_WORLDCHAIN(a,r,t,f,g){return _WORLDCHAIN.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_WORLDCHAIN(a){return _WORLDCHAIN.getCachedWalletAssets(a);}
function WORLDCHAIN_REFRESH_STATUS(a,r,t,f,g){return _WORLDCHAIN.getRefreshStatus(a,r,t,f,g);}
function WORLDCHAIN_STATS(a,t){return _WORLDCHAIN.getStats(a,t);}

// Diagnostic functions
function DIAG_WORLDCHAIN_TOKEN(w,t,r){return _WORLDCHAIN.diag.tokenBalance(w,t,r);}
function DIAG_WORLDCHAIN_COMPARE_RPCS(w,t){return _WORLDCHAIN.diag.compareRpcs(w,t);}
function DIAG_WORLDCHAIN_CHECK_ERC20(t){return _WORLDCHAIN.diag.checkErc20(t);}
function DIAG_WORLDCHAIN_RPC_HEALTH(){return _WORLDCHAIN.diag.rpcHealth();}
function DIAG_WORLDCHAIN_NATIVE_BALANCE(w){return _WORLDCHAIN.diag.nativeBalance(w);}
function DIAG_WORLDCHAIN_CACHE(w){return _WORLDCHAIN.diag.cacheInspect(w);}
function DIAG_WORLDCHAIN_CACHE_TOKEN(w,t){return _WORLDCHAIN.diag.cacheFindToken(w,t);}
function DIAG_WORLDCHAIN_CACHE_ASSETS(w){return _WORLDCHAIN.diag.cacheListAssets(w);}
function DIAG_WORLDCHAIN_TOKEN_PRICE(t){return _WORLDCHAIN.diag.tokenPrice(t);}
function DIAG_WORLDCHAIN_NATIVE_PRICE(){return _WORLDCHAIN.diag.nativePrice();}
function DIAG_WORLDCHAIN_WALLET(w){return _WORLDCHAIN.diag.walletFull(w);}
function DIAG_WORLDCHAIN_CACHE_STATS(){return _WORLDCHAIN.diag.cacheStats();}
function DIAG_WORLDCHAIN_CLEAR_CACHE(w,c){return _WORLDCHAIN.diag.clearCache(w,c);}
