/**
 * ZETACHAIN.gs - ZetaChain (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _ZETACHAIN = ChainFactory.createEvmChain("ZETACHAIN", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://zetachain-evm.blockpi.network/v1/rpc/public", "https://zetachain-mainnet.g.allthatnode.com/archive/evm", "https://zeta-chain.drpc.org"] },
 CHAIN: {
 NAME: "ZetaChain",
 CHAIN_ID: 7000,
 NATIVE_SYMBOL: "ZETA",
 NATIVE_NAME: "Zeta",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:zetachain",
 NATIVE_GECKO_ID: "zetachain",
 DEX_SLUG: "zetachain",
 GT_NETWORK: "zetachain"
 },
 LLAMA_ID_MAP: { "BTC":"coingecko:bitcoin", "ETH":"coingecko:ethereum", "USDC":"coingecko:usd-coin", "USDT":"coingecko:tether", "WZETA":"coingecko:zetachain", "ZETA":"coingecko:zetachain" }
});

// Main functions
function GET_WALLET_ASSETS_ZETACHAIN(a,r,t,f,g){return _ZETACHAIN.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_ZETACHAIN(a){return _ZETACHAIN.getCachedWalletAssets(a);}
function ZETACHAIN_REFRESH_STATUS(a,r,t,f,g){return _ZETACHAIN.getRefreshStatus(a,r,t,f,g);}
function ZETACHAIN_STATS(a,t){return _ZETACHAIN.getStats(a,t);}

// Diagnostic functions
function DIAG_ZETACHAIN_TOKEN(w,t,r){return _ZETACHAIN.diag.tokenBalance(w,t,r);}
function DIAG_ZETACHAIN_COMPARE_RPCS(w,t){return _ZETACHAIN.diag.compareRpcs(w,t);}
function DIAG_ZETACHAIN_CHECK_ERC20(t){return _ZETACHAIN.diag.checkErc20(t);}
function DIAG_ZETACHAIN_RPC_HEALTH(){return _ZETACHAIN.diag.rpcHealth();}
function DIAG_ZETACHAIN_NATIVE_BALANCE(w){return _ZETACHAIN.diag.nativeBalance(w);}
function DIAG_ZETACHAIN_CACHE(w){return _ZETACHAIN.diag.cacheInspect(w);}
function DIAG_ZETACHAIN_CACHE_TOKEN(w,t){return _ZETACHAIN.diag.cacheFindToken(w,t);}
function DIAG_ZETACHAIN_CACHE_ASSETS(w){return _ZETACHAIN.diag.cacheListAssets(w);}
function DIAG_ZETACHAIN_TOKEN_PRICE(t){return _ZETACHAIN.diag.tokenPrice(t);}
function DIAG_ZETACHAIN_NATIVE_PRICE(){return _ZETACHAIN.diag.nativePrice();}
function DIAG_ZETACHAIN_WALLET(w){return _ZETACHAIN.diag.walletFull(w);}
function DIAG_ZETACHAIN_CACHE_STATS(){return _ZETACHAIN.diag.cacheStats();}
function DIAG_ZETACHAIN_CLEAR_CACHE(w,c){return _ZETACHAIN.diag.clearCache(w,c);}
