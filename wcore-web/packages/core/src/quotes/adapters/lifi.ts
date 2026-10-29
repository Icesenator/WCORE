/**
 * WC-12 — adaptateur LI.FI (READ-ONLY), NON ACTIVÉ.
 *
 * Source primaire : documentation LI.FI « Get a quote for a token transfer »
 * (https://docs.li.fi/api-reference/get-a-quote-for-a-token-transfer),
 * consultée le 2026-10-18. Champs lus : `estimate.fromAmount`,
 * `estimate.toAmount`, `estimate.toAmountMin`, `estimate.feeCosts[]`
 * (dont `included`), `estimate.gasCosts[]` (dont `token`), `action.slippage`,
 * `action.fromToken/toToken`, `transactionRequest`.
 *
 * LIMITES EXPLICITES (le provider reste INACTIF) :
 * - `feeCosts`/`gasCosts` sont facultatifs dans le schéma documentaire : leur
 *   absence, leur nullité ou une forme non-tableau ne prouve jamais zéro ->
 *   refus `LIFI_COST_COMPLETENESS_UNKNOWN` ; un `[]` explicite vaut zéro comme
 *   déclaration de fixture, jamais comme preuve d'une réponse LIVE ;
 * - la documentation ne prouve AUCUN TTL de validité de quote : `expiresAt` et
 *   `validitySeconds` restent inconnus -> PROVIDER_VALIDITY_UNKNOWN ;
 * - le gaz est facturé dans le token NATIF de la chaîne source (constaté dans
 *   l'exemple documenté), donc `costUnit` n'est pas OUTPUT_RAW -> la route est
 *   NON classable jusqu'à conversion multi-unités ;
 * - `transactionRequest` est explicitement IGNORÉ : aucune transaction n'est
 *   construite, signée ou transmise.
 */
import type { AmountOutBasis, CostUnit, FeePolicy, ProviderQuote } from "../types.js";
import type { ProviderContract } from "../registry.js";

export interface LifiToken {
  address?: string;
  symbol?: string;
  decimals?: number;
  chainId?: number;
  name?: string;
}

export interface LifiCost {
  amount?: string;
  amountUSD?: string;
  included?: boolean;
  token?: LifiToken;
}

export interface LifiAction {
  fromChainId?: number;
  toChainId?: number;
  fromToken?: LifiToken;
  toToken?: LifiToken;
  fromAmount?: string;
  slippage?: number;
}

export interface LifiEstimate {
  fromAmount?: string;
  toAmount?: string;
  toAmountMin?: string;
  /**
   * Facultatif dans le schéma documentaire : absent/null/non-tableau ne prouve
   * jamais zéro. Le mapper refuse alors `LIFI_COST_COMPLETENESS_UNKNOWN` ; seul
   * un `[]` explicitement déclaré vaut zéro (déclaration de fixture, pas preuve
   * d'une réponse LIVE).
   */
  feeCosts?: LifiCost[];
  gasCosts?: LifiCost[];
  executionDuration?: number;
}

export interface LifiStep {
  id?: string;
  type?: string;
  tool?: string;
  action?: LifiAction;
  estimate?: LifiEstimate;
  includedSteps?: Array<{ tool?: string }>;
}

const NATIVE_ADDRESS = "0x0000000000000000000000000000000000000000";

function parseAmount(value: string | undefined): bigint | null {
  if (typeof value !== "string" || !/^[0-9]+$/.test(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

/** Slippage LI.FI = ratio (0.003) -> points de base (30). */
export function slippageRatioToBps(ratio: number | undefined): number {
  if (typeof ratio !== "number" || !Number.isFinite(ratio) || ratio < 0) return 0;
  return Math.round(ratio * 10_000);
}

function sameToken(a: LifiToken | undefined, b: LifiToken | undefined): boolean {
  if (!a || !b) return false;
  if (typeof a.address === "string" && typeof b.address === "string" && a.address && b.address) {
    return a.address.toLowerCase() === b.address.toLowerCase();
  }
  return false;
}

/**
 * Détermine l'unité des coûts à partir des tokens observés. Un coût dans une
 * unité autre que le token de sortie n'est jamais assimilé à OUTPUT_RAW.
 */
function costUnitFor(costs: readonly LifiCost[], input: LifiToken | undefined, output: LifiToken | undefined): CostUnit {
  if (costs.length === 0) return "OUTPUT_RAW";
  const allOutput = costs.every((c) => sameToken(c.token, output));
  if (allOutput && output) return "OUTPUT_RAW";
  const allInput = costs.every((c) => sameToken(c.token, input));
  if (allInput && input) return "INPUT_RAW";
  return "UNKNOWN";
}

type CostRows =
  | { kind: "ok"; rows: LifiCost[] }
  | { kind: "missing" }
  | { kind: "malformed" };

/** Noms d'outils lisibles uniquement ; toute autre forme est ignorée sans lever. */
function readStepToolNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const names: string[] = [];
  for (const row of value) {
    if (typeof row !== "object" || row === null || Array.isArray(row)) continue;
    const tool = (row as { tool?: unknown }).tool;
    if (typeof tool === "string" && tool.length > 0) names.push(tool);
  }
  return names;
}

/**
 * Lit un tableau de coûts non fiable. Absent/null/non-tableau => `missing`
 * (complétude inconnue) ; une ligne qui n'est pas un objet => `malformed`
 * (montant invalide). Aucune forme ne lève et aucune absence ne devient `[]`.
 */
function readCostRows(value: unknown): CostRows {
  if (!Array.isArray(value)) return { kind: "missing" };
  const rows: LifiCost[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const row: unknown = value[index];
    if (typeof row !== "object" || row === null || Array.isArray(row)) return { kind: "malformed" };
    rows.push(row as LifiCost);
  }
  return { kind: "ok", rows };
}

function feePolicyFor(fees: readonly LifiCost[]): FeePolicy {
  if (fees.length === 0) return "ADDITIONAL";
  const includedFlags = fees.map((f) => f.included);
  if (includedFlags.every((v) => v === true)) return "INCLUDED";
  if (includedFlags.every((v) => v === false)) return "ADDITIONAL";
  return "UNDOCUMENTED";
}

export interface LifiMappingResult {
  quote: ProviderQuote | null;
  /** Motif exact quand la réponse documentée ne permet pas un mapping sûr. */
  blocker: string | null;
}

/** Mappe un `Step` LI.FI documenté vers `ProviderQuote`. Jamais de transaction. */
export function mapLifiStep(step: LifiStep): LifiMappingResult {
  const estimate = step.estimate;
  const action = step.action;
  if (!estimate || !action) return { quote: null, blocker: "LIFI_STEP_INCOMPLETE" };

  const amountInRaw = parseAmount(estimate.fromAmount);
  const amountOutRaw = parseAmount(estimate.toAmount);
  const stringToAmount = parseAmount(estimate.toAmountMin);
  if (amountInRaw === null || amountOutRaw === null || stringToAmount === null) {
    return { quote: null, blocker: "LIFI_AMOUNT_UNPARSEABLE" };
  }

  const input = action.fromToken;
  const output = action.toToken;
  const feeRows = readCostRows(estimate.feeCosts);
  const gasRows = readCostRows(estimate.gasCosts);
  if (feeRows.kind === "missing" || gasRows.kind === "missing") {
    return { quote: null, blocker: "LIFI_COST_COMPLETENESS_UNKNOWN" };
  }
  if (feeRows.kind === "malformed" || gasRows.kind === "malformed") {
    return { quote: null, blocker: "LIFI_COST_AMOUNT_UNPARSEABLE" };
  }
  const fees = feeRows.rows;
  const gas = gasRows.rows;
  // Les doublons déclarés ne sont pas dédupliqués : aucune identité de coût
  // n'est prouvée, chaque ligne est sommée telle quelle.
  const costs: LifiCost[] = [...fees, ...gas];
  const gasAmounts = gas.map((cost) => parseAmount(cost.amount));
  const feeAmounts = fees.map((cost) => parseAmount(cost.amount));
  if (gasAmounts.some((amount) => amount === null) || feeAmounts.some((amount) => amount === null)) {
    return { quote: null, blocker: "LIFI_COST_AMOUNT_UNPARSEABLE" };
  }
  const policy = feePolicyFor(fees);
  const costUnit = costUnitFor(costs, input, output);
  const amountOutBasis: AmountOutBasis = policy === "INCLUDED" || costs.length === 0 ? "NET" : "GROSS";

  const fromChainId = action.fromChainId ?? input?.chainId;
  const toChainId = action.toChainId ?? output?.chainId;
  if (typeof fromChainId !== "number" || typeof toChainId !== "number") {
    return { quote: null, blocker: "LIFI_CHAIN_UNKNOWN" };
  }
  if (!input?.address || !output?.address) return { quote: null, blocker: "LIFI_TOKEN_UNKNOWN" };

  // `includedSteps` n'est pas fiable : ni tableaux, ni lignes, ni `tool` ne
  // peuvent lever. Seuls des noms d'outils textuels sont conservés.
  const toolNames = readStepToolNames(step.includedSteps);
  const path = toolNames.length > 0 ? toolNames : [step.tool ?? "lifi:unattested-tool"];

  const quote: ProviderQuote = {
    provider: "lifi",
    routeId: step.id ?? "lifi:unattested-id",
    fromChainId,
    toChainId,
    fromToken: input.address,
    toToken: output.address,
    amountInRaw,
    amountOutRaw,
    amountOutBasis,
    costs: {
      // Les null ont été refusés avant construction de la quote.
      gasRaw: gasAmounts.reduce<bigint>((sum, amount) => sum + amount!, 0n),
      protocolFeeRaw: feeAmounts.reduce<bigint>((sum, amount) => sum + amount!, 0n),
    },
    feePolicy: policy,
    costUnit,
    slippageBps: slippageRatioToBps(action.slippage),
    estimatedDurationSec: typeof estimate.executionDuration === "number" ? estimate.executionDuration : 0,
    steps: Math.max(1, toolNames.length),
    path: path.length > 0 ? path : [step.tool ?? "lifi:unattested-tool"],
    // Chemin déclaré incomplet : la déduplication ne doit pas le fusionner.
    // Des noms d'outils ne prouvent pas les pools/hops sous-jacents.
    pathCompleteness: "INCOMPLETE",
    // Aucun risque numérique attesté dans ce schéma documentaire.
    riskScore: "UNKNOWN",
    minAmountOutRaw: stringToAmount,
  };
  return { quote, blocker: null };
}

/**
 * Contrat de référence LI.FI. VOLONTAIREMENT INACTIF : le TTL de validité n'est
 * pas prouvé par la documentation, et le gaz est en unité native. Aucun
 * `transactionRequest` n'est converti. Ne pas activer sans preuve LIVE.
 */
export const LIFI_CONTRACT_REFERENCE: ProviderContract = {
  providerId: "lifi",
  displayName: "LI.FI",
  quoteCapability: "KNOWN",
  availability: "DOCUMENTED",
  activation: "INACTIVE_UNVERIFIED",
  chains: [],
  fees: { policy: "UNDOCUMENTED", costUnit: "UNKNOWN", amountOutBasis: "GROSS" },
  steps: [],
  signatureFree: true,
};
