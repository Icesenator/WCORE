import type { OfflineEconomicResult } from "./economic-result.js";
import type { FeeAssetIdentity } from "./fee-conversion.js";

/** Copies allowlistées : aucune méthode/toJSON de l'objet source n'est propagée. */
function assetJson(asset: FeeAssetIdentity) {
  return { chainId: asset.chainId, token: asset.token, decimals: asset.decimals, role: asset.role };
}
function amountJson(raw: bigint | null | undefined, asset: FeeAssetIdentity | null) {
  return {
    status: raw === null || raw === undefined ? "UNKNOWN" as const : "KNOWN" as const,
    raw: raw === null || raw === undefined ? null : raw.toString(10),
    unit: asset === null ? "UNKNOWN" as const : "ATOMIC" as const,
    asset: asset === null ? null : assetJson(asset),
  };
}

/**
 * Frontière sortante pure INTERNE, pour les objets de données de confiance issus
 * de compareOfflineEconomicResults. Aucun parseur inbound, aucune admission ou
 * authentification provider. Ne pas appeler avec des objets externes, proxies,
 * getters ou callbacks hostiles : ce n'est pas un validateur de données inconnues.
 * Les décimales décrivent l'unité atomique ; aucun montant ne passe par Number.
 * Aucun calcul, reclassement, net garanti ou attestation LIVE n'est ajouté.
 */
export function economicResultToJson(result: OfflineEconomicResult) {
  const fees = result.declaredFees;
  const costAsset = fees.costUnit === "OUTPUT_RAW" ? result.output
    : fees.costUnit === "INPUT_RAW" ? result.source : null;
  return {
    context: "INTERNAL_OFFLINE_PROJECTION" as const,
    sourceAuthority: "NOT_PROVIDER_AUTHENTICATION" as const,
    provider: result.provider,
    routeId: result.routeId,
    source: assetJson(result.source),
    output: assetJson(result.output),
    amountIn: amountJson(result.amountInRaw, result.source),
    amountOut: amountJson(result.amountOutRaw, result.output),
    amountOutBasis: result.amountOutBasis,
    expectedOut: amountJson(result.expectedOutRaw, result.output),
    providerMinimum: amountJson(result.providerMinimum.amountRaw, result.output),
    declaredFees: {
      policy: fees.policy,
      costUnit: fees.costUnit,
      amountOutBasis: fees.amountOutBasis,
      costs: {
        gas: amountJson(fees.costs.gasRaw, costAsset),
        bridgeFee: amountJson(fees.costs.bridgeFeeRaw, costAsset),
        protocolFee: amountJson(fees.costs.protocolFeeRaw, costAsset),
      },
      lines: fees.lines.map(line => ({
        amount: amountJson(line.amountRaw, line.asset),
        included: line.included,
        provenance: line.provenance,
      })),
    },
    totalAdditionalOutput: amountJson(result.totalAdditionalOutputRaw, result.output),
    comparisonObjective: amountJson(result.comparisonObjectiveRaw, result.output),
    objectiveStatus: result.objectiveStatus,
    temporal: { status: result.temporalStatus, expiresAt: result.expiresAt, unit: "EPOCH_SECONDS" as const },
    path: [...result.path],
    pathCompleteness: result.pathCompleteness,
    // Un résultat rejeté peut conserver NaN/Infinity en diagnostic interne ;
    // JSON.stringify les effacerait en null. Conserver le refus et l'inconnu.
    riskScore: typeof result.riskScore === "number" && !Number.isFinite(result.riskScore)
      ? "UNKNOWN" as const : result.riskScore,
    warnings: [...result.warnings],
    blockers: [...result.blockers],
    provenance: result.provenance,
    realAvailability: result.realAvailability,
    guaranteedNet: result.guaranteedNet,
  };
}
