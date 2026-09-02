// Registre de shares outstanding vérifiées (source de vérité locale, propriétaire).
//
// Contexte (incident 2026-09-02) : CompaniesMarketCap publie pour Tencent (TCEHY)
// une market cap ~2x trop haute (1 016,97 Md$ vs ~515 Md$ vérifiés). Le CSV
// implique 18,1 Md de shares alors que les filings Tencent en déclarent ~9,17 Md
// (MacroTrends/Zacks, T1 2026) et que le prix ADR (~56 $) est correct. Yahoo
// propage la même erreur (sharesOutstanding 18,115 B), donc aucune source
// distante disponible ne peut servir de contre-vérification fiable pour ce cas.
//
// Sémantique : `shares` est dénombré dans l'UNITÉ du prix CSV (receipt-equivalent).
// Pour TCEHY, 1 ADR = 1 action ordinaire (0700.HK), donc shares ordinaires =
// shares receipt-equivalent. Pour une future entrée dont le prix CSV serait un
// ADR à ratio n:1, stocker le nombre de receipts (shares ordinaires / n).
//
// Auto-désengagement : la correction ne s'applique que si les shares implicites
// du CSV (marketCapUsd / priceUsd) s'écartent de plus de +/-20% du registre. Le
// jour où CompaniesMarketCap corrige sa donnée, l'écart retombe sous le seuil et
// le CSV est repris tel quel — la correction ne peut plus rien fausser. Les
// rachats d'actions Tencent (~-1,6%/an) restent des années dans la bande ±20%.
// Un ratio implicite cap/price est invariant par split, donc un split non répercuté
// ne peut pas déclencher la correction ; en revanche un capCorrected persistant
// (visible dans stats.capCorrections et les logs rebuild) signale un registre à
// re-vérifier : le contrôler lors de l'audit mensuel.

export interface VerifiedSharesEntry {
  shares: number;
  verifiedAt: string;
  source: string;
}

export const VERIFIED_SHARES_VERSION = 1;

const VERIFIED_SHARES: Readonly<Record<string, VerifiedSharesEntry>> = {
  TCEHY: {
    shares: 9_173_000_000,
    verifiedAt: "2026-09-02",
    source: "Tencent Holdings T1-2026 via MacroTrends/Zacks (9,173 Md au 2026-03-31); cap reelle verifiee ~506-515 Md$ (StockAnalysis 506,57 Md$, Business Insider 505,8 Md$); rachats ~-1,6%/an",
  },
};

export const VERIFIED_SHARES_DEVIATION_GATE = 1.2;

export interface VerifiedMarketCap {
  marketCapUsd: number;
  sharesOutstanding: number;
  corrected: boolean;
}

export function resolveVerifiedMarketCapUsd(
  canonicalTicker: string,
  marketCapUsd: number,
  priceUsd: number,
): VerifiedMarketCap | null {
  const entry = VERIFIED_SHARES[String(canonicalTicker ?? "").trim().toUpperCase()];
  if (!entry) return null;
  if (!Number.isFinite(marketCapUsd) || marketCapUsd <= 0) return null;
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) return null;

  const impliedShares = marketCapUsd / priceUsd;
  const ratio = impliedShares / entry.shares;
  if (ratio <= VERIFIED_SHARES_DEVIATION_GATE && ratio >= 1 / VERIFIED_SHARES_DEVIATION_GATE) {
    return { marketCapUsd, sharesOutstanding: impliedShares, corrected: false };
  }
  return { marketCapUsd: entry.shares * priceUsd, sharesOutstanding: entry.shares, corrected: true };
}
