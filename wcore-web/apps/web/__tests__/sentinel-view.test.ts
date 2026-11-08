import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatCountdown, sortAlerts, nextDeadline, riskIndex, pendingCount, isPublicSafe, normalizeKey, asSentinelChainsResponse,
  type SentinelAlertView, type SentinelChainView, type SentinelChainsResponse,
  type SentinelAlertsResponse, type SentinelHealthResponse,
} from "../lib/sentinel-view";
import * as View from "../lib/sentinel-view";

type PrivateState = { status: "loading" } | { status: "anonymous" } | { status: "error" } | { status: "ok"; data: SentinelAlertsResponse };

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

// --- Regression e2e PR #40 (scenario 279) : reponses privees /api/sentinel/alerts et /health non validees. ---
// Namespace : sur ed6f29d0 ces fonctions n'existent pas, chaque test echoue alors individuellement (RED lisible).
const V = View as unknown as Record<string, (...args: unknown[]) => unknown>;
const validAlert = (p: Partial<SentinelAlertView> = {}): SentinelAlertView =>
  alert({ id: "a1", chainKey: "sophon", chainId: 50104, severity: "P0", actionByMs: 1764028800000, countdownMs: 1000,
    deadlineKind: "NETWORK_SHUTDOWN", officialSourceUrls: ["https://blog.sophon.xyz/x"], acknowledged: false, ...p });
const validAlerts = (): SentinelAlertsResponse =>
  ({ generatedAt: "2026-11-08T00:00:00Z", alerts: [validAlert(), validAlert({ id: "a2", severity: "P1" })], pendingNotificationIds: ["a1", "a2"] });
const validHealth = (): SentinelHealthResponse =>
  ({ lastRunAt: "2026-11-08T00:00:00Z", lastSuccessAt: "2026-11-08T00:00:00Z", sourcesChecked: 4, sourcesFailed: 0, monitoring: { status: "OK" } });

test("pendingCount : une reponse incomplete ne leve jamais d'exception (cloche dans la Sidebar)", () => {
  // Avant correctif : TypeError « reading 'length' », qui remontait au global error boundary.
  assert.doesNotThrow(() => pendingCount({} as SentinelAlertsResponse));
  assert.equal(pendingCount({} as SentinelAlertsResponse), 0);
  assert.equal(pendingCount({ generatedAt: "", alerts: [], pendingNotificationIds: "x" } as unknown as SentinelAlertsResponse), 0);
});

test("asSentinelAlertsResponse : {} , null, champs absents ou mal types => null", () => {
  assert.equal(typeof V.asSentinelAlertsResponse, "function");
  const bad: unknown[] = [
    {}, null, undefined, "x", 42, [],
    { alerts: [], generatedAt: "" },                                     // pendingNotificationIds absent
    { pendingNotificationIds: [], generatedAt: "" },                     // alerts absent
    { alerts: {}, pendingNotificationIds: [], generatedAt: "" },
    { alerts: [], pendingNotificationIds: "a1", generatedAt: "" },
    { alerts: [], pendingNotificationIds: [1, 2], generatedAt: "" },
    { ...validAlerts(), alerts: [null] },
    { ...validAlerts(), alerts: [{ ...validAlert(), severity: "P9" }] },
    { ...validAlerts(), alerts: [{ ...validAlert(), chainKey: 7 }] },
    { ...validAlerts(), alerts: [{ ...validAlert(), code: undefined }] },
    { ...validAlerts(), alerts: [{ ...validAlert(), actionByMs: "demain" }] },
    { ...validAlerts(), alerts: [{ ...validAlert(), officialSourceUrls: "https://x" }] },
    { ...validAlerts(), alerts: [{ ...validAlert(), officialSourceUrls: ["pas une url"] }] },
    { ...validAlerts(), alerts: [{ ...validAlert(), acknowledged: "non" }] },
  ];
  for (const b of bad) assert.equal(V.asSentinelAlertsResponse!(b), null, JSON.stringify(b));
});

test("asSentinelAlertsResponse : une reponse valide est conservee a l'identique", () => {
  const ok = validAlerts();
  assert.equal(V.asSentinelAlertsResponse!(ok), ok);
  const empty = { generatedAt: "2026-11-08T00:00:00Z", alerts: [], pendingNotificationIds: [] };
  assert.equal(V.asSentinelAlertsResponse!(empty), empty);
  // Champs supplementaires du serveur (ex. changes) toleres ; actionByMs null et id absent valides.
  const extra = { ...validAlerts(), changes: { added: 1 }, alerts: [validAlert({ actionByMs: null, id: undefined })] };
  assert.equal(V.asSentinelAlertsResponse!(extra), extra);
});

test("session connectee : etat prive => cloche affichee pour une reponse valide, jamais de faux zero", () => {
  assert.equal(typeof V.toPrivateState, "function");
  // Reponse valide avec 2 notifications : etat ok, la cloche affiche 2 et passe en P0.
  const s = V.toPrivateState!(200, validAlerts()) as PrivateState;
  assert.equal(s.status, "ok");
  if (s.status !== "ok") return;
  assert.equal(pendingCount(s.data), 2);
  assert.ok(s.data.alerts.some((a) => a.severity === "P0" && !a.acknowledged));
  // Reponse malformee (mock e2e catch-all) : etat erreur, jamais { status: "ok" } avec un compteur a 0.
  for (const b of [{}, null, { alerts: [] }]) assert.deepEqual(V.toPrivateState!(200, b), { status: "error" });
  assert.deepEqual(V.toPrivateState!(401, null), { status: "anonymous" });
  assert.deepEqual(V.toPrivateState!(500, validAlerts()), { status: "error" });
});

test("asSentinelHealthResponse : contrat /api/sentinel/health, invalide => null (etat inconnu, jamais sain)", () => {
  assert.equal(typeof V.asSentinelHealthResponse, "function");
  const h = validHealth();
  assert.equal(V.asSentinelHealthResponse!(h), h);
  const stale = { ...validHealth(), lastSuccessAt: null, monitoring: { status: "STALE", severity: "P0" } };
  assert.equal(V.asSentinelHealthResponse!(stale), stale);
  const bad: unknown[] = [
    {}, null, "OK", [],
    { ...validHealth(), monitoring: undefined },
    { ...validHealth(), monitoring: {} },
    { ...validHealth(), monitoring: { status: "GREEN" } },
    { ...validHealth(), monitoring: { status: "STALE", severity: "P7" } },
    { ...validHealth(), sourcesChecked: "4" },
    { ...validHealth(), sourcesFailed: Number.NaN },
    { ...validHealth(), lastSuccessAt: 123 },
    { ...validHealth(), lastRunAt: {} },
  ];
  for (const b of bad) assert.equal(V.asSentinelHealthResponse!(b), null, JSON.stringify(b));
});

test("isPublicSafe : refuse toute exposition dans la vue publique", () => {
  const base: SentinelChainsResponse = { version: 1, generatedAt: "", chains: [], alerts: [alert({})] };
  assert.equal(isPublicSafe(base), true);
  assert.equal(isPublicSafe({ ...base, alerts: [alert({ exposure: "FUNDS_PRESENT" })] }), false);
});
