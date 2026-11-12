import { describe, it, expect } from "vitest";
import * as sentinel from "./chain-sentinel";
import {
  VERIFIED_LIFECYCLE_REGISTRY, classifyExposure, aggregateExposure, bindingDeadline, evaluateChain,
  diffAlerts, pendingNotifications, monitorHealthAlert, toPublicAlert, officialSourceCoverage, exposuresFromScans,
  type ChainLifecycleRecord, type ExposureInput,
} from "./chain-sentinel";

const H = 3600000, D = 24 * H;
const NOW = Date.parse("2026-11-07T12:00:00Z");
const official = (id: string) => ({ [id]: { url: `https://official.example/${id}`, publisher: "Official", official: true, retrievedAt: "2026-11-07T00:00:00Z" } });
const unofficial = (id: string) => ({ [id]: { url: `https://news.example/${id}`, publisher: "Aggregator", official: false, retrievedAt: "2026-11-07T00:00:00Z" } });
const native = (over: Partial<ExposureInput> = {}): ExposureInput => ({ chainKey: "x", kind: "NATIVE", asset: "NAT", covered: true, balance: 5, balanceObservedAt: NOW - H, ...over });
// Fixtures SYNTHETIQUES (dates fictives) : elles testent la logique, pas des faits reels.
function rec(over: Partial<ChainLifecycleRecord>): ChainLifecycleRecord {
  return { chainKey: "x", chainId: 1, name: "X", status: "WINDING_DOWN", deadlines: [], sources: official("s1"), recoveryAfterShutdown: "UNKNOWN", lastVerifiedAt: "2026-11-07T00:00:00Z", ...over };
}
const gravity = VERIFIED_LIFECYCLE_REGISTRY.find((r) => r.chainId === 1625)!;

describe("exposition", () => {
  it("prix manquant sans incidence ; cache ancien avec solde 0 = UNKNOWN, jamais SAFE", () => {
    expect(classifyExposure(native({ balance: 0, balanceObservedAt: NOW - 10 * H }), NOW)).toBe("UNKNOWN");
    expect(classifyExposure(native({ balance: 0, balanceObservedAt: NOW - H }), NOW)).toBe("ZERO_ATTESTED");
    expect(classifyExposure(native({ balance: null }), NOW)).toBe("UNKNOWN");
    expect(classifyExposure(native({ balanceObservedAt: null }), NOW)).toBe("UNKNOWN");
    expect(classifyExposure(native({ covered: false }), NOW)).toBe("NOT_COVERED");
    expect(classifyExposure(native({ balance: 3, balanceObservedAt: NOW - 30 * D }), NOW)).toBe("POSITIVE");
  });
  it("agregat : non couvert ou inconnu n est jamais sur", () => {
    expect(aggregateExposure(["ZERO_ATTESTED", "NOT_COVERED"])).toBe("UNKNOWN");
    expect(aggregateExposure(["ZERO_ATTESTED", "ZERO_ATTESTED"])).toBe("ZERO_ATTESTED");
    expect(aggregateExposure(["UNKNOWN", "POSITIVE"])).toBe("POSITIVE");
    expect(aggregateExposure([])).toBe("NOT_COVERED");
  });
});

describe("Gravity Alpha (registre verifie)", () => {
  it("fermeture passee avec G natif positif => P0 FUNDS_STRANDED, sources officielles, 1625 distinct de 127001", () => {
    const a = evaluateChain(gravity, [native({ chainKey: "gravity", asset: "G", balanceObservedAt: Date.parse("2026-11-01T08:44:09Z") })], NOW)!;
    expect(a.code).toBe("FUNDS_STRANDED_AFTER_SHUTDOWN");
    expect(a.severity).toBe("P0");
    expect(a.chainId).toBe(1625);
    expect(gravity.successorChainId).toBe(127001);
    expect(a.officialSourceUrls.every((u) => u.startsWith("https://help.galxe.com/"))).toBe(true);
    expect(a.countdownMs! < 0).toBe(true);
  });
  it("echeance Stargate (non-G) non contraignante pour une position G seule", () => {
    const bd = bindingDeadline(gravity, [native({ asset: "G" })], Date.parse("2026-10-20T00:00:00Z"))!;
    expect(bd.kind).toBe("BRIDGE_WITHDRAW_LAST");
    const bdUsdc = bindingDeadline(gravity, [native({ asset: "USDC", kind: "ERC20" })], Date.parse("2026-10-20T00:00:00Z"))!;
    expect(bdUsdc.kind).toBe("NON_NATIVE_BRIDGE_LAST");
  });
  it("recuperation non etablie : jamais RECOVERY_WINDOW_OPEN", () => {
    expect(gravity.recoveryAfterShutdown).toBe("UNKNOWN");
  });
});

describe("registre verifie (sources officielles lues le 2026-11-07)", () => {
  const get = (k: string) => VERIFIED_LIFECYCLE_REGISTRY.find((r) => r.chainKey === k)!;
  const pos = (asset: string) => [native({ asset, balanceObservedAt: NOW - H })];
  it("Abstract : arret 15/12/2026, echeance future a ~38 jours => P2, compte a rebours, source officielle", () => {
    const a = evaluateChain(get("abstract"), pos("ETH"), NOW)!;
    expect(a.code).toBe("ACTION_REQUIRED_BEFORE_DEADLINE");
    expect(a.severity).toBe("P2");
    expect(a.actionByMs).toBe(Date.parse("2026-12-15T00:00:00Z"));
    expect(a.officialSourceUrls).toEqual(["https://migrate.abs.xyz/"]);
  });
  it("Cronos zkEVM : retraits jusqu au 03/06/2027 03:00 UTC, aucune recuperation", () => {
    const r = get("cronos_zkevm");
    expect(r.recoveryAfterShutdown).toBe("NOT_AVAILABLE");
    expect(evaluateChain(r, pos("ETH"), NOW)!.actionByMs).toBe(Date.parse("2027-06-03T03:00:00Z"));
  });
  it("Lisk : reseau retire, reclamation manuelle PREVUE => P0 RECOVERY_PLANNED (pas RECOVERY_WINDOW_OPEN)", () => {
    const a = evaluateChain(get("lisk"), pos("ETH"), NOW)!;
    expect(a.code).toBe("RECOVERY_PLANNED");
    expect(a.severity).toBe("P0");
  });
  it("Blast : recuperation ouverte, echeance utile = fin de reclamation 04/11/2027", () => {
    const a = evaluateChain(get("blast"), pos("ETH"), NOW)!;
    expect(a.code).toBe("RECOVERY_WINDOW_OPEN");
    expect(a.deadlineKind).toBe("CLAIM_END");
    expect(a.actionByMs).toBe(Date.parse("2027-11-04T00:00:00Z"));
    expect(a.officialSourceUrls).toEqual(["https://x.com/blast/status/2117993462356197406"]);
  });
  it("Sophon : dates confirmees par le X officiel (19/10, 02/11) => retrait avant le 25/11, P1 a J-17,5", () => {
    const a = evaluateChain(get("sophon"), pos("SOPH"), NOW)!;
    expect(a.code).toBe("ACTION_REQUIRED_BEFORE_DEADLINE");
    expect(a.deadlineKind).toBe("WITHDRAW_LAST");
    expect(a.actionByMs).toBe(Date.parse("2026-11-25T00:00:00Z"));
    expect(a.severity).toBe("P1");
    expect(a.officialSourceUrls).toContain("https://x.com/Sophon/status/2112253258030882831");
  });
  it("Sophon : a J-5 du 25/11 avec un solde positif => P0", () => {
    const at = Date.parse("2026-11-20T00:00:00Z");
    const a = evaluateChain(get("sophon"), [native({ asset: "SOPH", balanceObservedAt: at - H })], at)!;
    expect(a.severity).toBe("P0");
  });
  it("couverture : les 6 chaines du registre ont une echeance de source officielle (Sophon confirme le 08/11)", () => {
    expect(officialSourceCoverage(["sophon", "abstract", "cronos_zkevm", "lisk", "blast", "gravity"]).withOfficialSource).toBe(6);
  });
  it("ZetaChain : arret vers le 09/12/2026, sortie des pools avant, reclamation seulement annoncee", () => {
    const r = get("zetachain");
    expect(r.chainId).toBe(7000);
    expect(r.recoveryAfterShutdown).toBe("PLANNED");
    const a = evaluateChain(r, pos("ZETA"), NOW)!;
    expect(a.code).toBe("ACTION_REQUIRED_BEFORE_DEADLINE");
    expect(a.actionByMs).toBe(Date.parse("2026-12-09T00:00:00Z"));
    expect(a.officialSourceUrls).toEqual(["https://www.zetachain.com/blog/zeta-moves-to-solana-dec-9"]);
    // Apres l'arret, la reclamation n'est qu'annoncee : jamais presentee comme ouverte.
    const after = Date.parse("2026-12-10T00:00:00Z");
    const b = evaluateChain(r, [native({ asset: "ZETA", balanceObservedAt: after - H })], after)!;
    expect(b.code).toBe("RECOVERY_PLANNED");
    expect(b.severity).toBe("P0");
  });
  it("Neon EVM : dernier retrait avant le 31/12/2026, aucune date d arret du reseau publiee", () => {
    const r = get("neon");
    expect(r.chainId).toBe(245022934);
    expect(r.deadlines.map((d) => d.kind)).toEqual(["WITHDRAW_LAST"]);
    const a = evaluateChain(r, pos("NEON"), NOW)!;
    expect(a.code).toBe("ACTION_REQUIRED_BEFORE_DEADLINE");
    expect(a.deadlineKind).toBe("WITHDRAW_LAST");
    expect(a.actionByMs).toBe(Date.parse("2026-12-31T00:00:00Z"));
    expect(a.officialSourceUrls).toEqual(["https://neonevm.org/"]);
  });
  it("Neon EVM : apres le 31/12, la sortie est tenue pour fermee (regle du module), jamais une recuperation ouverte", () => {
    // La source ne dit pas ce qui arrive apres la date : le module traite un dernier retrait passe comme une
    // sortie fermee. Fiche a relire sur la source officielle avant le 31/12/2026 (ROADMAP P1-CHAIN-CLOSURE-LEADS-20261112).
    const after = Date.parse("2027-01-02T00:00:00Z");
    const a = evaluateChain(get("neon"), [native({ asset: "NEON", balanceObservedAt: after - H })], after)!;
    expect(a.code).toBe("FUNDS_STRANDED_AFTER_SHUTDOWN");
    expect(a.deadlineKind).toBe("WITHDRAW_LAST");
    expect(a.code).not.toBe("RECOVERY_WINDOW_OPEN");
  });
  it("couverture : ZetaChain et Neon ont une echeance de source officielle", () => {
    expect(officialSourceCoverage(["zetachain", "neon"]).withOfficialSource).toBe(2);
  });
  it("aucune chaine du registre n a d identifiant en double, 1625 et 127001 distincts", () => {
    const ids = VERIFIED_LIFECYCLE_REGISTRY.map((r) => r.chainId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.includes(127001)).toBe(false);
  });
});

describe("scenarios synthetiques", () => {
  it("Abstract-like : echeance future a 20 jours => P1, compte a rebours positif", () => {
    const r = rec({ chainKey: "abstract", deadlines: [{ kind: "WITHDRAW_LAST", at: new Date(NOW + 20 * D).toISOString(), sourceIds: ["s1"] }] });
    const a = evaluateChain(r, [native()], NOW)!;
    expect(a.code).toBe("ACTION_REQUIRED_BEFORE_DEADLINE");
    expect(a.severity).toBe("P1");
    expect(a.countdownMs).toBe(20 * D);
  });
  it("Sophon-like : retrait avant l arret reseau => l echeance contraignante est le retrait", () => {
    const r = rec({ deadlines: [
      { kind: "NETWORK_SHUTDOWN", at: new Date(NOW + 40 * D).toISOString(), sourceIds: ["s1"] },
      { kind: "WITHDRAW_LAST", at: new Date(NOW + 5 * D).toISOString(), sourceIds: ["s1"] }] });
    const a = evaluateChain(r, [native()], NOW)!;
    expect(a.deadlineKind).toBe("WITHDRAW_LAST");
    expect(a.severity).toBe("P0");
  });
  it("Cronos zkEVM-like : retraits fermes, arret futur => fonds deja bloques (P0)", () => {
    const r = rec({ deadlines: [
      { kind: "BRIDGE_WITHDRAW_LAST", at: new Date(NOW - 2 * D).toISOString(), sourceIds: ["s1"] },
      { kind: "NETWORK_SHUTDOWN", at: new Date(NOW + 10 * D).toISOString(), sourceIds: ["s1"] }] });
    expect(evaluateChain(r, [native()], NOW)!.code).toBe("FUNDS_STRANDED_AFTER_SHUTDOWN");
  });
  it("Lisk/Blast-like : reseau retire avec recours officiel => RECOVERY_WINDOW_OPEN P0", () => {
    const r = rec({ status: "RETIRED", recoveryAfterShutdown: "AVAILABLE", deadlines: [{ kind: "NETWORK_SHUTDOWN", at: new Date(NOW - 30 * D).toISOString(), sourceIds: ["s1"] }] });
    const a = evaluateChain(r, [native()], NOW)!;
    expect(a.code).toBe("RECOVERY_WINDOW_OPEN");
    expect(a.severity).toBe("P0");
    expect(evaluateChain(r, [native({ balance: 0, balanceObservedAt: NOW - H })], NOW)!.code).toBe("RETIRED_NO_EXPOSURE");
  });
  it("panne RPC sans annonce : statut ACTIVE => aucune alerte", () => {
    expect(evaluateChain(rec({ status: "ACTIVE", deadlines: [] }), [native()], NOW)).toBeNull();
    expect(evaluateChain(rec({ status: "UNKNOWN" }), [native()], NOW)).toBeNull();
  });
  it("cache perime + solde inconnu apres fermeture => P1 EXPOSURE_UNKNOWN, pas RETIRED_NO_EXPOSURE", () => {
    const r = rec({ status: "RETIRED", deadlines: [{ kind: "NETWORK_SHUTDOWN", at: new Date(NOW - D).toISOString(), sourceIds: ["s1"] }] });
    const a = evaluateChain(r, [native({ balance: 0, balanceObservedAt: NOW - 3 * D })], NOW)!;
    expect(a.code).toBe("EXPOSURE_UNKNOWN_AFTER_SHUTDOWN");
  });
  it("staking avec deblocage de 7 jours : l action doit commencer 7 jours avant le dernier retrait", () => {
    const withdraw = NOW + 10 * D;
    const r = rec({ deadlines: [{ kind: "WITHDRAW_LAST", at: new Date(withdraw).toISOString(), sourceIds: ["s1"] }] });
    const a = evaluateChain(r, [native({ kind: "STAKING", unbondingDays: 7 })], NOW)!;
    expect(a.actionByMs).toBe(withdraw - 7 * D);
    expect(a.severity).toBe("P0");
  });
  it("annonces contradictoires officielles => echeance la plus proche + conflit signale", () => {
    const r = rec({ sources: { ...official("s1"), ...official("s2") }, deadlines: [
      { kind: "WITHDRAW_LAST", at: new Date(NOW + 20 * D).toISOString(), sourceIds: ["s1"] },
      { kind: "WITHDRAW_LAST", at: new Date(NOW + 12 * D).toISOString(), sourceIds: ["s2"] }] });
    const a = evaluateChain(r, [native()], NOW)!;
    expect(a.conflict).toBe(true);
    expect(a.actionByMs).toBe(NOW + 12 * D);
  });
  it("source non officielle seule => UNVERIFIED_ANNOUNCEMENT, jamais P0", () => {
    const r = rec({ sources: unofficial("n1"), deadlines: [{ kind: "WITHDRAW_LAST", at: new Date(NOW + 2 * D).toISOString(), sourceIds: ["n1"] }] });
    const a = evaluateChain(r, [native()], NOW)!;
    expect(a.code).toBe("UNVERIFIED_ANNOUNCEMENT");
    expect(a.severity).toBe("P1");
  });
});

describe("deduplication, notifications, surveillance", () => {
  const r = rec({ deadlines: [{ kind: "WITHDRAW_LAST", at: new Date(NOW + 3 * D).toISOString(), sourceIds: ["s1"] }] });
  it("meme alerte = inchangee ; date officielle mise a jour = DEADLINE_CHANGED, pas un doublon", () => {
    const a1 = evaluateChain(r, [native()], NOW)!;
    expect(diffAlerts([a1], [a1]).unchanged).toHaveLength(1);
    const r2 = { ...r, deadlines: [{ kind: "WITHDRAW_LAST" as const, at: new Date(NOW + 2 * D).toISOString(), sourceIds: ["s1"] }] };
    const a2 = evaluateChain(r2, [native()], NOW)!;
    const d = diffAlerts([a1], [a2]);
    expect(d.deadlineChanged).toHaveLength(1);
    expect(d.added).toHaveLength(0);
    expect(d.resolved).toHaveLength(0);
  });
  it("P0 non acquittee reste a notifier ; acquittee non", () => {
    const a = evaluateChain(r, [native()], NOW)!;
    expect(pendingNotifications([a], new Set())).toHaveLength(1);
    expect(pendingNotifications([a], new Set([a.id]))).toHaveLength(0);
  });
  it("surveillance jamais executee => P0 ; en retard => P1 ; a l heure => rien", () => {
    expect(monitorHealthAlert(null, NOW, H)!.severity).toBe("P0");
    expect(monitorHealthAlert(NOW - 3 * H, NOW, H)!.severity).toBe("P1");
    expect(monitorHealthAlert(NOW - H, NOW, H)).toBeNull();
  });
  it("alerte publique : aucune exposition, aucun detail de position", () => {
    const a = evaluateChain(gravity, [native({ asset: "G" })], NOW)!;
    const p = toPublicAlert(a) as Record<string, unknown>;
    expect(p.exposure).toBe("AUTH_REQUIRED");
    expect("privateDetail" in p).toBe(false);
    expect(JSON.stringify(p)).not.toMatch(/0x[0-9a-fA-F]{40}|balance/);
  });
  it("aucune operation wallet exposee par le module", () => {
    const names = Object.keys(sentinel).join(" ");
    expect(names).not.toMatch(/sign|send|transfer|bridge[A-Z]|swap|unstake[A-Z]|withdraw[A-Z]/);
  });
  it("couverture des sources officielles mesuree", () => {
    const c = officialSourceCoverage(["gravity", "base", "ethereum", "abstract"]);
    expect(c).toEqual({ monitored: 4, withOfficialSource: 2, ratio: 0.5 });
  });
});

describe("adaptateur scans -> expositions", () => {
  const scan = (chain: Record<string, unknown>) => ({ address: "x", requestedChains: [], chains: [chain], totals: {}, generatedAt: "2026-11-07T11:00:00Z", metrics: {} }) as never;
  const tok = (symbol: string, balance: number) => ({ contract: "c", symbol, name: symbol, decimals: 18, balance, priceEur: null, priceSource: null, valueEur: null, flags: [] });
  it("scan sain : natif positif => POSITIVE ; staking NOT_COVERED ; agregat jamais SAFE sans staking couvert", () => {
    const ex = exposuresFromScans([scan({ chainKey: "Abstract", native: tok("ETH", 0.5), tokens: [], errors: [], degraded: false, cachedAt: "2026-11-07T11:30:00Z" })], ["abstract"]);
    expect(ex.map((e) => e.kind)).toEqual(["NATIVE", "STAKING"]);
    expect(classifyExposure(ex[0]!, NOW)).toBe("POSITIVE");
    expect(aggregateExposure(ex.map((e) => classifyExposure(e, NOW)))).toBe("POSITIVE");
  });
  it("scan degrade avec solde 0 : jamais ZERO_ATTESTED", () => {
    const ex = exposuresFromScans([scan({ chainKey: "lisk", native: tok("ETH", 0), tokens: [], errors: [{}], degraded: true, cachedAt: "2026-11-07T11:30:00Z" })], ["lisk"]);
    expect(classifyExposure(ex[0]!, NOW)).toBe("UNKNOWN");
  });
  it("scan sain solde 0 recent mais staking non couvert => agregat UNKNOWN (pas de faux SAFE)", () => {
    const ex = exposuresFromScans([scan({ chainKey: "blast", native: tok("ETH", 0), tokens: [], errors: [], degraded: false, cachedAt: "2026-11-07T11:30:00Z" })], ["blast"]);
    expect(aggregateExposure(ex.map((e) => classifyExposure(e, NOW)))).toBe("UNKNOWN");
  });
  it("chaine non demandee ignoree", () => {
    expect(exposuresFromScans([scan({ chainKey: "base", native: tok("ETH", 1), tokens: [], errors: [], degraded: false, cachedAt: null })], ["abstract"])).toEqual([]);
  });
});
