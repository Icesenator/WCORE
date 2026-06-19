/**
 * STORY.gs - Story (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _STORY = ChainFactory.createEvmChain("STORY", {
 CACHE_VERSION: 65,
 RPC: { ENDPOINTS: ["https://mainnet.storyrpc.io", "https://story.drpc.org", "https://rpc.ankr.com/story", "https://story-mainnet-evmrpc.mandragora.io"] },
 CHAIN: {
 NAME: "Story",
 CHAIN_ID: 1514,
 NATIVE_SYMBOL: "IP",
 NATIVE_NAME: "Story IP",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:story-2",
 NATIVE_GECKO_ID: "story-2",
 DEX_SLUG: "story",
 GT_NETWORK: "story"
 },
 LLAMA_ID_MAP: { "IP":"coingecko:story-2", "USDC":"coingecko:usd-coin", "USDT":"coingecko:tether", "WIP":"coingecko:story-2" }
});

// Main functions
function GET_WALLET_ASSETS_STORY(a,r,t,f,g){return _STORY.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_STORY(a){return _STORY.getCachedWalletAssets(a);}
function STORY_REFRESH_STATUS(a,r,t,f,g){return _STORY.getRefreshStatus(a,r,t,f,g);}
function STORY_STATS(a,t){return _STORY.getStats(a,t);}

// Diagnostic functions
function DIAG_STORY_TOKEN(w,t,r){return _STORY.diag.tokenBalance(w,t,r);}
function DIAG_STORY_COMPARE_RPCS(w,t){return _STORY.diag.compareRpcs(w,t);}
function DIAG_STORY_CHECK_ERC20(t){return _STORY.diag.checkErc20(t);}
function DIAG_STORY_RPC_HEALTH(){return _STORY.diag.rpcHealth();}
function DIAG_STORY_NATIVE_BALANCE(w){return _STORY.diag.nativeBalance(w);}
function DIAG_STORY_CACHE(w){return _STORY.diag.cacheInspect(w);}
function DIAG_STORY_CACHE_TOKEN(w,t){return _STORY.diag.cacheFindToken(w,t);}
function DIAG_STORY_CACHE_ASSETS(w){return _STORY.diag.cacheListAssets(w);}
function DIAG_STORY_TOKEN_PRICE(t){return _STORY.diag.tokenPrice(t);}
function DIAG_STORY_NATIVE_PRICE(){return _STORY.diag.nativePrice();}
function DIAG_STORY_WALLET(w){return _STORY.diag.walletFull(w);}
function DIAG_STORY_CACHE_STATS(){return _STORY.diag.cacheStats();}
function DIAG_STORY_CLEAR_CACHE(w,c){return _STORY.diag.clearCache(w,c);}
