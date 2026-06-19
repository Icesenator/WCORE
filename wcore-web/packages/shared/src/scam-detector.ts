// Single source of truth for scam detection — used by apps/api (server-side aggregation)
// AND apps/web (UI flagging). Both must agree, otherwise the badge shown to the user
// disagrees with the totalEur computed by the API. Bump SCAM_RULES_VERSION whenever
// rules change so consumers can invalidate their cached results.

export const SCAM_RULES_VERSION = 8;

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
  "PEPE", "SHIB", "FLOKI", "DOGE", "BONK", "WIF",
  "SOLVBTC", "CBBTC", "BTCB",
]);

// Permanently blocked contracts — known scams that bypass heuristic detection
const _BLOCKED_CONTRACTS = new Set([
  "0x94b5bd0c97f8a7b6cf0d2cb312069212f120b864", // Scroll: scam token
  "0x27777ec2be4258d32134271f1d5d7d1d896aa86d", // BASE: scam token
  "0x59828f30a4ad35d1d0b85c734d48ac6de04e314c", // BASE: scam token
  "0x260b9ac75753fbd67f2ea6d10724dd89a52c1913", // BASE: scam token
  "0xd546040f08e6b3a4f1d21683b9bd9935d73bd9e9", // BASE: stkAVNT scam (fake price 4308€)
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

export function detectScam(symbol: string, name: string, balance: number, priceEur: number | null, contract?: string): ScamCheck {
  if (contract && _adminBlockedContracts.has(contract.toLowerCase())) {
    return { isSuspicious: true, level: "scam", score: 10, reasons: ["admin blocked contract"] };
  }
  if (contract && _adminApprovedContracts.has(contract.toLowerCase())) {
    return { isSuspicious: false, level: "clean", score: 0, reasons: [] };
  }
  if (contract && _BLOCKED_CONTRACTS.has(contract.toLowerCase())) {
    return { isSuspicious: true, level: "scam", score: 10, reasons: ["blocked contract"] };
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
  if (priceEur == null) {
    const badPatterns = /coin|token|swap|finance|protocol|chain|network|defi|web3|ai|crypto|bridge|dao|pad|game|meme/i;
    if (badPatterns.test(n) && balance > 0) {
      signals.push({ reason: `generic name, no price: "${n}"`, weight: 2 });
    }
  }

  // 9. Unknown token with near-zero value despite non-zero price (fake pool)
  if (priceEur != null && priceEur > 0 && !isKnownToken(s.toUpperCase(), contract)) {
    const value = balance * priceEur;
    if (value > 0 && value < 0.01) {
      signals.push({ reason: `dust amount (${value.toExponential(1)} EUR) at price ${priceEur.toFixed(2)} — likely fake`, weight: 3 });
    }
  }

  // 10. Unknown token with absurdly high total value (>1000 EUR) and massive supply
  if (priceEur != null && priceEur > 0 && !isKnownToken(s.toUpperCase(), contract)) {
    const value = balance * priceEur;
    if (value > 1000 && balance > 100_000) {
      signals.push({ reason: `unknown token with inflated value: ${value.toFixed(0)} EUR from ${formatBig(balance)} tokens`, weight: 3 });
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
