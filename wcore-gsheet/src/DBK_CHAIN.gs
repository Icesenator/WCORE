/**
 * DBK_CHAIN.gs - DBK Chain (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _DBK_CHAIN = ChainFactory.createEvmChain("DBK_CHAIN", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://rpc.mainnet.dbkchain.io/", "https://20240603.rpc.thirdweb.com/"] },
 CHAIN: {
 NAME: "DBK Chain",
 CHAIN_ID: 20240603,
 NATIVE_SYMBOL: "ETH",
 NATIVE_NAME: "Ether",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:ethereum",
 NATIVE_GECKO_ID: "ethereum",
 DEX_SLUG: "dbk-chain",
 GT_NETWORK: "dbk-chain"
 },
 LLAMA_ID_MAP: { "DAI":"coingecko:dai", "ETH":"coingecko:ethereum", "USDC":"coingecko:usd-coin", "USDT":"coingecko:tether", "WBTC":"coingecko:wrapped-bitcoin", "WETH":"coingecko:weth" }
});

// Main functions
function GET_WALLET_ASSETS_DBK_CHAIN(a,r,t,f,g){return _DBK_CHAIN.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_DBK_CHAIN(a){return _DBK_CHAIN.getCachedWalletAssets(a);}
function DBK_CHAIN_REFRESH_STATUS(a,r,t,f,g){return _DBK_CHAIN.getRefreshStatus(a,r,t,f,g);}
function DBK_CHAIN_STATS(a,t){return _DBK_CHAIN.getStats(a,t);}

// Diagnostic functions
function DIAG_DBK_CHAIN_TOKEN(w,t,r){return _DBK_CHAIN.diag.tokenBalance(w,t,r);}
function DIAG_DBK_CHAIN_COMPARE_RPCS(w,t){return _DBK_CHAIN.diag.compareRpcs(w,t);}
function DIAG_DBK_CHAIN_CHECK_ERC20(t){return _DBK_CHAIN.diag.checkErc20(t);}
function DIAG_DBK_CHAIN_RPC_HEALTH(){return _DBK_CHAIN.diag.rpcHealth();}
function DIAG_DBK_CHAIN_NATIVE_BALANCE(w){return _DBK_CHAIN.diag.nativeBalance(w);}
function DIAG_DBK_CHAIN_CACHE(w){return _DBK_CHAIN.diag.cacheInspect(w);}
function DIAG_DBK_CHAIN_CACHE_TOKEN(w,t){return _DBK_CHAIN.diag.cacheFindToken(w,t);}
function DIAG_DBK_CHAIN_CACHE_ASSETS(w){return _DBK_CHAIN.diag.cacheListAssets(w);}
function DIAG_DBK_CHAIN_TOKEN_PRICE(t){return _DBK_CHAIN.diag.tokenPrice(t);}
function DIAG_DBK_CHAIN_NATIVE_PRICE(){return _DBK_CHAIN.diag.nativePrice();}
function DIAG_DBK_CHAIN_WALLET(w){return _DBK_CHAIN.diag.walletFull(w);}
function DIAG_DBK_CHAIN_CACHE_STATS(){return _DBK_CHAIN.diag.cacheStats();}
function DIAG_DBK_CHAIN_CLEAR_CACHE(w,c){return _DBK_CHAIN.diag.clearCache(w,c);}
