/**
 * GNOSIS.gs - Gnosis (v4.14.2)
 * ChainFactory pattern with explicit function declarations
 * v4.14.2: PRICE_IGNORE_CONTRACTS for tokens with no available price source
 * v4.9.6: Added LLAMA_CONTRACT_MAP for REG (RealToken Ecosystem Governance)
 */

var _GNOSIS = ChainFactory.createEvmChain("GNOSIS", {
 CACHE_VERSION: 65,
 RPC: { ENDPOINTS: ["https://rpc.gnosischain.com", "https://gnosis.publicnode.com", "https://gnosis.drpc.org"] },
 CHAIN: {
 NAME: "Gnosis",
 CHAIN_ID: 100,
 NATIVE_SYMBOL: "xDAI",
 NATIVE_NAME: "xDAI",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:xdai",
 NATIVE_GECKO_ID: "xdai",
 DEX_SLUG: "gnosis",
 GT_NETWORK: "xdai"
 },
 LLAMA_ID_MAP: {
 "DAI":"coingecko:dai",
 "USDC":"coingecko:usd-coin",
 "USDT":"coingecko:tether",
 "WBTC":"coingecko:wrapped-bitcoin",
 "WETH":"coingecko:weth",
 "WXDAI":"coingecko:wrapped-xdai",
 "XDAI":"coingecko:xdai",
 "xDAI":"coingecko:xdai",
 "REG":"coingecko:realtoken-ecosystem-governance"
 },
 // v4.9.6: Contract-to-LlamaID mapping for tokens not on DexScreener/GeckoTerminal
 LLAMA_CONTRACT_MAP: {
 "0x0aa1e96d2a46ec6beb2923de1e61addf5f5f1dce": "coingecko:realtoken-ecosystem-governance"
 },
 // v4.14.2: Tokens to exclude from missing_count (no price source available)
 PRICE_IGNORE_CONTRACTS: [
 "0x9908801df7902675c3fedd6fea0294d18d5d5d34",
 "0xf3220cd8f66aeb86fc2a82502977eab4bfd2f647"
 ]
});

// Main functions
function GET_WALLET_ASSETS_GNOSIS(a,r,t,f,g){return _GNOSIS.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_GNOSIS(a){return _GNOSIS.getCachedWalletAssets(a);}
function GNOSIS_REFRESH_STATUS(a,r,t,f,g){return _GNOSIS.getRefreshStatus(a,r,t,f,g);}
function GNOSIS_STATS(a,t){return _GNOSIS.getStats(a,t);}

// Diagnostic functions
function DIAG_GNOSIS_TOKEN(w,t,r){return _GNOSIS.diag.tokenBalance(w,t,r);}
function DIAG_GNOSIS_COMPARE_RPCS(w,t){return _GNOSIS.diag.compareRpcs(w,t);}
function DIAG_GNOSIS_CHECK_ERC20(t){return _GNOSIS.diag.checkErc20(t);}
function DIAG_GNOSIS_RPC_HEALTH(){return _GNOSIS.diag.rpcHealth();}
function DIAG_GNOSIS_NATIVE_BALANCE(w){return _GNOSIS.diag.nativeBalance(w);}
function DIAG_GNOSIS_CACHE(w){return _GNOSIS.diag.cacheInspect(w);}
function DIAG_GNOSIS_CACHE_TOKEN(w,t){return _GNOSIS.diag.cacheFindToken(w,t);}
function DIAG_GNOSIS_CACHE_ASSETS(w){return _GNOSIS.diag.cacheListAssets(w);}
function DIAG_GNOSIS_TOKEN_PRICE(t){return _GNOSIS.diag.tokenPrice(t);}
function DIAG_GNOSIS_NATIVE_PRICE(){return _GNOSIS.diag.nativePrice();}
function DIAG_GNOSIS_WALLET(w){return _GNOSIS.diag.walletFull(w);}
function DIAG_GNOSIS_CACHE_STATS(){return _GNOSIS.diag.cacheStats();}
function DIAG_GNOSIS_CLEAR_CACHE(w,c){return _GNOSIS.diag.clearCache(w,c);}
