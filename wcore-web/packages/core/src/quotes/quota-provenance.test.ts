import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateQuotaProvenance } from "./quota-provenance.js";
import type { QuotaDocumentationEvidence, QuotaDocumentationTarget } from "./quota-provenance.js";

// Fixtures fictives : aucune assertion documentaire sur un fournisseur réel.
const TARGET: QuotaDocumentationTarget = {
  providerId: "fixture", endpoint: "https://api.example.test/v2/quote", endpointVersion: "v2",
  tier: "free", window: "FIXED_ANCHORED_FIRST",
};
const evidence = (patch: Partial<QuotaDocumentationEvidence> = {}): QuotaDocumentationEvidence => Object.freeze({
  providerId: TARGET.providerId, endpoint: TARGET.endpoint, endpointVersion: TARGET.endpointVersion,
  tier: TARGET.tier, sourceUrl: "https://docs.example.test/quotas", readAt: 100, expiresAt: 200,
  invalidated: false, status: "DOCUMENTED_EXPLICITLY", value: 10, unit: "request",
  windowMs: 60_000, window: "FIXED_ANCHORED_FIRST", scope: "API_KEY", ...patch,
});
const evaluate = (item: QuotaDocumentationEvidence | undefined, trusted: ReadonlySet<QuotaDocumentationEvidence> = new Set(item ? [item] : []), now = 150, target = TARGET) =>
  evaluateQuotaProvenance({ evidence: item, reviewedEvidence: trusted, now, target });

test("absence de preuve : NOT_DOCUMENTED, aucune autorisation", () => {
  const result = evaluate(undefined);
  assert.equal(result.status, "NOT_DOCUMENTED");
  assert.equal(result.authorized, false);
  assert.equal(result.documentationQualified, false);
});

test("référence exacte revue : documentation qualifiée uniquement", () => {
  const result = evaluate(evidence());
  assert.equal(result.status, "DOCUMENTED_EXPLICITLY");
  assert.equal(result.documentationQualified, true);
  assert.equal(result.reason, "DOCUMENTATION_QUALIFIED_NOT_ENFORCEMENT");
  assert.equal(result.enforcementApplicable, false);
  assert.equal(result.authorized, false);
  assert.equal(result.networkAccess, false);
});

test("URL officielle revendiquée, boolean et hash ne remplacent jamais la référence revue", () => {
  const reviewed = evidence();
  for (const forged of [Object.freeze({ ...reviewed }), Object.freeze({ ...reviewed, reviewed: true, hash: "user-hash", official: true })]) {
    const result = evaluate(forged, new Set([reviewed]));
    assert.equal(result.status, "UNVERIFIED");
    assert.equal(result.documentationQualified, false);
  }
  assert.equal(evaluate(reviewed, new Set()).status, "UNVERIFIED");
});

test("provider, endpoint exact, version et tier doivent tous correspondre", () => {
  for (const patch of [{ providerId: "other" }, { endpoint: "https://api.example.test/v2/quote/" }, { endpointVersion: "v1" }, { tier: "paid" }]) {
    const result = evaluate(evidence(patch));
    assert.equal(result.documentationQualified, false);
    assert.equal(result.reason, "IDENTITY_MISMATCH");
  }
});

test("invalidation et expiration à la borne exacte sont fail-closed", () => {
  assert.equal(evaluate(evidence({ invalidated: true })).documentationQualified, false);
  assert.equal(evaluate(evidence(), undefined, 199).documentationQualified, true);
  assert.equal(evaluate(evidence(), undefined, 200).documentationQualified, false);
  assert.equal(evaluate(evidence(), undefined, 201).documentationQualified, false);
});

test("champs requis absents ou invalides refusés même dans les références fournies", () => {
  const patches = [
    { unit: undefined }, { unit: "token" }, { value: undefined }, { value: 0 }, { value: 1.5 }, { value: Infinity },
    { windowMs: undefined }, { windowMs: 0 }, { windowMs: NaN }, { window: undefined },
    { scope: undefined }, { expiresAt: undefined }, { expiresAt: 100 }, { readAt: undefined }, { readAt: 151 },
    { invalidated: undefined }, { sourceUrl: "http://docs.example.test/quotas" },
    { sourceUrl: "https://user:pass@docs.example.test/quotas" }, { endpointVersion: "" },
  ];
  for (const patch of patches) {
    const item = evidence(patch as Partial<QuotaDocumentationEvidence>);
    assert.equal(evaluate(item).documentationQualified, false, JSON.stringify(patch));
  }
  assert.equal(evaluate(evidence(), undefined, NaN).documentationQualified, false);
});

test("UNKNOWN scope ou fenêtre reste documentaire non qualifié", () => {
  for (const patch of [{ scope: "UNKNOWN" }, { window: "UNKNOWN" }, { status: "DOCUMENTED_BUT_SCOPE_UNKNOWN" }]) {
    const result = evaluate(evidence(patch as Partial<QuotaDocumentationEvidence>));
    assert.equal(result.status, "DOCUMENTED_BUT_SCOPE_UNKNOWN");
    assert.equal(result.documentationQualified, false);
    assert.equal(result.authorized, false);
  }
});

test("statuts NOT_DOCUMENTED et UNVERIFIED revus ne deviennent pas des quotas documentés", () => {
  for (const status of ["NOT_DOCUMENTED", "UNVERIFIED"] as const) {
    const result = evaluate(evidence({ status }));
    assert.equal(result.status, status);
    assert.equal(result.documentationQualified, false);
  }
});

test("ROLLING et CALENDAR ne rendent pas applicable une fenêtre FIXED", () => {
  for (const window of ["ROLLING", "CALENDAR"] as const) {
    const result = evaluate(evidence({ window }));
    assert.equal(result.documentationQualified, true);
    assert.equal(result.reason, "DOCUMENTATION_QUALIFIED_WINDOW_MISMATCH_NOT_ENFORCEMENT");
    assert.equal(result.enforcementApplicable, false);
    assert.equal(result.authorized, false);
  }
});

test("référence mutable refusée pour empêcher une modification après revue", () => {
  const mutable = { ...evidence() };
  assert.equal(evaluate(mutable).documentationQualified, false);
});

test("évaluateur purement local : fetch interdit, tous les scopes connus restent sans LIVE", () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (() => { calls++; throw new Error("NETWORK_FORBIDDEN"); }) as typeof fetch;
  try {
    for (const scope of ["API_KEY", "IP", "ACCOUNT", "GLOBAL"] as const) {
      const result = evaluate(evidence({ scope }));
      assert.equal(result.documentationQualified, true);
      assert.equal(result.networkAccess, false);
      assert.equal(result.authorized, false);
    }
    assert.equal(calls, 0);
  } finally { globalThis.fetch = original; }
});
