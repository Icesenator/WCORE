/**
 * ROBINHOOD_CHAIN.gs - Robinhood Chain (v4.15.119)
 * ChainFactory pattern with explicit function declarations
 */

var _ROBINHOOD_CHAIN = ChainFactory.createEvmChain("ROBINHOOD_CHAIN", {
  CACHE_VERSION: 63,
  RPC: { ENDPOINTS: ["https://rpc.mainnet.chain.robinhood.com"] },
  ACTIVITY_EXPLORER: { TYPE: "blockscout", BASE_URL: "https://robinhoodchain.blockscout.com", TX_PATH: "/api/v2/addresses/{address}/transactions" },
  CHAIN: {
    NAME: "Robinhood Chain",
    CHAIN_ID: 4663,
    NATIVE_SYMBOL: "ETH",
    NATIVE_NAME: "Ether",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum",
    NATIVE_GECKO_ID: "ethereum"
  },
  LLAMA_ID_MAP: { "ETH":"coingecko:ethereum" }
});

// Main functions
function GET_WALLET_ASSETS_ROBINHOOD_CHAIN(a,r,t,f,g){return _ROBINHOOD_CHAIN.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_ROBINHOOD_CHAIN(a){return _ROBINHOOD_CHAIN.getCachedWalletAssets(a);}
function ROBINHOOD_CHAIN_REFRESH_STATUS(a,r,t,f,g){return _ROBINHOOD_CHAIN.getRefreshStatus(a,r,t,f,g);}
function ROBINHOOD_CHAIN_STATS(a,t){return _ROBINHOOD_CHAIN.getStats(a,t);}

// Diagnostic functions
function DIAG_ROBINHOOD_CHAIN_TOKEN(w,t,r){return _ROBINHOOD_CHAIN.diag.tokenBalance(w,t,r);}
function DIAG_ROBINHOOD_CHAIN_COMPARE_RPCS(w,t){return _ROBINHOOD_CHAIN.diag.compareRpcs(w,t);}
function DIAG_ROBINHOOD_CHAIN_CHECK_ERC20(t){return _ROBINHOOD_CHAIN.diag.checkErc20(t);}
function DIAG_ROBINHOOD_CHAIN_RPC_HEALTH(){return _ROBINHOOD_CHAIN.diag.rpcHealth();}
function DIAG_ROBINHOOD_CHAIN_NATIVE_BALANCE(w){return _ROBINHOOD_CHAIN.diag.nativeBalance(w);}
function DIAG_ROBINHOOD_CHAIN_CACHE(w){return _ROBINHOOD_CHAIN.diag.cacheInspect(w);}
function DIAG_ROBINHOOD_CHAIN_CACHE_TOKEN(w,t){return _ROBINHOOD_CHAIN.diag.cacheFindToken(w,t);}
function DIAG_ROBINHOOD_CHAIN_CACHE_ASSETS(w){return _ROBINHOOD_CHAIN.diag.cacheListAssets(w);}
function DIAG_ROBINHOOD_CHAIN_TOKEN_PRICE(t){return _ROBINHOOD_CHAIN.diag.tokenPrice(t);}
function DIAG_ROBINHOOD_CHAIN_NATIVE_PRICE(){return _ROBINHOOD_CHAIN.diag.nativePrice();}
function DIAG_ROBINHOOD_CHAIN_WALLET(w){return _ROBINHOOD_CHAIN.diag.walletFull(w);}
function DIAG_ROBINHOOD_CHAIN_CACHE_STATS(){return _ROBINHOOD_CHAIN.diag.cacheStats();}
function DIAG_ROBINHOOD_CHAIN_CLEAR_CACHE(w,c){return _ROBINHOOD_CHAIN.diag.clearCache(w,c);}
