/**
 * ARC.gs - Arc Mainnet (chainId 5042)
 * ChainFactory pattern with explicit function declarations
 *
 * Arc (https://arc.network) est une L1 EVM "programmable money" : USDC est le
 * token natif (gas token), en 18 décimales.
 *
 * Particularités vérifiées (docs.arc.io, 2026-09-16) :
 *  - RPC mainnet : rpc.mainnet.arc.io / blockdaemon / drpc / quicknode
 *    (chaque endpoint répond eth_chainId = 0x13b2 = 5042).
 *  - USDC natif = 18 décimales (eth_getBalance). Le solde natif et le solde de
 *    l'interface ERC-20 (0x3600...0000, 6 décimales) sont le MEME solde :
 *    native_raw / 10^12 == erc20_raw. Les afficher tous les deux double le total.
 *  - EIP-7708 : les transferts natifs émettent un log Transfer depuis l'émetteur
 *    système 0xffff...fE (18 décimales), distinct du contrat ERC-20.
 *  - NATIVE_LLAMA_ID/GECKO = usd-coin : le fast-path stablecoin du pricing
 *    valorise USDC à ~1 EUR sans dépendre de DexScreener/GeckoTerminal (absents).
 *
 * KNOWN_TOKENS : EURC (stablecoin EUR) et USYC (fonds tokenisé), tokens distincts
 * à scanner dès la première passe (aucun cache préalable sur une chaîne neuve).
 *
 * FLAGS.EXCLUDE_CONTRACTS : empêche la découverte de compter comme tokens
 * distincts l'interface ERC-20 d'USDC (même solde que le natif) et l'émetteur
 * système EIP-7708 (aucune interface ERC-20).
 */

var _ARC = ChainFactory.createEvmChain("ARC", {
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://rpc.mainnet.arc.io",
      "https://rpc.blockdaemon.mainnet.arc.io",
      "https://rpc.drpc.mainnet.arc.io",
      "https://rpc.quicknode.mainnet.arc.io"
    ]
  },
  CHAIN: {
    NAME: "Arc",
    CHAIN_ID: 5042,
    NATIVE_SYMBOL: "USDC",
    NATIVE_NAME: "USDC",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:usd-coin",
    NATIVE_GECKO_ID: "usd-coin"
  },
  KNOWN_TOKENS: {
    "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1": { symbol: "EURC", name: "EURC", decimals: 6, isStable: true, peg: "EUR" },
    "0x8a5D989Bbb96929F689B0200f435f53dA42bF490": { symbol: "USYC", name: "USYC", decimals: 6, isStable: false }
  },
  FLAGS: {
    EXCLUDE_CONTRACTS: [
      "0x3600000000000000000000000000000000000000",
      "0xfffffffffffffffffffffffffffffffffffffffe"
    ]
  },
  LLAMA_ID_MAP: { "USDC":"coingecko:usd-coin", "EURC":"coingecko:euro-coin" }
});

// Main functions
function GET_WALLET_ASSETS_ARC(a,r,t,f,g){return _ARC.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_ARC(a){return _ARC.getCachedWalletAssets(a);}
function ARC_REFRESH_STATUS(a,r,t,f,g){return _ARC.getRefreshStatus(a,r,t,f,g);}
function ARC_STATS(a,t){return _ARC.getStats(a,t);}

// Diagnostic functions
function DIAG_ARC_TOKEN(w,t,r){return _ARC.diag.tokenBalance(w,t,r);}
function DIAG_ARC_COMPARE_RPCS(w,t){return _ARC.diag.compareRpcs(w,t);}
function DIAG_ARC_CHECK_ERC20(t){return _ARC.diag.checkErc20(t);}
function DIAG_ARC_RPC_HEALTH(){return _ARC.diag.rpcHealth();}
function DIAG_ARC_NATIVE_BALANCE(w){return _ARC.diag.nativeBalance(w);}
function DIAG_ARC_CACHE(w){return _ARC.diag.cacheInspect(w);}
function DIAG_ARC_CACHE_TOKEN(w,t){return _ARC.diag.cacheFindToken(w,t);}
function DIAG_ARC_CACHE_ASSETS(w){return _ARC.diag.cacheListAssets(w);}
function DIAG_ARC_TOKEN_PRICE(t){return _ARC.diag.tokenPrice(t);}
function DIAG_ARC_NATIVE_PRICE(){return _ARC.diag.nativePrice();}
function DIAG_ARC_WALLET(w){return _ARC.diag.walletFull(w);}
function DIAG_ARC_CACHE_STATS(){return _ARC.diag.cacheStats();}
function DIAG_ARC_CLEAR_CACHE(w,c){return _ARC.diag.clearCache(w,c);}
