/**
 * SEI.gs - Sei (v4.9.7)
 * ChainFactory pattern with explicit function declarations
 * 
 * v4.9.7 FIX:
 * - ADDED: NATIVE_LLAMA_ID for DefiLlama pricing
 * - ADDED: NATIVE_GECKO_ID for CoinGecko fallback
 * - ADDED: LLAMA_ID_MAP for SEI and WSEI tokens
 * - ADDED: NATIVE_PRICE_CONTRACT (WSEI) for DEX pricing fallback
 * - BUMPED: CACHE_VERSION to 64 to force price refresh
 */

var _SEI = ChainFactory.createEvmChain("SEI", {
 CACHE_VERSION: 64,
 RPC: { 
 ENDPOINTS: [
 "https://evm-rpc.sei-apis.com", 
 "https://sei-evm-rpc.publicnode.com", 
 "https://1329.rpc.thirdweb.com"
 ] 
 },
 CHAIN: {
 NAME: "Sei",
 CHAIN_ID: 1329,
 NATIVE_SYMBOL: "SEI",
 NATIVE_NAME: "Sei",
 NATIVE_DECIMALS: 18,
 // PRICING: DefiLlama ID for native token
 NATIVE_LLAMA_ID: "coingecko:sei-network",
 // PRICING: CoinGecko ID fallback
 NATIVE_GECKO_ID: "sei-network",
 // PRICING: Wrapped SEI contract for DEX price fallback
 // WSEI on Sei EVM: 0xE30fEdD158A2e3b13e9badaeAbaFc5516e95e8C7
 NATIVE_PRICE_CONTRACT: "0xE30fEdD158A2e3b13e9badaeAbaFc5516e95e8C7",
 // DexScreener slug for Sei
 DEX_SLUG: "seiv2",
 // GeckoTerminal network identifier
 GT_NETWORK: "sei-network"
 },
 // Token pricing mappings
 LLAMA_ID_MAP: {
 "SEI": "coingecko:sei-network",
 "WSEI": "coingecko:sei-network"
 }
});

// Main functions
function GET_WALLET_ASSETS_SEI(a,r,t,f,g){return _SEI.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_SEI(a){return _SEI.getCachedWalletAssets(a);}
function SEI_REFRESH_STATUS(a,r,t,f,g){return _SEI.getRefreshStatus(a,r,t,f,g);}
function SEI_STATS(a,t){return _SEI.getStats(a,t);}

// Diagnostic functions
function DIAG_SEI_TOKEN(w,t,r){return _SEI.diag.tokenBalance(w,t,r);}
function DIAG_SEI_COMPARE_RPCS(w,t){return _SEI.diag.compareRpcs(w,t);}
function DIAG_SEI_CHECK_ERC20(t){return _SEI.diag.checkErc20(t);}
function DIAG_SEI_RPC_HEALTH(){return _SEI.diag.rpcHealth();}
function DIAG_SEI_NATIVE_BALANCE(w){return _SEI.diag.nativeBalance(w);}
function DIAG_SEI_CACHE(w){return _SEI.diag.cacheInspect(w);}
function DIAG_SEI_CACHE_TOKEN(w,t){return _SEI.diag.cacheFindToken(w,t);}
function DIAG_SEI_CACHE_ASSETS(w){return _SEI.diag.cacheListAssets(w);}
function DIAG_SEI_TOKEN_PRICE(t){return _SEI.diag.tokenPrice(t);}
function DIAG_SEI_NATIVE_PRICE(){return _SEI.diag.nativePrice();}
function DIAG_SEI_WALLET(w){return _SEI.diag.walletFull(w);}
function DIAG_SEI_CACHE_STATS(){return _SEI.diag.cacheStats();}
function DIAG_SEI_CLEAR_CACHE(w,c){return _SEI.diag.clearCache(w,c);}
