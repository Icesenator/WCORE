/**
 * CORE.gs - Core (chainId 1116) - v4.15.16
 * ChainFactory pattern with validated external metadata.
 *
 * Validation report:
 * - RPC endpoints: Core DAO official docs list Core Mainnet as 1116 (0x45c)
 *   and publish https://rpc.coredao.org, https://rpcar.coredao.org,
 *   https://rpc.ankr.com/core, https://1rpc.io/core, and https://core.drpc.org.
 *   Live MCP eth_chainId validation was unavailable in this Codex session; local
 *   network calls were blocked by the sandbox.
 * - CoinGecko native id: coredaoorg (CoinGecko "Core" metadata, symbol CORE).
 * - DefiLlama chain slug: CORE, normalized by WCORE pricing to core.
 * - GeckoTerminal network slug: core.
 * - DexScreener slug: core.
 * - LLAMA_CHAIN_SLUG: not needed; normalized DefiLlama slug matches DEX_SLUG.
 *
 * After deploy: run BUILD_RPC_LOOKUP() from the Apps Script editor.
 */

var CHAIN_CORE_VERSION = "4.15.16";

var _CORE = ChainFactory.createEvmChain("CORE", {
 CACHE_VERSION: 1,
 RPC: {
 ENDPOINTS: [
 "https://rpc.coredao.org",
 "https://rpc.ankr.com/core",
 "https://1rpc.io/core",
 "https://core.drpc.org",
 "https://rpcar.coredao.org"
 ]
 },
 CHAIN: {
 NAME: "Core",
 CHAIN_ID: 1116,
 NATIVE_SYMBOL: "CORE",
 NATIVE_NAME: "Core",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:coredaoorg",
 NATIVE_GECKO_ID: "coredaoorg",
 DEX_SLUG: "core",
 GT_NETWORK: "core"
 },
 LLAMA_ID_MAP: {}
});

// Main functions
function GET_WALLET_ASSETS_CORE(a,r,t,f,g){return _CORE.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_CORE(a){return _CORE.getCachedWalletAssets(a);}
function CORE_REFRESH_STATUS(a,r,t,f,g){return _CORE.getRefreshStatus(a,r,t,f,g);}
function CORE_STATS(a,t){return _CORE.getStats(a,t);}

// Diagnostic functions
function DIAG_CORE_NATIVE_PRICE(){return _CORE.diag.nativePrice();}
function DIAG_CORE_RPC_STATUS(){return _CORE.diag.rpcHealth();}
