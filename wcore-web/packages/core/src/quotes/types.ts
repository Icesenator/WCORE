/**
 * WC-12 — moteur de comparaison de quotes read-only.
 *
 * Contrat strict : aucune transaction n'est construite, signée ou envoyée.
 * Une quote signée ou de coût non normalisable n'entre jamais dans le classement.
 */

/** Unité des coûts. Seul OUTPUT_RAW est comparable sans conversion externe. */
export type CostUnit = "OUTPUT_RAW" | "INPUT_RAW" | "UNKNOWN";

/** Base du montant de sortie : brut (coûts à déduire) ou déjà net. */
export type AmountOutBasis = "GROSS" | "NET";

/** Politique de frais du provider. */
export type FeePolicy = "INCLUDED" | "ADDITIONAL" | "UNDOCUMENTED";

export type SlippageSource = "PROVIDER" | "UNKNOWN";

export type PathCompleteness = "COMPLETE" | "INCOMPLETE";

export interface QuoteCosts {
  gasRaw?: bigint;
  bridgeFeeRaw?: bigint;
  protocolFeeRaw?: bigint;
}

export interface ProviderQuote {
  provider: string;
  routeId: string;
  fromChainId: number;
  toChainId: number;
  fromToken: string;
  toToken: string;
  /** Token réellement reçu ; défaut = toToken. */
  outputToken?: string;
  amountInRaw: bigint;
  amountOutRaw: bigint;
  /** Défaut GROSS : les coûts additionnels sont déduits. */
  amountOutBasis?: AmountOutBasis;
  costs: QuoteCosts;
  /** Défaut ADDITIONAL. */
  feePolicy?: FeePolicy;
  costUnit: CostUnit;
  slippageBps: number;
  /** Défaut UNKNOWN : le slippage n'est pas réputé connu. */
  slippageSource?: SlippageSource;
  estimatedDurationSec: number;
  steps: number;
  /** Chemin sous-jacent (hops) utilisé pour dédupliquer les routes équivalentes. */
  path: readonly string[];
  /** Défaut COMPLETE. Un chemin incomplet n'est jamais fusionné. */
  pathCompleteness?: PathCompleteness;
  /** Score attesté 0..1, ou absence explicite de mesure (aucun score inventé). */
  riskScore: number | "UNKNOWN";
  /** Epoch secondes. Une quote expirée n'est jamais classée. */
  expiresAt?: number;
  /** Montant attendu annoncé par le provider. */
  expectedOutRaw?: bigint;
  /** Montant minimum garanti par la quote. */
  minAmountOutRaw?: bigint;
  /** Garde read-only : une quote signée est refusée. */
  signed?: boolean;
}

export type QuoteBlocker =
  | "SIGNED_QUOTE_FORBIDDEN"
  | "COST_UNIT_NOT_NORMALIZED"
  | "FEES_UNDOCUMENTED"
  | "FEE_POLICY_CONFLICT"
  | "INVALID_AMOUNT_IN"
  | "INVALID_AMOUNT_OUT"
  | "INVALID_SLIPPAGE"
  | "INVALID_STEPS"
  | "INVALID_RISK"
  | "MISSING_PATH"
  | "PATH_INCOMPLETE"
  | "NEGATIVE_COST"
  | "NON_POSITIVE_NET"
  | "QUOTE_EXPIRED"
  | "INVALID_EXPIRY"
  | "INVALID_EXPECTED_AMOUNT_OUT"
  | "INVALID_MIN_AMOUNT_OUT"
  | "BELOW_MIN_AMOUNT_OUT";

export interface NormalizedQuote {
  quote: ProviderQuote;
  comparable: boolean;
  blocker: QuoteBlocker | null;
  totalCostRaw: bigint | null;
  netReceivedRaw: bigint | null;
  pathKey: string;
  /** Bucket de comparaison : mêmes chaînes et même token de sortie. */
  bucket: string;
  warnings: readonly string[];
}

export interface RankedQuote extends NormalizedQuote {
  rank: number;
}

export interface DuplicateQuote {
  quote: ProviderQuote;
  duplicateOf: string;
  netReceivedRaw: bigint;
}

export interface QuoteComparison {
  ranked: readonly RankedQuote[];
  unrankable: readonly NormalizedQuote[];
  duplicates: readonly DuplicateQuote[];
  best: RankedQuote | null;
  /** Meilleure route par bucket (mêmes chaînes + même token de sortie). */
  bestByBucket: Readonly<Record<string, RankedQuote>>;
}
