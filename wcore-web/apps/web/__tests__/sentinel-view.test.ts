import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatCountdown, sortAlerts, nextDeadline, riskIndex, pendingCount, isPublicSafe, normalizeKey, asSentinelChainsResponse,
  type SentinelAlertView, type SentinelChainView, type SentinelChainsResponse,
} from "../lib/sentinel-view";

const H = 3600000, D = 24 * H;

function alert(p: Partial<SentinelAlertView>): SentinelAlertView {
  return { chainKey: "x", chainId: 1, code: "ACTION_REQUIRED_BEFORE_DEADLINE", severity: "P1", actionByMs: null, countdownMs: null,
    deadlineKind: null, conflict: false, officialSourceUrls: [], exposure: "AUTH_REQUIRED", ...p };
}
function chain(p: Partial<SentinelChainView>): SentinelChainView {
  return { chainKey: "abstract", chainId: 2741, name: "Abstract", status: "WINDING_DOWN", successorChainId: null,
    recoveryAfterShutdown: "NOT_AVAILABLE", recoveryNote: null, lastVerifiedAt: "2026-11-07T00:00:00Z", deadlines: [], ...p };
}

test("formatCountdown : futur, passé, inconnu", () => {
  assert.equal(formatCountdown(3 * D + 2 * H), "dans 3 j 2 h");
  assert.equal(formatCountdown(-(5 * H + 30 * 60000)), "dépassée depuis 5 h 30 min");
  assert.equal(formatCountdown(null), "—");
  assert.equal(formatCountdown(Number.NaN), "—");
});

test("sortAlerts : P0 avant P1, puis échéance la plus proche ; l'entrée n'est pas mutée", () => {
  const input = [alert({ severity: "P2", actionByMs: 1 }), alert({ severity: "P1", actionByMs: 50 }), alert({ severity: "P1", actionByMs: 10 }), alert({ severity: "P0", actionByMs: null })];
  const out = sortAlerts(input);
  assert.deepEqual(out.map((a) => `${a.severity}:${a.actionByMs}`), ["P0:null", "P1:10", "P1:50", "P2:1"]);
  assert.equal(input[0]!.severity, "P2");
});

test("nextDeadline : prochaine future, sinon la dernière passée", () => {
  const dl = (kind: string, c: number) => ({ kind, at: "2026-12-15T00:00:00Z", assets: null, countdownMs: c, sources: [] });
  assert.equal(nextDeadline(chain({ deadlines: [dl("NETWORK_SHUTDOWN", 40 * D), dl("NON_NATIVE_BRIDGE_LAST", 10 * D)] }))?.kind, "NON_NATIVE_BRIDGE_LAST");
  assert.equal(nextDeadline(chain({ deadlines: [dl("A", -10 * D), dl("B", -2 * D)] }))?.kind, "B");
  assert.equal(nextDeadline(chain({ deadlines: [] })), null);
});

test("riskIndex : clés normalisées, chaînes actives exclues", () => {
  const idx = riskIndex([chain({ chainKey: "Cronos-zkEVM" }), chain({ chainKey: "base", status: "ACTIVE" })]);
  assert.ok(idx.has("cronos_zkevm"));
  assert.ok(!idx.has("base"));
  assert.equal(normalizeKey(" Cronos zkEVM "), "cronos_zkevm");
});

test("fail-safe : une reponse /api/sentinel/chains malformee ne casse jamais le rendu (regression e2e PR #40)", () => {
  // Le mock e2e catch-all repond {} : avant correctif, riskIndex(undefined) levait une TypeError dans ChainCard.
  assert.equal(asSentinelChainsResponse({}), null);
  assert.equal(asSentinelChainsResponse(null), null);
  assert.equal(asSentinelChainsResponse({ chains: "x", alerts: [] }), null);
  assert.equal(asSentinelChainsResponse({ chains: [], alerts: {} }), null);
  const ok = { version: 1, generatedAt: "2026-11-08T00:00:00Z", chains: [chain({})], alerts: [] };
  assert.equal(asSentinelChainsResponse(ok), ok);
  assert.doesNotThrow(() => riskIndex(undefined));
  assert.doesNotThrow(() => riskIndex(null));
  assert.equal(riskIndex(undefined).size, 0);
  assert.equal(riskIndex([null as unknown as SentinelChainView, chain({ chainKey: "lisk", status: "RETIRED" })]).size, 1);
});

test("pendingCount : nul pour un visiteur, sinon taille de la file serveur", () => {
  assert.equal(pendingCount(null), 0);
  assert.equal(pendingCount({ generatedAt: "", alerts: [], pendingNotificationIds: ["a", "b"] }), 2);
});

test("isPublicSafe : refuse toute exposition dans la vue publique", () => {
  const base: SentinelChainsResponse = { version: 1, generatedAt: "", chains: [], alerts: [alert({})] };
  assert.equal(isPublicSafe(base), true);
  assert.equal(isPublicSafe({ ...base, alerts: [alert({ exposure: "FUNDS_PRESENT" })] }), false);
});
