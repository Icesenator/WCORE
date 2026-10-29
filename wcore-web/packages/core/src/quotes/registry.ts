/**
 * WC-12 — registre OUVERT des providers de quotes (frontière read-only).
 *
 * Un provider n'est utilisable que si son contrat est PROUVÉ :
 * identité stable, chaînes/actifs déclarés supportés, capacités réellement
 * connues, provenance de la disponibilité, convention de montants et de frais,
 * validité, séquence d'étapes, absence de signature et d'exécution.
 *
 * Un provider inconnu ou non validé est INACTIF, jamais simulé comme disponible.
 * Aucune I/O réseau, aucune construction de transaction, aucune signature.
 */
import type { AmountOutBasis, CostUnit, FeePolicy } from "./types.js";

export type ProviderCapabilityStatus = "KNOWN" | "UNKNOWN";
export type ProviderAvailabilitySource = "DOCUMENTED" | "FIXTURE" | "UNVERIFIED";
export type ProviderActivationState = "ACTIVE" | "INACTIVE_UNVERIFIED";

export interface ProviderChainSupport {
  chainId: number;
  /** Actifs (symbole ou adresse) déclarés supportés sur cette chaîne. */
  assets: readonly string[];
  /** Annoncé ET prouvé routable. `false` = annoncé seulement. */
  routable: boolean;
  source: ProviderAvailabilitySource;
}

export interface ProviderFeeConvention {
  policy: FeePolicy;
  costUnit: CostUnit;
  amountOutBasis: AmountOutBasis;
}

export interface ProviderStepDescriptor {
  kind: string;
  chainId: number;
  from: string;
  to: string;
}

export interface ProviderContract {
  /** Identité STABLE du provider (jamais un libellé marketing). */
  providerId: string;
  displayName: string;
  quoteCapability: ProviderCapabilityStatus;
  availability: ProviderAvailabilitySource;
  activation: ProviderActivationState;
  chains: readonly ProviderChainSupport[];
  fees: ProviderFeeConvention;
  /** Durée de validité déclarée d'une quote, en secondes. */
  validitySeconds?: number;
  steps: readonly ProviderStepDescriptor[];
  /** true = aucune signature, aucune exécution. Doit rester true. */
  signatureFree: boolean;
}

export type ProviderEligibilityBlocker =
  | "PROVIDER_NOT_REGISTERED"
  | "PROVIDER_CAPABILITIES_UNKNOWN"
  | "PROVIDER_INACTIVE_UNVERIFIED"
  | "PROVIDER_AVAILABILITY_UNVERIFIED"
  | "PROVIDER_EXECUTION_FORBIDDEN"
  | "STABLE_IDENTITY_MISSING"
  | "DUPLICATE_PROVIDER_ID"
  | "CHAIN_DECLARED_NOT_ROUTABLE"
  | "CHAIN_NOT_DECLARED"
  | "INPUT_ASSET_NOT_DECLARED"
  | "OUTPUT_ASSET_NOT_DECLARED"
  | "COST_UNIT_NOT_NORMALIZED"
  | "FEES_UNDOCUMENTED"
  | "PROVIDER_VALIDITY_UNKNOWN";

export interface ProviderEligibility {
  providerId: string;
  eligible: boolean;
  blocker: ProviderEligibilityBlocker | null;
}

export interface QuoteRequest {
  fromChainId: number;
  toChainId: number;
  fromAsset: string;
  toAsset: string;
  /** Montant exact en unités brutes : jamais de conversion Number. */
  amountInRaw: bigint;
  maxSlippageBps: number;
  minAmountOutRaw: bigint;
  route: { routeId?: string; maxSteps?: number; path?: readonly string[] };
  preferences: { readonly [key: string]: JsonValue };
  feePolicy: "INCLUDED" | "ADDITIONAL";
  providerParams: { readonly [key: string]: JsonValue };
}

export type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export interface ProviderRegistry {
  contracts: ReadonlyMap<string, ProviderContract>;
  invalid: readonly { providerId: string; blockers: readonly ProviderEligibilityBlocker[] }[];
}

/** Défauts structurels d'un contrat (indépendants d'une requête). */
export function validateProviderContract(contract: ProviderContract): ProviderEligibilityBlocker[] {
  const blockers: ProviderEligibilityBlocker[] = [];
  if (!contract.providerId || !/^[a-z0-9][a-z0-9._-]*$/.test(contract.providerId)) {
    blockers.push("STABLE_IDENTITY_MISSING");
  }
  if (contract.fees.policy === "UNDOCUMENTED") blockers.push("FEES_UNDOCUMENTED");
  if (contract.fees.costUnit !== "OUTPUT_RAW") blockers.push("COST_UNIT_NOT_NORMALIZED");
  return blockers;
}

export function createRegistry(contracts: readonly ProviderContract[]): ProviderRegistry {
  const map = new Map<string, ProviderContract>();
  const invalid: { providerId: string; blockers: ProviderEligibilityBlocker[] }[] = [];
  for (const contract of contracts) {
    const blockers = validateProviderContract(contract);
    if (map.has(contract.providerId)) blockers.push("DUPLICATE_PROVIDER_ID");
    if (blockers.length > 0) {
      invalid.push({ providerId: contract.providerId, blockers });
      continue;
    }
    map.set(contract.providerId, contract);
  }
  return { contracts: map, invalid };
}

function chainSupport(contract: ProviderContract, chainId: number): ProviderChainSupport | undefined {
  return contract.chains.find((c) => c.chainId === chainId);
}

/**
 * Éligibilité d'un provider pour une requête. Fail-closed sur chaque dimension.
 * Ne compare aucune quote et ne contacte aucun réseau.
 */
export function providerEligibility(
  registry: ProviderRegistry,
  providerId: string,
  request: QuoteRequest,
): ProviderEligibility {
  const deny = (blocker: ProviderEligibilityBlocker): ProviderEligibility => ({
    providerId,
    eligible: false,
    blocker,
  });

  const contract = registry.contracts.get(providerId);
  if (!contract) return deny("PROVIDER_NOT_REGISTERED");
  if (contract.activation !== "ACTIVE") return deny("PROVIDER_INACTIVE_UNVERIFIED");
  if (contract.availability === "UNVERIFIED") return deny("PROVIDER_AVAILABILITY_UNVERIFIED");
  if (contract.quoteCapability !== "KNOWN") return deny("PROVIDER_CAPABILITIES_UNKNOWN");
  if (contract.signatureFree !== true) return deny("PROVIDER_EXECUTION_FORBIDDEN");
  if (contract.validitySeconds === undefined || !(contract.validitySeconds > 0)) {
    return deny("PROVIDER_VALIDITY_UNKNOWN");
  }

  const from = chainSupport(contract, request.fromChainId);
  if (!from) return deny("CHAIN_NOT_DECLARED");
  if (!from.routable || from.source === "UNVERIFIED") return deny("CHAIN_DECLARED_NOT_ROUTABLE");
  const to = chainSupport(contract, request.toChainId);
  if (!to) return deny("CHAIN_NOT_DECLARED");
  if (!to.routable || to.source === "UNVERIFIED") return deny("CHAIN_DECLARED_NOT_ROUTABLE");

  if (!from.assets.includes(request.fromAsset)) return deny("INPUT_ASSET_NOT_DECLARED");
  if (!to.assets.includes(request.toAsset)) return deny("OUTPUT_ASSET_NOT_DECLARED");

  return { providerId, eligible: true, blocker: null };
}

/** Providers éligibles pour une requête, dans l'ordre d'identité stable. */
export function eligibleProviders(registry: ProviderRegistry, request: QuoteRequest): ProviderEligibility[] {
  return [...registry.contracts.keys()]
    .sort()
    .map((providerId) => providerEligibility(registry, providerId, request));
}

/**
 * Registre par défaut : AUCUN provider n'est activé tant que son contrat n'est
 * pas prouvé. Les candidats restent des noms inertes, jamais des disponibilités.
 */
export const CANDIDATE_PROVIDERS: readonly string[] = [
  "lifi",
  "relay",
  "socket",
  "rango",
  "zero-x",
  "one-inch",
  "jupiter",
];

export const DEFAULT_PROVIDER_CONTRACTS: readonly ProviderContract[] = [];
