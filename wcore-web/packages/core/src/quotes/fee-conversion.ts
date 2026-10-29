export interface FeeAssetIdentity {
  readonly chainId: number;
  readonly token: string;
  readonly decimals: number;
  readonly role: "SOURCE" | "NATIVE" | "OUTPUT";
}
export interface FeeLine {
  readonly asset: FeeAssetIdentity;
  readonly amountRaw: bigint;
  readonly included: boolean;
  readonly provenance: "SYNTHETIC_FIXTURE";
}
export interface FeeRate {
  readonly source: FeeAssetIdentity;
  readonly output: FeeAssetIdentity;
  readonly numerator: bigint;
  readonly denominator: bigint;
  readonly observedAt: number;
  readonly expiresAt: number;
  readonly provenance: "SYNTHETIC_FIXTURE";
}
export interface FeeConversionInput {
  readonly source: FeeAssetIdentity;
  readonly native: FeeAssetIdentity;
  readonly output: FeeAssetIdentity;
  readonly fees: readonly FeeLine[];
  readonly rates: readonly FeeRate[];
  readonly now: number;
  readonly includedFeePolicy: "ALREADY_ACCOUNTED_IN_OUTPUT";
}
export type FeeConversionReason =
  | "INVALID_NOW" | "INVALID_ASSET_REFERENCE" | "FEES_UNKNOWN"
  | "INCLUDED_POLICY_UNKNOWN" | "INCLUDED_UNKNOWN" | "INVALID_AMOUNT"
  | "ASSET_IDENTITY_MISMATCH" | "UNSUPPORTED_PROVENANCE" | "RATE_MISSING"
  | "RATE_AMBIGUOUS" | "INVALID_RATE" | "INVALID_RATE_TIME" | "RATE_EXPIRED";
export type FeeConversionResult =
  | { status: "KNOWN"; totalAdditionalOutputRaw: bigint }
  | { status: "UNKNOWN"; totalAdditionalOutputRaw: null; reason: FeeConversionReason };

function validAsset(asset: FeeAssetIdentity | undefined, role: FeeAssetIdentity["role"]): boolean {
  return asset !== undefined && asset !== null
    && Number.isSafeInteger(asset.chainId) && asset.chainId > 0
    && typeof asset.token === "string" && asset.token.trim().length > 0
    && Number.isSafeInteger(asset.decimals) && asset.decimals >= 0
    && asset.role === role;
}

function sameAsset(left: FeeAssetIdentity | undefined, right: FeeAssetIdentity): boolean {
  return left !== undefined && left !== null && left.chainId === right.chainId
    && left.token === right.token && left.decimals === right.decimals && left.role === right.role;
}

function unknown(reason: FeeConversionReason): FeeConversionResult {
  return { status: "UNKNOWN", totalAdditionalOutputRaw: null, reason };
}

/**
 * Coût équivalent en unités brutes du token de sortie, PAS une promesse du
 * montant effectivement reçu. Fonction pure, réservée aux fixtures synthétiques.
 * Le ratio est outputRaw/sourceRaw : les decimals ne sont pas réappliqués.
 * Les identités sont exactes (aucune canonicalisation implicite de token).
 * ALREADY_ACCOUNTED_IN_OUTPUT atteste explicitement que les lignes included
 * sont déjà comptées : validées mais exclues du total additionnel, sans taux.
 * Un zéro explicite ne requiert pas de conversion ; une absence n'est pas zéro.
 * Les taux sont valides dans [observedAt, expiresAt), avec horloge injectée.
 * Ce résultat ne modifie aucune quote et ne constitue pas une admission.
 */
export function normalizeFeeLines(input: FeeConversionInput): FeeConversionResult {
  if (!Number.isFinite(input.now)) return unknown("INVALID_NOW");
  if (!validAsset(input.source, "SOURCE") || !validAsset(input.native, "NATIVE")
      || !validAsset(input.output, "OUTPUT")) return unknown("INVALID_ASSET_REFERENCE");
  if (input.includedFeePolicy !== "ALREADY_ACCOUNTED_IN_OUTPUT") return unknown("INCLUDED_POLICY_UNKNOWN");
  if (!Array.isArray(input.fees)) return unknown("FEES_UNKNOWN");

  let total = 0n;
  for (const fee of input.fees) {
    if (fee === null || fee === undefined) return unknown("FEES_UNKNOWN");
    if (fee.provenance !== "SYNTHETIC_FIXTURE") return unknown("UNSUPPORTED_PROVENANCE");
    if (typeof fee.included !== "boolean") return unknown("INCLUDED_UNKNOWN");
    if (typeof fee.amountRaw !== "bigint" || fee.amountRaw < 0n) return unknown("INVALID_AMOUNT");
    if (![input.source, input.native, input.output].some((asset) => sameAsset(fee.asset, asset))) {
      return unknown("ASSET_IDENTITY_MISMATCH");
    }
    if (fee.included || fee.amountRaw === 0n) continue;
    if (sameAsset(fee.asset, input.output)) {
      total += fee.amountRaw;
      continue;
    }
    const matches = Array.isArray(input.rates)
      ? input.rates.filter((rate) => rate !== null && rate !== undefined
        && sameAsset(rate.source, fee.asset) && sameAsset(rate.output, input.output))
      : [];
    if (matches.length === 0) return unknown("RATE_MISSING");
    if (matches.length !== 1) return unknown("RATE_AMBIGUOUS");
    const rate = matches[0];
    if (rate.provenance !== "SYNTHETIC_FIXTURE") return unknown("UNSUPPORTED_PROVENANCE");
    if (typeof rate.numerator !== "bigint" || rate.numerator < 0n
        || typeof rate.denominator !== "bigint" || rate.denominator <= 0n) return unknown("INVALID_RATE");
    if (!Number.isFinite(rate.observedAt) || !Number.isFinite(rate.expiresAt)
        || rate.expiresAt <= rate.observedAt || input.now < rate.observedAt) return unknown("INVALID_RATE_TIME");
    if (input.now >= rate.expiresAt) return unknown("RATE_EXPIRED");
    const product = fee.amountRaw * rate.numerator;
    total += (product + rate.denominator - 1n) / rate.denominator;
  }
  return { status: "KNOWN", totalAdditionalOutputRaw: total };
}
