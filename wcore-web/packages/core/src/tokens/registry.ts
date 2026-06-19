import type { DiscoveredToken } from "./types.js";
import { makeToken as T } from "./types.js";

// Registry entries intentionally omit logoUrl: spothq cryptocurrency-icons SVGs
// render naturalWidth=0 in browsers for many major tokens (USDC, USDT, WETH,
// WBTC, ARB, stETH, …), leaving a blank circle in the UI. Returning undefined
// lets the logo resolver (resolveTokenLogoCachedOrFallback → CMC/TrustWallet by
// contract, then Blockscout/DexScreener prefetch) produce a reliable PNG instead.
// Kept as a no-op helper so existing LOGO("xxx") call sites stay valid.
const LOGO = (_symbol: string): string | undefined => undefined;

export const TOKEN_REGISTRY: Record<string, DiscoveredToken[]> = {
  BASE: [
    T("0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", "USDC", "USDC", 6, LOGO("usdc")),
    T("0xfde4c96c8593536e31f229ea8f37b2ada2699bb2", "USDT", "Tether USD", 6, LOGO("usdt")),
    T("0x4200000000000000000000000000000000000006", "WETH", "Wrapped Ether", 18, LOGO("eth")),
    T("0x0555E30da8f98308EdB960aa94C0Db47230d2B9c", "WBTC", "Wrapped Bitcoin", 8, LOGO("wbtc")),
    T("0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", "cbBTC", "Coinbase Wrapped BTC", 8, LOGO("btc")),
    T("0x3b86ad95859b6ab773f55f8d94b4b9d443ee931f", "SOLVBTC", "Solv Protocol SolvBTC", 18),
    T("0x50c5725949a6f0c72e6c4a641f24049a917db0cb", "DAI", "Dai Stablecoin", 18, LOGO("dai")),
    T("0x940181a94a35a4569e4529a3cdfb74e38fd98631", "AERO", "Aerodrome Finance", 18),
    T("0x768be13bab521ff9adee643c99617b40d9b3e76c", "BRETT", "Brett", 18),
    T("0x78a087d713be963bf307b18f2ff8122ef9a63ae9", "DEGEN", "Degen", 18),
    T("0xb4fde59a779991bfb6a52253b51947828b982be3", "PEPE", "Pepe", 18),
    T("0x28974AeC76DE8958361B49e8093865636cE71e1B", "GOO", "GOO", 18),
    T("0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42", "EURC", "EURC", 6),
    T("0x120edc8e391ba4c94cb98bb65d8856ae6ec1525f", "LOUDER", "LOUDER", 18),
    T("0xc2a5afd72f62b4ccac9d47f33c93974da570fa34", "DRINK", "Drinking To Get Drunk", 18),
    T("0x2da1f02de055cebe51c6f6526ed67ad0dc86f431", "IJN", "I Just Need (with Lyrah)", 18),
    T("0x78f11d82f93cf707d98e00870c9debf3601fa397", "JUST KEEP CLICKING", "JUST KEEP CLICKING", 18),
    T("0xfef2d7b013b88fec2bfe4d2fee0aeb719af73481", "ONCHAIN", "/onchain", 18),
    T("0x2da56acb9ea78330f947bd57c54119debda7af71", "MOG", "Mog Coin", 18),
    T("0x2081ab0d9ec9e4303234ab26d86b20b3367946ee", "EIGEN", "EigenCloud (prev. EigenLayer)", 18),
    T("0xc9d23ed2adb0f551369946bd377f8644ce1ca5c4", "HYPER", "Hyperlane", 18),
    T("0x1bc0c42215582d5a085795f4badbac3ff36d1bcb", "CLANKER", "tokenbot", 18),
    T("0x4f9fd6be4a90f2620860d680c0d4d5fb53d1a825", "AIXBT", "aixbt", 18),
    T("0x15De59489de5e7F240D72F787dC4a292b8199339", "RBF", "Robots.Farm", 18),
    T("0x8a9cf9ae6536127129727938cb1a6438273e4f94", "CREATE", "CREATE", 18),
    T("0x8da2a47f76d928a97a8f44498db25aa787198087", "SWEET", "Sweet Memories", 18),
    T("0xb58372a5bb18e10229e680d8bcc4201ca3c98301", "DAYS", "Chrystal - The Days", 18),
    T("0xed9bba84974a06e3886fa6228b27de43c93b4147", "TELL", "tell you straight", 18),
    T("0x4bac8fde86974e0e4fabb8f2c7af63b7c50db4ab", "BET", "Bet You Didn't Need", 18),
    T("0xb2f5ff8516b1f231d778d249e8a488667c66bfc0", "LIGHT", "Light It Up", 18),
    T("0x91de5ab6cbf9e3e10a317683535f5d2c53de0714", "UNTIL", "Until The Morning", 18),
    T("0x46777c76dbbe40fabb2aab99e33ce20058e76c59", "L3", "Layer3", 18),
    T("0x558070363d72cD4540f99a17bc91b6Cfb69969F6", "The Link", "The Link", 18),
    T("0x6499a5161eB59Ee0397313A08961C0003A110678", "TURTLE", "TURTLE", 18),
    T("0xb010CEd1020De442156E556118843fEF46A2F41E", "Hannah Montana", "Hannah Montana", 18),
    T("0x25008f56688c20A907662Ff567B2160ac284f3E3", "ALARIE", "ALARIE", 18),
    T("0xb84d447d57212378B3aab061D7E07f1E7CCc4549", "GROWUP", "GROWUP", 18),
    T("0x560B0307Ffe0eFe72Fe567f30FaacC927A03D5f3", "LARHOC", "Larhoc", 18),
    T("0xba72B8E600145e8D254bd565241a935B130F0112", "WZRD", "Wizard Token", 18),
    T("0xA973BC7Ff3a4B05A8fdE036b33a4431E3bc582C4", "Surprise", "Surprise", 18),
    T("0xBDEC3175c25088e3149c285Edf0Be70ea167c912", "JALICHI", "Jalinna & Chichi", 18),
    T("0x9f21cd392ebdb7c1c65e32ba9d1c7d541ec910c6", "MINT", "Mint Podcast", 18),
    T("0x0dfd116f3b94062de121836550559836efdfec4f", "BARAN", "Baran Bakery", 18),
    T("0x071e3fefda4c9cf55ca371a9da05862a79d9305a", "CUBE", "CUBE", 18),
    T("0x8b8c85c61d33a7f7df7661ea4e69a34502aafca3", "STRETCH", "STRETCH", 18),
    T("0xf37d0e4ea93aca7e0d3afa9df2a7774cf5bdd583", "JRA", "TwyneFamily$", 18),
    T("0x26095fbf2a0f8332408198e7a89b7d54fae19bb7", "ZAY", "Zay61", 18),
    T("0xCA884daB9aa33e7337cf353477A37F9bd0a3c686", "PRESSU", "pressure", 18),
    T("0xeA6b729919DB1ea6b046b722B1869EF746fa5d90", "FLIPIT", "Flip It", 18),
    T("0x64FCC3A02eeEba05Ef701b7eed066c6ebD5d4E51", "SPECTRA", "Spectra", 18),
    T("0x514D8E8099286a13486Ef6C525C120f51C239B52", "OBT", "Orbiter Finance", 18),
    T("0x1d008f50fb828ef9debbbeae1b71fffe929bf317", "CLANKFUN", "clank.fun", 18),
    T("0x70067c280f979da32a5df8efe9e62c65f86a2eef", "CTRL", "Take Control", 18),
    T("0xe5e92cfa14408202a343976ad11e743b492a04bb", "MESSY", "messy", 18),
    T("0x22af33fe49fd1fa80c7149773dde5890d3c76f3b", "BNKR", "BankrCoin", 18),
    T("0x14778860e937f509e651192a90589de711fb88a9", "CYBER", "CyberConnect", 18),
    T("0x98d0baa52b2d063e780de12f615f963fe8537553", "KAITO", "KAITO", 18),
    T("0xb3b32f9f8827d4634fe7d973fa1034ec9fddb3b3", "B3", "B3 (Base)", 18),
    T("0x48c6740bcf807d6c47c864faeea15ed4da3910ab", "$SPACE", "nounspace", 18),
    T("0x23418de10d422ad71c9d5713a2b8991a9c586443", "BGCI", "Bloomberg Galaxy Crypto Index", 18),
    T("0x919e43a2cce006710090e64bde9e01b38fd7f32f", "AIYP", "Agent YP by Virtuals", 18),
    T("0x474f4cb764df9da079d94052fed39625c147c12c", "BONSAI", "Bonsai Token", 18),
    T("0x8c9037d1ef5c6d1f6816278c7aaf5491d24cd527", "MOXIE", "Moxie", 18),
    T("0x48bf8fCd44e2977c8a9A744658431A8e6C0d866c", "sWETH", "Seamless WETH", 18),
    T("0x1111111111166b7fe7bd91427724b487980afc69", "ZORA", "Zora", 18),
    T("0xba12bc7b210e61e5d3110b997a63ea216e0e18f7", "C", "Chainbase", 18),
    T("0x5b2193fDc451C1f847bE09CA9d13A4Bf60f8c86B", "UP", "Superform", 18),
    T("0x50d7A818E5e339ebE13b17E130B5B608fAC354DC", "VISION", "VISION ai by Virtuals", 18),
    T("0xbf63463eE6F105EDC5AdeAa28A0fE8c297aD0b07", "SPACE", "Nounspace (v2)", 18),
    T("0x6dCC9dba9b9bd0f4aA486B939dF3a7D93d030B07", "BSNOW", "Base Snow", 18),
    T("0xaE38DADD58b96926bF521162Ebe948B132e29B07", "ZECM", "Zcash Meme", 18),
    T("0x2632CA8e93Ad5ea63BEb1A480d4b73589993db07", "WC", "Warplet Community", 18),
  ],

  ETHEREUM: [
    T("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", "USDC", "USD Coin", 6, LOGO("usdc")),
    T("0xdac17f958d2ee523a2206206994597c13d831ec7", "USDT", "Tether USD", 6, LOGO("usdt")),
    T("0x6b175474e89094c44da98b954eedeac495271d0f", "DAI", "Dai Stablecoin", 18, LOGO("dai")),
    T("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", "WETH", "Wrapped Ether", 18, LOGO("eth")),
    T("0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", "WBTC", "Wrapped BTC", 8, LOGO("wbtc")),
    T("0xcf5104d094e3864cfcbda43b82e1cefd26a016eb", "H", "Humanity", 18),
    T("0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0", "MATIC", "Polygon", 18, LOGO("matic")),
    T("0x514910771af9ca656af840dff83e8264ecf986ca", "LINK", "Chainlink", 18, LOGO("link")),
    T("0x1f9840a85d5af5bf1d1762f925bdaddc4201f984", "UNI", "Uniswap", 18, LOGO("uni")),
    T("0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2", "MKR", "Maker", 18, LOGO("mkr")),
    T("0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9", "AAVE", "Aave", 18, LOGO("aave")),
    T("0xae7ab96520de3a18e5e111b5eaab095312d7fe84", "stETH", "Lido Staked ETH", 18, LOGO("steth")),
    T("0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f", "SNX", "Synthetix", 18, LOGO("snx")),
    T("0xd533a949740bb3306d119cc777fa900ba034cd52", "CRV", "Curve DAO", 18, LOGO("crv")),
  ],

  ARBITRUM_ONE: [
    T("0xaf88d065e77c8cc2239327c5edb3a432268e5831", "USDC", "USD Coin", 6, LOGO("usdc")),
    T("0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9", "USDT", "Tether USD", 6, LOGO("usdt")),
    T("0x82af49447d8a07e3bd95bd0d56f35241523fbab1", "WETH", "Wrapped Ether", 18, LOGO("eth")),
    T("0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f", "WBTC", "Wrapped BTC", 8, LOGO("wbtc")),
    T("0x912ce59144191c1204e64559fe8253a0e49e6548", "ARB", "Arbitrum", 18, LOGO("arb")),
  ],

  OPTIMISM: [
    T("0x0b2c639c533813f4aa9d7837caf62653d097ff85", "USDC", "USD Coin", 6, LOGO("usdc")),
    T("0x4200000000000000000000000000000000000006", "WETH", "Wrapped Ether", 18, LOGO("eth")),
    T("0x68f180fcce6836688e9084f035309e29bf0a2095", "WBTC", "Wrapped BTC", 8, LOGO("wbtc")),
    T("0x4200000000000000000000000000000000000042", "OP", "Optimism", 18, LOGO("op")),
  ],

  POLYGON: [
    T("0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", "USDC", "USD Coin", 6, LOGO("usdc")),
    T("0xc2132d05d31c914a87c6611c10748aeb04b58e8f", "USDT", "Tether USD", 6, LOGO("usdt")),
    T("0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", "WETH", "Wrapped Ether", 18, LOGO("eth")),
    T("0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6", "WBTC", "Wrapped BTC", 8, LOGO("wbtc")),
    T("0x0000000000000000000000000000000000001010", "POL", "Polygon", 18, LOGO("matic")),
  ],

  BSC: [
    T("0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", "USDC", "USD Coin", 18, LOGO("usdc")),
    T("0x55d398326f99059ff775485246999027b3197955", "USDT", "Tether USD", 18, LOGO("usdt")),
    T("0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c", "WBNB", "Wrapped BNB", 18, LOGO("bnb")),
    T("0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c", "BTCB", "Bitcoin BEP2", 18, LOGO("btc")),
    T("0x570a5d26f7765ecb712c0924e4de545b89fd43df", "SOL", "SOLANA", 18),
    T("0x9d1a7a3191102e9f900faa10540837ba84dcbae7", "EURI", "EURITE", 18),
    T("0xda7ad9dea9397cffddae2f8a052b82f1484252b3", "RIVER", "River", 18),
    T("0x740df024ce73f589acd5e8756b377ef8c6558bab", "HLG", "Holograph Utility Token", 18),
    T("0x4ad663403df2f0e7987bc9c74561687472e1611c", "FROG", "Frodo the virtual samurai", 18),
  ],

  AVALANCHE: [
    T("0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e", "USDC", "USD Coin", 6, LOGO("usdc")),
    T("0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7", "WAVAX", "Wrapped AVAX", 18, LOGO("avax")),
    T("0x49d5c2bdffac6ce2bfdb6640f4f80f226bc10bab", "WETH.e", "Wrapped Ether", 18, LOGO("eth")),
  ],

  ZERO: [
    T("0xf1f9e08a0818594fde4713ae0db1e46672ca960e", "WBTC", "Wrapped BTC", 8, LOGO("wbtc")),
  ],

  GNOSIS: [
    T("0x0AA1e96D2a46Ec6beB2923dE1E61Addf5F5f1dce", "REG", "RealToken Ecosystem Governance", 18),
    T("0x6A023CCd1ff6F2045C3309768eAd9E68F978f6e1", "WETH", "Gnosis xDai Bridged WETH", 18, LOGO("eth")),
    T("0x7af2C0df2789C2620794AEb24b3019Fc350C369D", "REALTOKEN-PA-SE-VERVANA-T1v2-PLAYA-VENAO-LS", "RealToken Vervana T1v2 Playa Venao", 18),
    T("0xD358021Be065bDA24fd1B713b4f9377696b04A3B", "REALTOKEN-S-11222-E-7-MILE-RD-DETROIT-MI", "RealToken 11222 E 7 Mile Rd Detroit MI", 18),
    T("0xa235A1208a59cEe3380FA627056e63e612774949", "REALTOKEN-SL-11300-E-7-MILE-RD-DETROIT-MI", "RealToken LOAN 11300 E 7 Mile Detroit MI", 18),
    T("0x2097ecfF6EF76B8DF351268e935532faB0b753aa", "REALTOKEN-S-11766-COLLEGE-ST-DETROIT-MI", "RealToken 11766 College St Detroit MI", 18),
    T("0xebbe401D2a362F01A08f03c8a45813322b1D0596", "REALTOKEN-S-11076-ST-PATRICK-ST-DETROIT-MI", "RealToken 11076 St Patrick St Detroit MI", 18),
    T("0x3b865aeb780458AF48D4ca29CBFfEA4408cAB6D3", "REALTOKEN-PA-SEL-PH-EMPIRE-RESIDENCES-PANAMA-CITY-PAP", "RealToken Empire Residences Panama City", 18),
    T("0x5095931519f2410B6384E4DD21B10B8E6D124a0e", "REALTOKEN-PA-SE-MOVA200-18D-PANAMA-CITY-PAP", "RealToken MOVA200 18D Panama City", 18),
  ],
};

export function normalizeTokenChainKey(chainKey: string): string {
  const key = String(chainKey || "").trim().toUpperCase();
  if (key === "ETH" || key === "ETHEREUM") return "ETHEREUM";
  return key;
}
