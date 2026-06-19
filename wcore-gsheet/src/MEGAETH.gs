/**
 * MEGAETH.gs - MegaETH (v4.13.1)
 * ChainFactory pattern with explicit function declarations
 * 
 * MegaETH is a high-performance Ethereum L2 ("real-time blockchain")
 * Chain ID: 4326
 * RPC: https://mainnet.megaeth.com/rpc
 * Explorer: https://megaeth.blockscout.com
 * 
 * v4.13.1 - REMOVED carrot.megaeth.com/rpc (returns false 0x0 for eth_getBalance)
 * v4.13.2 - Added dRPC endpoint for redundancy (was single endpoint)
 */

var _MEGAETH = ChainFactory.createEvmChain("MEGAETH", {
 CACHE_VERSION: 64,
 RPC: {
 ENDPOINTS: [
 "https://mainnet.megaeth.com/rpc",
 "https://megaeth.drpc.org",
 "https://rpc-megaeth-mainnet.globalstake.io" // GlobalStake
 ]
 },
 CHAIN: {
 NAME: "MegaETH",
 CHAIN_ID: 4326,
 NATIVE_SYMBOL: "ETH",
 NATIVE_NAME: "Ether",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:ethereum",
 NATIVE_GECKO_ID: "ethereum",
 DEX_SLUG: "megaeth",
 GT_NETWORK: "megaeth"
 },
 LLAMA_ID_MAP: { 
 "ETH": "coingecko:ethereum", 
 "WETH": "coingecko:weth" 
 }
});

// Main functions
function GET_WALLET_ASSETS_MEGAETH(a,r,t,f,g){return _MEGAETH.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_MEGAETH(a){return _MEGAETH.getCachedWalletAssets(a);}
function MEGAETH_REFRESH_STATUS(a,r,t,f,g){return _MEGAETH.getRefreshStatus(a,r,t,f,g);}
function MEGAETH_STATS(a,t){return _MEGAETH.getStats(a,t);}

// Diagnostic functions
function DIAG_MEGAETH_TOKEN(w,t,r){return _MEGAETH.diag.tokenBalance(w,t,r);}
function DIAG_MEGAETH_COMPARE_RPCS(w,t){return _MEGAETH.diag.compareRpcs(w,t);}
function DIAG_MEGAETH_CHECK_ERC20(t){return _MEGAETH.diag.checkErc20(t);}
function DIAG_MEGAETH_RPC_HEALTH(){return _MEGAETH.diag.rpcHealth();}
function DIAG_MEGAETH_NATIVE_BALANCE(w){return _MEGAETH.diag.nativeBalance(w);}
function DIAG_MEGAETH_CACHE(w){return _MEGAETH.diag.cacheInspect(w);}
function DIAG_MEGAETH_CACHE_TOKEN(w,t){return _MEGAETH.diag.cacheFindToken(w,t);}
function DIAG_MEGAETH_CACHE_ASSETS(w){return _MEGAETH.diag.cacheListAssets(w);}
function DIAG_MEGAETH_TOKEN_PRICE(t){return _MEGAETH.diag.tokenPrice(t);}
function DIAG_MEGAETH_NATIVE_PRICE(){return _MEGAETH.diag.nativePrice();}
function DIAG_MEGAETH_WALLET(w){return _MEGAETH.diag.walletFull(w);}
function DIAG_MEGAETH_CACHE_STATS(){return _MEGAETH.diag.cacheStats();}
function DIAG_MEGAETH_CLEAR_CACHE(w,c){return _MEGAETH.diag.clearCache(w,c);}
