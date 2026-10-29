import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeFeeLines, type FeeAssetIdentity, type FeeConversionInput, type FeeLine, type FeeRate } from "./fee-conversion.js";

const source: FeeAssetIdentity = { chainId: 1, token: "source", decimals: 18, role: "SOURCE" };
const native: FeeAssetIdentity = { chainId: 1, token: "native", decimals: 18, role: "NATIVE" };
const output: FeeAssetIdentity = { chainId: 10, token: "output", decimals: 6, role: "OUTPUT" };
const line = (asset = source, amountRaw = 1n, included = false): FeeLine => ({ asset, amountRaw, included, provenance: "SYNTHETIC_FIXTURE" });
const rate = (asset = source, numerator = 2n, denominator = 3n): FeeRate => ({ source: asset, output, numerator, denominator, observedAt: 100, expiresAt: 200, provenance: "SYNTHETIC_FIXTURE" });
const input = (fees: readonly FeeLine[] = [line()], rates: readonly FeeRate[] = [rate()]): FeeConversionInput => ({ source, native, output, fees, rates, now: 150, includedFeePolicy: "ALREADY_ACCOUNTED_IN_OUTPUT" });
function known(value: FeeConversionInput, total: bigint): void {
  const result = normalizeFeeLines(value);
  assert.equal(result.status, "KNOWN");
  assert.equal(result.totalAdditionalOutputRaw, total);
}
function unknown(value: FeeConversionInput, reason: string): void {
  const result = normalizeFeeLines(value);
  assert.equal(result.status, "UNKNOWN");
  assert.equal(result.totalAdditionalOutputRaw, null);
  if (result.status === "UNKNOWN") assert.equal(result.reason, reason);
}

test("additionne SOURCE, NATIVE et OUTPUT en arrondissant chaque ligne vers le haut", () => {
  known(input([line(source, 1n), line(native, 3n), line(output, 5n)], [rate(), rate(native, 3n, 2n)]), 11n);
});
test("arrondit avant la somme, pas après", () => known(input([line(), line()], [rate(source, 1n, 3n)]), 2n));
test("OUTPUT est direct sans taux", () => known(input([line(output, 7n)], []), 7n));
test("SOURCE sans taux est inconnu, jamais zéro", () => unknown(input([line()], []), "RATE_MISSING"));
test("NATIVE sans taux est inconnu", () => unknown(input([line(native)], []), "RATE_MISSING"));
test("zéro explicite est connu sans taux", () => known(input([line(source, 0n)], []), 0n));
test("liste vide explicite est connue", () => known(input([], []), 0n));
test("montant absent n'est pas zéro", () => unknown(input([{ ...line(), amountRaw: undefined } as unknown as FeeLine]), "INVALID_AMOUNT"));
test("montant Number est refusé", () => unknown(input([{ ...line(), amountRaw: 1 } as unknown as FeeLine]), "INVALID_AMOUNT"));
test("préserve les bigint énormes exactement", () => {
  const amount = 10n ** 100n + 1n;
  known(input([line(source, amount)], [rate(source, 7n, 3n)]), (amount * 7n + 2n) / 3n);
});
for (const [name, asset] of [
  ["chainId", { ...source, chainId: 2 }],
  ["token", { ...source, token: "other" }],
  ["decimals", { ...source, decimals: 6 }],
  ["role", { ...source, role: "NATIVE" as const }],
] as const) {
  test(`refuse une identité de ligne différente (${name})`, () => unknown(input([line(asset)]), "ASSET_IDENTITY_MISMATCH"));
  test(`refuse une identité source de taux différente (${name})`, () => unknown(input([line()], [rate(asset)]), "RATE_MISSING"));
}
for (const [name, asset] of [
  ["chainId", { ...output, chainId: 1 }],
  ["token", { ...output, token: "other" }],
  ["decimals", { ...output, decimals: 18 }],
  ["role", { ...output, role: "SOURCE" as const }],
] as const) {
  test(`refuse une identité sortie de taux différente (${name})`, () => unknown(input([line()], [{ ...rate(), output: asset }]), "RATE_MISSING"));
}
test("les decimals sont une identité, le ratio est déjà outputRaw/sourceRaw", () => known(input([line(source, 10n ** 18n)], [rate(source, 10n ** 6n, 10n ** 18n)]), 10n ** 6n));
test("observedAt exact est valide", () => known({ ...input(), now: 100 }, 1n));
test("juste avant expiration est valide", () => known({ ...input(), now: 199 }, 1n));
test("expiration exacte est refusée", () => unknown({ ...input(), now: 200 }, "RATE_EXPIRED"));
test("taux expiré est refusé", () => unknown({ ...input(), now: 201 }, "RATE_EXPIRED"));
test("taux futur est refusé", () => unknown({ ...input(), now: 99 }, "INVALID_RATE_TIME"));
test("intervalle vide est refusé", () => unknown(input([line()], [{ ...rate(), expiresAt: 100 }]), "INVALID_RATE_TIME"));
test("now non fini est refusé", () => unknown({ ...input(), now: NaN }, "INVALID_NOW"));
test("montant négatif est refusé même inclus", () => unknown(input([line(source, -1n, true)], []), "INVALID_AMOUNT"));
for (const [numerator, denominator] of [[-1n, 1n], [1n, 0n], [1n, -1n]]) {
  test(`ratio invalide ${numerator}/${denominator} refusé`, () => unknown(input([line()], [rate(source, numerator, denominator)]), "INVALID_RATE"));
}
test("numérateur explicitement zéro reste connu", () => known(input([line()], [rate(source, 0n, 1n)]), 0n));
test("ratio Number est refusé", () => unknown(input([line()], [{ ...rate(), numerator: 2 } as unknown as FeeRate]), "INVALID_RATE"));
test("frais inclus ne sont pas re-soustraits et ne requièrent pas de taux", () => known(input([line(source, 100n, true), line(output, 3n)], []), 3n));
test("included absent refuse", () => unknown(input([{ ...line(), included: undefined } as unknown as FeeLine]), "INCLUDED_UNKNOWN"));
test("included inconnu refuse", () => unknown(input([{ ...line(), included: "UNKNOWN" } as unknown as FeeLine]), "INCLUDED_UNKNOWN"));
test("politique incluse absente refuse", () => unknown({ ...input([line(source, 1n, true)], []), includedFeePolicy: undefined } as unknown as FeeConversionInput, "INCLUDED_POLICY_UNKNOWN"));
test("référence source absente refuse même inclus", () => unknown({ ...input([line(source, 1n, true)]), source: undefined } as unknown as FeeConversionInput, "INVALID_ASSET_REFERENCE"));
test("référence native absente refuse", () => unknown({ ...input(), native: undefined } as unknown as FeeConversionInput, "INVALID_ASSET_REFERENCE"));
test("identité sortie mal formée refuse", () => unknown({ ...input(), output: { ...output, decimals: -1 } }, "INVALID_ASSET_REFERENCE"));
test("frais absents refusent", () => unknown({ ...input(), fees: undefined } as unknown as FeeConversionInput, "FEES_UNKNOWN"));
test("provenance autre que fixture refusée pour une ligne", () => unknown(input([{ ...line(), provenance: "LIVE" } as unknown as FeeLine]), "UNSUPPORTED_PROVENANCE"));
test("provenance autre que fixture refusée pour un taux", () => unknown(input([line()], [{ ...rate(), provenance: "LIVE" } as unknown as FeeRate]), "UNSUPPORTED_PROVENANCE"));
test("taux dupliqués ambigus refusés", () => unknown(input([line()], [rate(), rate(source, 1n, 1n)]), "RATE_AMBIGUOUS"));
test("ne modifie aucune entrée et ne produit ni quote ni admission", () => {
  const value = input([Object.freeze(line())], [Object.freeze(rate())]);
  Object.freeze(value.fees); Object.freeze(value.rates); Object.freeze(value);
  const before = structuredClone(value);
  known(value, 1n);
  assert.deepEqual(value, before);
  assert.deepEqual(Object.keys(normalizeFeeLines(value)).sort(), ["status", "totalAdditionalOutputRaw"]);
});
