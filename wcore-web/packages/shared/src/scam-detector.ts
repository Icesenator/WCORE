// Single source of truth for scam detection — used by apps/api (server-side aggregation)
// AND apps/web (UI flagging). Both must agree, otherwise the badge shown to the user
// disagrees with the totalEur computed by the API. Bump SCAM_RULES_VERSION whenever
// rules change so consumers can invalidate their cached results.

export const SCAM_RULES_VERSION = 33;

const SCAM_PATTERNS = [
  /claim/i, /airdrop/i, /reward/i, /gift/i, /giveaway/i,
  /^https?:\/\//i, /visit/i, /bonus/i, /free/i,
  /scam/i, /hack/i, /exploit/i,
];

const TLD_PATTERNS = [".com", ".io", ".net", ".org"];
const KNOWN_DOMAINS = new Set([
  "uniswap", "aave", "compound", "curve", "balancer", "sushi", "pancakeswap",
  "1inch", "dydx", "lido", "rocketpool", "makerdao", "arbitrum", "optimism",
  "base", "polygon", "zksync", "starknet", "chainlink", "thegraph", "ens",
  "gitcoin", "snapshot", "layerzero", "wormhole", "axelar", "connext",
  "hop", "across", "stargate", "synapse", "celer", "multichain",
]);

function isKnownDomain(name: string): boolean {
  const lower = name.toLowerCase();
  for (const d of KNOWN_DOMAINS) { if (lower.includes(d)) return true; }
  return false;
}

function hasSuspiciousTld(name: string): boolean {
  const lower = name.toLowerCase();
  return TLD_PATTERNS.some(tld => lower.includes(tld)) && !isKnownDomain(name);
}

const IMPERSONATION_PATTERNS: Array<[RegExp, string]> = [
  [/space\s*x/i, "SpaceX"],
  [/nasa/i, "NASA"],
  [/tether/i, "Tether"],
  [/tesla/i, "Tesla"],
  [/apple/i, "Apple"],
  [/microsoft/i, "Microsoft"],
  [/google/i, "Google"],
  [/amazon/i, "Amazon"],
  [/facebook|meta/i, "Meta"],
  [/paypal/i, "PayPal"],
  [/chat\s*gpt|openai/i, "OpenAI"],
  [/hyperliquid/i, "Hyperliquid"],
];

const _KNOWN_TOKENS = new Set([
  "ETH", "WETH", "USDC", "USDT", "DAI", "WBTC", "SOL", "BNB", "WBNB",
  "AVAX", "WAVAX", "MATIC", "WMATIC", "POL", "ARB", "OP", "LINK",
  "UNI", "AAVE", "CRV", "SNX", "COMP", "MKR", "LDO", "STETH", "RETH",
  "ATOM", "OSMO", "INJ", "SEI", "TIA", "DOT", "NEAR", "FLOW", "SUI", "APT",
  "PEPE", "SHIB", "FLOKI", "DOGE", "BONK", "WIF", "WLD", "WORLDCOIN",
  "SOLVBTC", "CBBTC", "BTCB", "XGRAIL", "ARUSDC", "RSTONE", "LSTONE", "RE7USDC",
]);

export interface GoPlusSignal {
  available: boolean;
  isHoneypot?: boolean;
  canTakeBackOwnership?: boolean;
  isBlacklisted?: boolean;
  slippageModifiable?: boolean;
  ownerPercent?: number;
  isOpenSource?: boolean;
  isInDex?: boolean;
}

export interface GtSignal {
  available: boolean;
  gtScore?: number; // 0-100 GT Security Score (higher = safer)
  gtScoreDetails?: { pool?: number; transaction?: number; creation?: number; info?: number; holders?: number };
  gtVerified?: boolean;
  holderCount?: number;
  holderDistribution?: { top_10?: number; "11_30"?: number; "31_50"?: number; rest?: number };
  isHoneypot?: boolean;
  categories?: string[];
}

export interface ScamEnrichment {
  goPlus?: GoPlusSignal;
  gt?: GtSignal;
  dexLiquidityUsd?: number;
  dexVolume24h?: number;
  dexBuys24h?: number;
}

// Major token tickers that scammers impersonate by reusing the ticker with an
// unrelated name (e.g. "ZK" + "zkanalyst"). Value is the set of official brand
// strings the name must contain to be considered legitimate.
// unrelated name (e.g. "ZK" + "zkanalyst"). Value is the set of official brand
// strings the name must contain to be considered legitimate.
const MAJOR_TOKEN_BRANDS: Record<string, string[]> = {
  ZK: ["zk", "zksync", "zeta"],
  ARB: ["arb", "arbitrum"],
  OP: ["optimism", "op "],
  WIF: ["wif", "dogwifhat"],
  STETH: ["steth", "staked ether", "lido"],
  PEPE: ["pepe"],
  SHIB: ["shib", "shiba"],
  BONK: ["bonk"],
  FLOKI: ["floki", "floki"],
};

// Permanently blocked contracts — known scams that bypass heuristic detection
const _BLOCKED_CONTRACTS = new Set([
  "0x94b5bd0c97f8a7b6cf0d2cb312069212f120b864", // Scroll: scam token
  "0x27777ec2be4258d32134271f1d5d7d1d896aa86d", // BASE: scam token
  "0x59828f30a4ad35d1d0b85c734d48ac6de04e314c", // BASE: scam token
  "0x260b9ac75753fbd67f2ea6d10724dd89a52c1913", // BASE: scam token
  "0xd546040f08e6b3a4f1d21683b9bd9935d73bd9e9", // BASE: stkAVNT scam (fake price 4308€)
  "0x290b3b9f7661a6834135be44c3475aef987fa3b2", // Ethereum: Trump Doge impersonator
  "0x05cd8430676f04b63b33c1ece124818858edfc4f", // Ethereum: Royal Doge impersonator
  "0x5497b1ab5bb59b194e25764ea0b61871b122a43f", // Ethereum: Trump Shib impersonator
  // 2026-06-29 — Ethos - Base airdrop batch (4 contracts, generic + meme names)
  "0xf34f722fc7617300ad37f499d7a36780d81daa29", // BASE: BASED (generic Base meme impersonation)
  "0x208e0664114880b76471fec59fdd1bead62620d3", // BASE: IMOUT (meme/joke airdrop dust)
  "0x0d4d191a72c1d8d6703d6d3ed1a532b67d5a5f14", // BASE: SEC "Secury Wallet" (typo-phishing → drain on approve)
  "0xf21dbea34ca178d424a6f2184b094f279de915ff", // BASE: SHIT (joke/meme airdrop dust)
  // 2026-06-29 — World Chain LuckyCoin airdrop scam
  "0x3a27edadf19d362a60b0b5a7bd3e8c48273c5e2e", // World Chain: LUCKY "LuckyCoin" (generic airdrop on new chain)
  // 2026-06-29 — World Chain XDogeCoin airdrop scam
  "0x37cff256e4aed256493060669a04b59d87d509d1", // World Chain: XDoge "XDogeCoin" (Dogecoin variant, generic airdrop)
  // 2026-06-30 — UniSwap - Base dust/spam positions confirmed by user
  "0x30eba82795fe0f7e5b1fc51a1109ffe47c941ba3", // BASE: AGI "AGI Holdings"
  "0x3ec2156d4c0a9cbdab4a016633b7bcf6a8d68ea2", // BASE: DRB "DebtReliefBot"
  "0x1b9371e474aac1337b327ff8c30c1036dcecb7b6", // BASE: dick
  "0x9f86db9fc6f7c9408e8fda3ff8ce4e78ac7a6b07", // BASE: CLAWD "clawd.atg.eth"
  "0x06a4665fd49c1c959e982a9ed22ea83e9f6be7df", // BASE: BALDYS "Balding Budys"
  "0x1626691e26c985f98fbc22193f24b719d3ae9491", // BASE: singularity-coin "singularity-engine"
  "0x3142b47221a8e9418e161bf5f747d65459f5535e", // BASE: TIMES "POLYMARKET TIMES"
  "0x69ca8b02d2aa27619e02fbf6de1b1502da5f147a", // BASE: ZAMRUD fake-price spam
  // 2026-08-10 — zkSync Era: ZK-ticker impersonator ("zkanalyst", 1-unit airdrop)
  "0x2937489455711b275e854fb8e2238d0b7cc5fa7b", // zkSync Era: ZK "zkanalyst" impersonator
  // 2026-08-10 — World Chain phantom-value airdrop batch (generic noun+Coin,
  // fake $11-22 unit price, ~1M holders, $0-volume pools)
  "0xffb41fbf0935e16e1cbf25a4c8e05e437c1c6f95", // World Chain: AnimeCoin phantom-price scam
  "0xc6f44893a558d9ae0576a2bb6bfa9c1c3f313815", // World Chain: RamenCoin phantom-price scam
  "0x5ef30ba3a27b92399a46ee86d2b810ee7e9d8abc", // World Chain: CoffeeCoin phantom-price scam
  "0x51c707920d1ee9b308b5754675a0bf856cd25eea", // World Chain: Coffee2Coin phantom-price scam (variant)
  // 2026-08-21 — Ledger - Ethereum dusting campaign (verified on Etherscan:
  // AICC + PVC share the same proxy implementation 0xACaB8790..., holders > supply,
  // zero DEX liquidity, 1-unit airdrops)
  "0x66a3c2fa3e467aa586e90912f977e648589cabaf", // Ethereum: AICC "AI Chain Coin" dusting proxy scam
  "0x514b9e5467b9eb811519e316263c9099eae546ca", // Ethereum: PVC "Privacy Coin" dusting proxy scam
  "0x00e2b6d170740c15bf9fb01d0b6e77c0d4510e32", // Ethereum: DOG "Royal Dog" unverified dusting scam
  "0x53fdca91fd33b9131b5ceade42a3edbd9b38edff", // Ethereum: CAT "Royal Cat" dusting scam
  "0xcdb9f907bd8828be9643b39cd4638d362fd6e9c4", // Ethereum: KEKIUS "Volt Kekius" dusting scam
  "0x37dabad8ac496148596196fe9adeb54ee3111c78", // Ethereum: DOG "Little Dog" dusting scam
  "0x83819bf7e906bcf57e9f5b20453a2eff43f3845c", // Ethereum: PORT "DePORT" dusting scam
  "0x496a35a65c00b4aed125d19df3871e6b4cb05188", // Ethereum: REKT "Trump Rekt" impersonator dusting scam
  "0x4921bb864de2e557939b074be20ff4b98723b86b", // Ethereum: WAR "Trump Wars" impersonator dusting scam
  "0x3e391e5cb8ea766c93134faf486e6393158032c2", // Ethereum: BEAR "Brave Bear" dusting scam
  "0x9d24364b97270961b2948734afe8d58832efd43a", // Ethereum: FAM "yefam.finance" dusting scam
  "0x108a908a51fe79f84584d2da02c38ca588bc442d", // Ethereum: DOG "Good Dog" unverified dusting scam (same campaign)
  // 2026-08-21 — Ethos - Base dusting (LokiCoin, unverified, 9 decimals,
  // 173k holders vs zero DEX liquidity, signature-gated admin + blacklist + cooldown in bytecode)
  "0xc970c50bee2ffd114f5d65ee18520b66da5f62c1", // BASE: LOKI "LokiCoin" dusting scam
  // 2026-08-21 — Ledger - Ethereum honeypot dusting (Bad Dad, unverified; bytecode:
  // "Blacklisted addresses cannot sell tokens", "Only marketing wallet can airdrop",
  // phantom balances, 100% max tax, owner mint/burn, ETH/token recovery)
  "0x6dc629b667a3431c95934a7c530872786d75581d", // Ethereum: DAD "Bad Dad" honeypot dusting scam
  // 2026-08-22 — YOM (Ethereum) impersonation du vrai YOM (Avalanche), même template que LokiCoin
  // Phantom-price pool $194.20/$0.50, airdrop 9 décimales, blacklist anti-sell + cooldown sig-gaté, bytecode identique.
  "0x12fbd83663161c7a3e3acff67507072da2cf57a2", // Ethereum: YOM "YOM" impersonation dusting scam
  // 2026-08-23 — CTR "Citrea" (Ethereum) impersonation du L2 Citrea (pas de token ERC-20 officiel) ;
  // template Vyper généré en masse (jumeau 0xE6D352e9...), fonctions calculatrice absurdes,
  // hook externe owner-control à chaque transfer, zéro paire DEX, 5 930 holders dusting
  "0x4623aa7087a1004d12afa717d7bf5e77981174f7", // Ethereum: CTR "Citrea" impersonation dusting scam
  // 2026-08-25 — Ethos - Base dusting (SKYAI, unverified honeypot : honeypot.is
  // critical "high_fail_rate" — users cannot sell, buy simulation revert
  // "HP: BUY_FAILED", liquidité ~$0.05 Uniswap V2 WETH-SKYAI, 230k holders,
  // BaseScan réputation UNKNOWN, DexScreener 0 paire)
  "0xce014b9c1ac69e01792e9db7393075146a1d4055", // BASE: SKYAI honeypot dusting scam
]);

const _TRUSTED_DEFI_CONTRACTS = new Set([
  "0xf368f535e329c6d08dff0d4b2da961c4e7f3fcaf", // Optimism: WCT claimable
  "0x521b4c065bbdbe3e20b3727340730936912dfa46", // Optimism: WCT stake
  "0xe36a30d249f7761327fd973001a32010b521b6fd", // Optimism: Compound V3 cWETHv3 Comet
  "0x87eee96d50fb761ad85b1c982d28a042169d61b1", // Optimism: Compound V3 wrsETH collateral
]);

// Admin overrides — tokens explicitly marked as scam/legit by platform owner
const _adminBlockedContracts = new Set<string>();
const _adminApprovedContracts = new Set<string>();

export function addAdminApproved(symbol: string, contract?: string) {
  if (contract) _adminApprovedContracts.add(contract.toLowerCase());
  _adminBlockedContracts.delete(contract?.toLowerCase() ?? "");
}

export function addAdminBlocked(symbol: string, contract?: string) {
  if (contract) _adminBlockedContracts.add(contract.toLowerCase());
  _adminApprovedContracts.delete(contract?.toLowerCase() ?? "");
}

function isKnownToken(symbol: string, contract?: string): boolean {
  const s = symbol.toUpperCase();
  if (contract && _adminApprovedContracts.has(contract.toLowerCase())) return true;
  if (contract && _adminBlockedContracts.has(contract.toLowerCase())) return false;
  return _KNOWN_TOKENS.has(s);
}

export function isWhitelistedToken(symbol: string, contract?: string): boolean {
  if (contract && _adminApprovedContracts.has(contract.toLowerCase())) return true;
  return isKnownToken(symbol, contract);
}

export type ScamLevel = "clean" | "warning" | "suspicious" | "scam";

export interface ScamCheck {
  isSuspicious: boolean;
  level: ScamLevel;
  score: number;
  reasons: string[];
}

interface Signal {
  reason: string;
  weight: number;
}

// Score thresholds: 0 = clean, 1 = warning, 2-3 = suspicious, 4+ = scam
function assess(score: number): ScamLevel {
  if (score >= 4) return "scam";
  if (score >= 2) return "suspicious";
  if (score >= 1) return "warning";
  return "clean";
}

export function detectScam(symbol: string, name: string, balance: number, priceEur: number | null, contract?: string, enrichment?: ScamEnrichment): ScamCheck {
  if (contract && _adminBlockedContracts.has(contract.toLowerCase())) {
    return { isSuspicious: true, level: "scam", score: 10, reasons: ["admin blocked contract"] };
  }
  if (contract && _adminApprovedContracts.has(contract.toLowerCase())) {
    return { isSuspicious: false, level: "clean", score: 0, reasons: [] };
  }
  if (contract && _BLOCKED_CONTRACTS.has(contract.toLowerCase())) {
    return { isSuspicious: true, level: "scam", score: 10, reasons: ["blocked contract"] };
  }
  if (contract && _TRUSTED_DEFI_CONTRACTS.has(contract.toLowerCase())) {
    return { isSuspicious: false, level: "clean", score: 0, reasons: [] };
  }

  const signals: Signal[] = [];

  // Cosmos IBC/factory tokens are never scam — they're native cross-chain transfers
  if (contract && (contract.startsWith("ibc/") || contract.startsWith("factory/"))) {
    return { isSuspicious: false, level: "clean", score: 0, reasons: [] };
  }
  const s = symbol.trim();
  const n = name.trim();

  // RealToken (Gnosis) property tokens have intentionally long symbols (40-60 chars)
  // and names containing "RealToken". They are priced by api.realtoken.community.
  if (s.startsWith("REALTOKEN-") || n.startsWith("RealToken ")) {
    return { isSuspicious: false, level: "clean", score: 0, reasons: [] };
  }

  // 1. Name matches scam keywords (strong)
  for (const pat of SCAM_PATTERNS) {
    if (pat.test(n)) {
      signals.push({ reason: `scam keyword in name: "${n}"`, weight: 3 });
      break;
    }
  }

  // 1b. TLD in name (moderate if unknown domain)
  if (hasSuspiciousTld(n)) {
    signals.push({ reason: `unknown domain in name: "${n}"`, weight: 2 });
  }

  // 2. Impersonating a known token or brand (strong)
  for (const [pat, brand] of IMPERSONATION_PATTERNS) {
    if (pat.test(n) && !isKnownToken(s.toUpperCase(), contract)) {
      signals.push({ reason: `impersonates ${brand}`, weight: 3 });
      break;
    }
  }

  // 3. Suspicious balance + no price (moderate)
  if (priceEur == null && balance > 1_000_000) {
    signals.push({ reason: `massive supply (${formatBig(balance)}), no price`, weight: 2 });
  }

  // 4. Zero-value dust with huge balance (weak)
  if (priceEur != null && priceEur < 0.000001 && balance > 1_000_000) {
    signals.push({ reason: `dust token: ${formatBig(balance)} units, <$0.000001`, weight: 1 });
  }

  // 5. Very long symbol or name (weak)
  if (symbol.length > 20 || name.length > 50) {
    signals.push({ reason: `unusual length (sym=${symbol.length}, name=${name.length})`, weight: 1 });
  }

  // 6. Unknown token with suspiciously high value (moderate)
  if (priceEur != null && priceEur > 0 && balance * priceEur > 10 && !isKnownToken(s.toUpperCase(), contract)) {
    const genericPatterns = /AI|coin|token|protocol|finance|swap|chain|network|defi|web3/i;
    if (genericPatterns.test(n) && n.split(" ").length <= 3) {
      signals.push({ reason: `generic name + high value (${(balance * priceEur).toFixed(0)} €)`, weight: 2 });
    }
  }

  // 7. Fake high-value game token from name (strong when value is material)
  if (/games?/i.test(n) && balance > 100_000 && !isKnownToken(s.toUpperCase(), contract)) {
    const value = priceEur != null ? balance * priceEur : 0;
    signals.push({ reason: `game token with inflated supply`, weight: 1 });
    if (value > 1_000) {
      signals.push({ reason: `inflated unknown game token value (${value.toFixed(0)} €)`, weight: 3 });
    }
  }

  // 8. No-price token with suspicious generic name (moderate)
  if (priceEur == null && !isKnownToken(s.toUpperCase(), contract)) {
    const badPatterns = /coin|token|swap|finance|protocol|chain|network|defi|web3|ai|crypto|bridge|dao|pad|game|meme/i;
    if (badPatterns.test(n) && balance > 0) {
      signals.push({ reason: `generic name, no price: "${n}"`, weight: 2 });
    }
  }

  // 9. Unknown token with near-zero value despite non-zero price (fake pool).
  // Weak alone: legitimate micro-cap holdings (e.g. 0.57 CWIF) are worth << €0.01
  // but still have real DEX identity. Needs another signal to mark suspicious.
  if (priceEur != null && priceEur > 0 && !isKnownToken(s.toUpperCase(), contract)) {
    const value = balance * priceEur;
    if (value > 0 && value < 0.01) {
      signals.push({ reason: `dust amount (${value.toExponential(1)} EUR) at price ${priceEur.toFixed(2)} — likely fake`, weight: 1 });
    }
  }

  // 10. Unknown token with absurdly high total value (>1000 EUR) and massive supply.
  // Exclude when GT score >= 50 (GT considers the project borderline or better) —
  // protects legitimate micro-caps like XCLAW (score 53.1, real $149k liquidity).
  if (priceEur != null && priceEur > 0 && !isKnownToken(s.toUpperCase(), contract)) {
    const value = balance * priceEur;
    if (value > 1000 && balance > 100_000) {
      const gtOk = typeof enrichment?.gt?.gtScore === "number" && enrichment.gt.gtScore >= 50;
      if (!gtOk) {
        signals.push({ reason: `unknown token with inflated value: ${value.toFixed(0)} EUR from ${formatBig(balance)} tokens`, weight: 3 });
      }
    }
  }

  // 11. Typo-phishing names: deliberate misspellings of security/wallet terms
  // used to bypass naive filters while looking legitimate (e.g. "Secury" -> "Secure",
  // "Saef" -> "Safe", "Valut" -> "Vault", "Wallat" -> "Wallet").
  // These are the canonical typo-phishing patterns observed on Base / World Chain airdrops.
  if (!isKnownToken(s.toUpperCase(), contract)) {
    const typoPattern = /\b(secury|saef|safty|securty|valut|wallat|wallett|offical|0fficial)\b/i;
    if (typoPattern.test(n) || typoPattern.test(s)) {
      signals.push({ reason: `typo-phishing name (sounds like "secure/safe/wallet/official" but misspelled)`, weight: 4 });
    }
  }

  // 12. Ultra-generic chain name impersonation on Base / new L2s.
  // "Based", "BaseCoin", "Base Token" are the canonical names used by scammers to
  // impersonate the official Base chain meme. Symbol length <= 6 AND name is just
  // the chain name with optional "Coin/Token" suffix -> strong scam signal.
  if (!isKnownToken(s.toUpperCase(), contract)) {
    const genericBase = /^(Based|BaseCoin|Base Token|BaseToken|World Coin|WorldCoin)$/i;
    if (genericBase.test(s) || genericBase.test(n)) {
      signals.push({ reason: `ultra-generic chain impersonation (${s} / ${n})`, weight: 4 });
    }
  }

  // 13. Major-ticker impersonation: token carries the ticker of a well-known
  // asset but its name shares no official brand. Scammers airdrop 1 unit of
  // e.g. "ZK" named "zkanalyst" to look like the real ZKsync token.
  // Safe by design: the name must contain none of the brand strings, so real
  // tokens (WIF/"dogwifhat", STETH/"Lido Staked Ether", ARB/"Arbitrum") pass.
  // Admin-approved contracts always short-circuit above; this rule intentionally
  // applies even to _KNOWN_TOKENS tickers because impersonation targets them.
  const brands = MAJOR_TOKEN_BRANDS[s.toUpperCase()];
  if (brands) {
    const lowerName = n.toLowerCase();
    const hasBrand = brands.some((b) => lowerName.includes(b));
    if (!hasBrand) {
      signals.push({ reason: `major ticker ${s} impersonation: name "${n}" is unrelated`, weight: 3 });
    }
  }

  // 14. Phantom-value airdrop: token named "<everyday noun>Coin/Token" with an
  // implausibly high unit price and no brand identity. AnimeCoin/RamenCoin/
  // CoffeeCoin on World Chain: ~1M holders, a $0-volume pool, and a fake
  // $11-22 unit price produce a phantom €100-600 holding.
  // Safe by design: excluded when the name shares the ticker or a real brand
  // (LINK "ChainLink Token", UNI "Uniswap", AAVE "Aave", COMP "Compound").
  if (priceEur != null && priceEur > 0 && !isKnownToken(s.toUpperCase(), contract)) {
    const lowerName = n.toLowerCase();
    const genericNounCoin = /^[a-z]+(coin|token)$/i.test(lowerName.replace(/[^a-z]/g, ""));
    const value = balance * priceEur;
    if (genericNounCoin && value > 100 && priceEur > 1) {
      const knownBrand = /chainlink|uniswap|compound|maker|curve|aave|pepe|shiba|bonk|dogecoin|dai\b|lido|staked ether|wrapped|worldcoin|world\s*coin|bitcoin|ethereum|solana|cardano|polkadot|chainlink|arbitrum|optimism/i.test(lowerName);
      if (!knownBrand) {
        signals.push({ reason: `generic <noun>Coin with phantom value (${value.toFixed(0)} EUR at ${priceEur.toFixed(2)} EUR/unit): "${n}"`, weight: 4 });
      }
    }
  }

  // 14b. Vanity factory address: contract address ends with repeated digits
  // (4444, 3333, 5555, etc.) — hallmark of mass-deployed scam factories on
  // BSC/Base/World Chain. Weight 3 alone; not absolute (legit tokens can have
  // vanity addresses by chance) so the old zero-enrichment guard was removed
  // and the rule requires no enrichment data. Short-circuit: excluded when
  // enrichment data shows real market activity (liq > $50k).
  if (contract && !isKnownToken(s.toUpperCase(), contract)) {
    const body = contract.toLowerCase().replace(/^0x/, "");
    const tailRun = body.match(/([0-9])\1{3,}$/);
    // Placeholder addresses (0x1111…1111) carry no entropy and are never real
    // deployments — a factory vanity suffix sits at the end of a normal address.
    const isVanity = Boolean(tailRun) && new Set(body).size >= 6 && (tailRun?.[0].length ?? 0) <= 8;
    if (isVanity) {
      const hasRealMarket = typeof enrichment?.dexLiquidityUsd === "number" && enrichment.dexLiquidityUsd > 50_000;
      if (!hasRealMarket) {
        signals.push({ reason: `vanity factory address (${contract.slice(-4)})`, weight: 3 });
      }
    }
  }

  // 14c. Non-latin ticker/name with no price: dust airdrop using CJK/emoji
  // names that bypass Anglo-centric generic-name heuristics.
  if (priceEur == null && !isKnownToken(s.toUpperCase(), contract)) {
    const nonLatin = /[^\x00-\x7F]/;
    if (nonLatin.test(s) || nonLatin.test(n)) {
      signals.push({ reason: `non-latin ticker/name ("${s}"/"${n}") with no price`, weight: 1 });
    }
  }

  // 15. Screen pool (cascade DexScreener): liquidity/volume are theatrical.
  // Two tiers, both requiring enrichment data, to protect legit micro-caps:
  // - dead screen pool (weight 4): liquidity < $100 with zero buys in 24h is
  //   incompatible with any real market regardless of unit price. Catches
  //   phantom-price dust (SKYAI: $0.05 pool at ~1e-7 EUR/unit) that the old
  //   price-floor rule ignored.
  // - theatrical high-price pool (weight 2): liq < $10k, vol < $500, 0 buys,
  //   price > EUR 1 (AnimeCoin/RamenCoin-style fake unit price).
  if (!isKnownToken(s.toUpperCase(), contract) && typeof enrichment?.dexLiquidityUsd === "number") {
    const liq = enrichment.dexLiquidityUsd;
    const vol = enrichment.dexVolume24h ?? 0;
    const buys = enrichment.dexBuys24h ?? 0;
    if (liq < 100 && vol < 500 && buys === 0) {
      signals.push({ reason: `dead screen pool (liq $${liq}, vol $${vol}, 0 buys) at ${priceEur != null ? priceEur.toExponential(1) : "?"} EUR/unit`, weight: 4 });
    } else if (priceEur != null && priceEur > 1 && liq < 10_000 && vol < 500 && buys === 0) {
      signals.push({ reason: `screen pool (liq $${liq}, vol $${vol}, 0 buys) at ${priceEur.toFixed(2)} EUR/unit`, weight: 2 });
    }
  }

  // 16. GoPlus security verdict.
  if (!isKnownToken(s.toUpperCase(), contract) && enrichment?.goPlus?.available) {
    const g = enrichment.goPlus;
    if (g.isHoneypot) signals.push({ reason: "goplus: honeypot", weight: 4 });
    if (g.isBlacklisted) signals.push({ reason: "goplus: blacklist anti-sell", weight: 1 });
    if (g.canTakeBackOwnership) signals.push({ reason: "goplus: take-back ownership", weight: 1 });
    if (g.slippageModifiable) signals.push({ reason: "goplus: slippage modifiable", weight: 1 });
    if ((g.ownerPercent ?? 0) > 50) signals.push({ reason: `goplus: owner holds ${g.ownerPercent}% supply`, weight: 2 });
  }

  // 17. GeckoTerminal Security Score + holder distribution. Distinct from GoPlus
  // (which only reports contract-level risks): GT analyses pool health, holder
  // concentration, and project metadata. Critical for tokens that pass GoPlus
  // (e.g. XCLAW/xBTC: contract is clean but the market is rigged).
  // Tiered weights match GT's own bucket boundaries and our empirical evidence:
  // < 35 = hard scam (xBTC 38.8, SKYAI 31.0, MCNUGGETS 44.8 still need other
  // signals); < 40 alone is suspicious not scam (XCLAW 53.1 is legit).
  // Top-10 concentration is the strongest individual signal (XCLAW 99% is
  // fine because it's a burn address, so we cross-check holder count).
  if (!isKnownToken(s.toUpperCase(), contract) && enrichment?.gt?.available) {
    const gt = enrichment.gt;
    const score = typeof gt.gtScore === "number" ? gt.gtScore : null;
    const top10 = gt.holderDistribution?.top_10;
    const holders = typeof gt.holderCount === "number" ? gt.holderCount : null;

    if (score != null && score > 0) {
      // gtScore === 0 means GT has not enough data to rate the token (observed:
      // World Chain dust with pool/holders components partially populated but
      // total 0) — it is "unrated", not "worst score". Only explicit nonzero
      // scores feed the tiers; the isHoneypot flag below stays authoritative.
      if (score < 35) {
        signals.push({ reason: `gt score ${score.toFixed(1)}/100 (high risk)`, weight: 4 });
      } else if (score < 40) {
        signals.push({ reason: `gt score ${score.toFixed(1)}/100 (sub scam)`, weight: 3 });
      } else if (score < 50) {
        signals.push({ reason: `gt score ${score.toFixed(1)}/100 (borderline)`, weight: 1 });
      }
    }

    // Holder concentration: top-10 controls >= 80% while GT score < 50 is a
    // rug-pull/dusting profile regardless of holder count. Mass-airdrop scams
    // deliberately manufacture hundreds of thousands of holders (vBTC: 296k,
    // top10=100%, score=38.8; xBTC: 382k, top10=88.7%, score=38.8).
    // Exclude GT >= 50 so a known burn-address concentration stays safe
    // (XCLAW: top10=99.4%, score=53.1).
    if (top10 != null && top10 >= 80 && holders != null && score != null && score > 0 && score < 50) {
      signals.push({ reason: `top 10 holders own ${top10.toFixed(1)}% (${holders} holders)`, weight: 2 });
    }

    if (gt.isHoneypot === true) {
      signals.push({ reason: "gt: flagged as honeypot", weight: 4 });
    }
  }

  const totalScore = signals.reduce((sum, sig) => sum + sig.weight, 0);
  return {
    isSuspicious: totalScore >= 2,
    level: assess(totalScore),
    score: totalScore,
    reasons: signals.map(sig => sig.reason),
  };
}

function formatBig(n: number): string {
  if (n >= 1e12) return (n / 1e12).toFixed(2) + "T";
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  return n.toLocaleString();
}
