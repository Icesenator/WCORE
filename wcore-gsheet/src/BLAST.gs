/**
 * BLAST.gs - Blast (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _BLAST = ChainFactory.createEvmChain("BLAST", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://rpc.blast.io", "https://blast.din.dev/rpc", "https://blastl2-mainnet.public.blastapi.io"] },
 CHAIN: {
 NAME: "Blast",
 CHAIN_ID: 81457,
 NATIVE_SYMBOL: "ETH",
 NATIVE_NAME: "Ethereum",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:ethereum",
 NATIVE_GECKO_ID: "ethereum",
 DEX_SLUG: "blast",
 GT_NETWORK: "blast"
 },
 LLAMA_ID_MAP: { "DAI":"coingecko:dai", "ETH":"coingecko:ethereum", "USDC":"coingecko:usd-coin", "USDT":"coingecko:tether", "WBTC":"coingecko:wrapped-bitcoin", "WETH":"coingecko:weth" }
});

// Main functions
function GET_WALLET_ASSETS_BLAST(a,r,t,f,g){return _BLAST.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_BLAST(a){return _BLAST.getCachedWalletAssets(a);}
function BLAST_REFRESH_STATUS(a,r,t,f,g){return _BLAST.getRefreshStatus(a,r,t,f,g);}
function BLAST_STATS(a,t){return _BLAST.getStats(a,t);}

// Diagnostic functions
function DIAG_BLAST_TOKEN(w,t,r){return _BLAST.diag.tokenBalance(w,t,r);}
function DIAG_BLAST_COMPARE_RPCS(w,t){return _BLAST.diag.compareRpcs(w,t);}
function DIAG_BLAST_CHECK_ERC20(t){return _BLAST.diag.checkErc20(t);}
function DIAG_BLAST_RPC_HEALTH(){return _BLAST.diag.rpcHealth();}
function DIAG_BLAST_NATIVE_BALANCE(w){return _BLAST.diag.nativeBalance(w);}
function DIAG_BLAST_CACHE(w){return _BLAST.diag.cacheInspect(w);}
function DIAG_BLAST_CACHE_TOKEN(w,t){return _BLAST.diag.cacheFindToken(w,t);}
function DIAG_BLAST_CACHE_ASSETS(w){return _BLAST.diag.cacheListAssets(w);}
function DIAG_BLAST_TOKEN_PRICE(t){return _BLAST.diag.tokenPrice(t);}
function DIAG_BLAST_NATIVE_PRICE(){return _BLAST.diag.nativePrice();}
function DIAG_BLAST_WALLET(w){return _BLAST.diag.walletFull(w);}
function DIAG_BLAST_CACHE_STATS(){return _BLAST.diag.cacheStats();}
function DIAG_BLAST_CLEAR_CACHE(w,c){return _BLAST.diag.clearCache(w,c);}
