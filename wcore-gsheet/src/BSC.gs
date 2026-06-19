/**
 * BSC.gs - BNB Chain (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _BSC = ChainFactory.createEvmChain("BSC", {
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: ["https://bsc-rpc.publicnode.com", "https://bsc.drpc.org", "https://bsc-dataseed.binance.org"],
    DISABLE_JSON_RPC_BATCH: true
  },
 CHAIN: {
 NAME: "BNB Chain",
 CHAIN_ID: 56,
 NATIVE_SYMBOL: "BNB",
 NATIVE_NAME: "BNB",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:binancecoin",
 NATIVE_GECKO_ID: "binancecoin",
 DEX_SLUG: "bsc",
 GT_NETWORK: "bsc"
 },
  LLAMA_ID_MAP: { "BNB":"coingecko:binancecoin", "DAI":"coingecko:dai", "HLG":"coingecko:holograph", "USDC":"coingecko:usd-coin", "USDT":"coingecko:tether", "WBNB":"coingecko:wbnb", "WBTC":"coingecko:wrapped-bitcoin", "WETH":"coingecko:weth" },
  LLAMA_CONTRACT_MAP: {
    "0x51e667e91b4b8cb8e6e0528757f248406bd34b57": "bsc:0x51e667e91b4b8cb8e6e0528757f248406bd34b57"
  }
 });

// Main functions
function GET_WALLET_ASSETS_BSC(a,r,t,f,g){return _BSC.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_BSC(a){return _BSC.getCachedWalletAssets(a);}
function BSC_REFRESH_STATUS(a,r,t,f,g){return _BSC.getRefreshStatus(a,r,t,f,g);}
function BSC_STATS(a,t){return _BSC.getStats(a,t);}

// Diagnostic functions
function DIAG_BSC_TOKEN(w,t,r){return _BSC.diag.tokenBalance(w,t,r);}
function DIAG_BSC_COMPARE_RPCS(w,t){return _BSC.diag.compareRpcs(w,t);}
function DIAG_BSC_CHECK_ERC20(t){return _BSC.diag.checkErc20(t);}
function DIAG_BSC_RPC_HEALTH(){return _BSC.diag.rpcHealth();}
function DIAG_BSC_NATIVE_BALANCE(w){return _BSC.diag.nativeBalance(w);}
function DIAG_BSC_CACHE(w){return _BSC.diag.cacheInspect(w);}
function DIAG_BSC_CACHE_TOKEN(w,t){return _BSC.diag.cacheFindToken(w,t);}
function DIAG_BSC_CACHE_ASSETS(w){return _BSC.diag.cacheListAssets(w);}
function DIAG_BSC_TOKEN_PRICE(t){return _BSC.diag.tokenPrice(t);}
function DIAG_BSC_NATIVE_PRICE(){return _BSC.diag.nativePrice();}
function DIAG_BSC_WALLET(w){return _BSC.diag.walletFull(w);}
function DIAG_BSC_CACHE_STATS(){return _BSC.diag.cacheStats();}
function DIAG_BSC_CLEAR_CACHE(w,c){return _BSC.diag.clearCache(w,c);}
