/**
 * B3.gs - B3 (v4.16.82)
 * ChainFactory pattern with explicit function declarations
 */

var _B3 = ChainFactory.createEvmChain("B3", {
 CACHE_VERSION: 64,
 // v4.16.82 - Endpoint officiel `mainnet-rpc.b3.fun` RETIRE: 404 sur toutes
 // les methodes JSON-RPC (eth_chainId / net_version / web3_clientVersion /
 // eth_blockNumber), mesure le 2026-09-29. C'etait le SEUL endpoint configure
 // cote deploy -> rpcCount=1 et scan garanti en echec, car le consensus
 // `votes*2 > total` ne peut pas aboutir quand l'unique noeud ne repond pas.
 // Remplace par les deux endpoints thirdweb, mesures UP le 2026-09-29
 // (chainId 0x208d = 8333, meme hauteur de bloc sur les deux).
 // Les autres endpoints publics B3 (drpc, blockpi, extrnode, blast, pokt,
 // tenderly, publicnode, subquery, b3.fun) sont tous morts ou hors-chaine.
 RPC: {
 // v4.16.83 - Les endpoints thirdweb directs sont INUTILISABLES depuis nos
 // runtime : thirdweb throttle son palier gratuit PAR IP, et les IP de sortie
 // Railway sont des IP datacenter partagees entre tenants, donc structurellement
 // throttlees. Mesure le 2026-09-29, meme endpoint et meme instant :
 // 15/15 HTTP 200 depuis une IP residentielle, 0/6 en 429 via Railway sfo
 // comme via Railway EU. Changer de region ou d'IP ne peut donc pas aider.
 // On passe par un relais Cloudflare Workers (wcore-gsheet/railway-rpc-relay),
 // dont l'adresse de sortie n'est pas partagee avec les tenants Railway :
 // 20/20 HTTP 200, et le solde remonte a l'identique.
 // Le relais relaie chacun des deux amont -> le consensus `votes*2 > total`
 // reste fonctionnel sur deux voix independantes.
 ENDPOINTS: [
 "https://wcore-rpc-relay.straub-florian88-fs.workers.dev/b3-1",
 "https://wcore-rpc-relay.straub-florian88-fs.workers.dev/b3-2"
 ],
 // v4.16.82 - eth_getLogs renvoie -32005 "Log response size exceeded" des
 // 1200 blocs alors que la fenetre par defaut est de 5000. B3 produit
 // ~1 bloc/s, donc 5000 blocs = ~83 min de logs, ce qui depasse la limite.
 // Mesure le 2026-09-29 : 1000 blocs OK 5/5, 1200 KO, 1500+ KO.
 MAX_LOG_RANGE: 1000
 },
 CHAIN: {
 NAME: "B3",
 CHAIN_ID: 8333,
 NATIVE_SYMBOL: "ETH",
 NATIVE_NAME: "Ether",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:ethereum",
 NATIVE_GECKO_ID: "ethereum",
 DEX_SLUG: "b3",
 GT_NETWORK: "b3"
 },
 LLAMA_ID_MAP: { "DAI":"coingecko:dai", "ETH":"coingecko:ethereum", "USDC":"coingecko:usd-coin", "USDT":"coingecko:tether", "WBTC":"coingecko:wrapped-bitcoin", "WETH":"coingecko:weth" }
});

// Main functions
function GET_WALLET_ASSETS_B3(a,r,t,f,g){return _B3.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_B3(a){return _B3.getCachedWalletAssets(a);}
function B3_REFRESH_STATUS(a,r,t,f,g){return _B3.getRefreshStatus(a,r,t,f,g);}
function B3_STATS(a,t){return _B3.getStats(a,t);}

// Diagnostic functions
function DIAG_B3_TOKEN(w,t,r){return _B3.diag.tokenBalance(w,t,r);}
function DIAG_B3_COMPARE_RPCS(w,t){return _B3.diag.compareRpcs(w,t);}
function DIAG_B3_CHECK_ERC20(t){return _B3.diag.checkErc20(t);}
function DIAG_B3_RPC_HEALTH(){return _B3.diag.rpcHealth();}
function DIAG_B3_NATIVE_BALANCE(w){return _B3.diag.nativeBalance(w);}
function DIAG_B3_CACHE(w){return _B3.diag.cacheInspect(w);}
function DIAG_B3_CACHE_TOKEN(w,t){return _B3.diag.cacheFindToken(w,t);}
function DIAG_B3_CACHE_ASSETS(w){return _B3.diag.cacheListAssets(w);}
function DIAG_B3_TOKEN_PRICE(t){return _B3.diag.tokenPrice(t);}
function DIAG_B3_NATIVE_PRICE(){return _B3.diag.nativePrice();}
function DIAG_B3_WALLET(w){return _B3.diag.walletFull(w);}
function DIAG_B3_CACHE_STATS(){return _B3.diag.cacheStats();}
function DIAG_B3_CLEAR_CACHE(w,c){return _B3.diag.clearCache(w,c);}
