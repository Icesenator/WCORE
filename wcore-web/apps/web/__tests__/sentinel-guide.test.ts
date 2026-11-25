import { test } from "node:test";
import assert from "node:assert/strict";
import {
  alertAnchorId, alertGroup, guideText, opensAtLabel, recoveryGuideView, sentinelText, upcomingTimeline,
  type SentinelChainView,
} from "../lib/sentinel-view";

const D = 86400000;
const NOW = Date.parse("2026-11-25T06:00:00Z");
const src = { url: "https://blast.io/", publisher: "Blast (site officiel)", publisherEn: "Blast (official site)", official: true };
const guide = {
  links: [{ ...src, labelFr: "Site de récupération", labelEn: "Recovery site" }],
  steps: [{ fr: "Vérifier l'adresse.", en: "Check the address.", sources: [src] }],
  eligibility: [], feesAndRisks: [{ fr: "Ne jamais saisir la phrase secrète.", en: "Never type the seed phrase.", sources: [src] }],
  opensAt: null, verifiedAt: "2026-11-25T05:50:00Z",
};
const chain = (over: Partial<SentinelChainView> = {}): SentinelChainView => ({
  chainKey: "blast", chainId: 81457, name: "Blast", status: "RETIRED", successorChainId: null, recoveryAfterShutdown: "AVAILABLE",
  recoveryNote: null, lastVerifiedAt: "2026-11-07T12:24:00Z", deadlines: [], ...over,
});

test("recoveryGuideView : guide valide lu, absent ou ancien format = null", () => {
  const g = recoveryGuideView(chain({ recoveryGuide: guide }));
  assert.ok(g);
  assert.equal(g.links[0]!.url, "https://blast.io/");
  assert.equal(g.steps.length, 1);
  assert.equal(recoveryGuideView(chain()), null);
  assert.equal(recoveryGuideView(chain({ recoveryGuide: null })), null);
  assert.equal(recoveryGuideView(undefined), null);
});

test("recoveryGuideView : un lien non https, non officiel ou une etape sans source ecartent tout le guide", () => {
  assert.equal(recoveryGuideView(chain({ recoveryGuide: { ...guide, links: [{ ...guide.links[0], url: "javascript:alert(1)" }] } })), null);
  assert.equal(recoveryGuideView(chain({ recoveryGuide: { ...guide, links: [{ ...guide.links[0], url: "http://blast.io/" }] } })), null);
  assert.equal(recoveryGuideView(chain({ recoveryGuide: { ...guide, links: [{ ...guide.links[0], official: false }] } })), null);
  assert.equal(recoveryGuideView(chain({ recoveryGuide: { ...guide, steps: [{ fr: "x", en: "x", sources: [] }] } })), null);
  assert.equal(recoveryGuideView(chain({ recoveryGuide: { ...guide, steps: [] } })), null);
  assert.equal(recoveryGuideView(chain({ recoveryGuide: { ...guide, opensAt: { at: "pas une date", sources: [src] } } })), null);
  assert.equal(recoveryGuideView(chain({ recoveryGuide: { ...guide, opensAt: { at: "2027-01-01T00:00:00Z", sources: [] } } })), null);
});

test("guideText et opensAtLabel suivent la langue, libelle publie prioritaire", () => {
  assert.equal(guideText({ fr: "Bonjour", en: "Hello" }, "en"), "Hello");
  assert.equal(guideText({ fr: "Bonjour", en: "" }, "en"), "Bonjour");
  assert.equal(opensAtLabel({ at: "2027-01-01T00:00:00Z", approximate: true, labelFr: "janvier 2027", labelEn: "January 2027" }, "fr"), "janvier 2027");
  assert.equal(opensAtLabel({ at: "2027-01-01T00:00:00Z", approximate: true, labelFr: "janvier 2027", labelEn: "January 2027" }, "en"), "January 2027");
  assert.match(opensAtLabel({ at: "2027-01-01T00:00:00Z", approximate: true }, "fr"), /vers le 2027-01-01/);
});

test("alertGroup : chaine fermee sans echeance a venir = closed ; echeance future, recuperation ou P0 = now", () => {
  const past = [{ kind: "NETWORK_SHUTDOWN", at: "2026-07-31T00:00:00Z", assets: null, countdownMs: -1, sources: [] }];
  const future = [{ kind: "NETWORK_SHUTDOWN", at: "2026-11-30T00:00:00Z", assets: null, countdownMs: 1, sources: [] }];
  assert.equal(alertGroup({ actionByMs: null, code: "EXPOSURE_UNKNOWN_AFTER_SHUTDOWN", severity: "P1" }, chain({ deadlines: past }), NOW), "closed");
  // Sophon : retraits clos mais arret du reseau a venir -> encore « maintenant ».
  assert.equal(alertGroup({ actionByMs: null, code: "EXPOSURE_UNKNOWN_AFTER_SHUTDOWN", severity: "P1" }, chain({ deadlines: [...past, ...future] }), NOW), "now");
  assert.equal(alertGroup({ actionByMs: null, code: "RECOVERY_PLANNED", severity: "P1" }, chain({ deadlines: past }), NOW), "now");
  assert.equal(alertGroup({ actionByMs: null, code: "RECOVERY_WINDOW_OPEN", severity: "P0" }, chain({ deadlines: past }), NOW), "now");
  assert.equal(alertGroup({ actionByMs: null, code: "EXPOSURE_UNKNOWN_AFTER_SHUTDOWN", severity: "P0" }, chain({ deadlines: past }), NOW), "now");
  assert.equal(alertGroup({ actionByMs: null, code: "FUNDS_STRANDED_AFTER_SHUTDOWN", severity: "P1" }, chain({ deadlines: past }), NOW), "now");
  assert.equal(alertGroup({ actionByMs: null, code: "EXPOSURE_UNKNOWN_AFTER_SHUTDOWN", severity: "P1" }, undefined, NOW), "now");
  // Echeance future portee par l'alerte, fiche en cache plus ancienne (echeances passees) : jamais repliee.
  assert.equal(alertGroup({ actionByMs: NOW + D, code: "RETIRED_NO_EXPOSURE", severity: "P2" }, chain({ deadlines: past }), NOW), "now");
});

test("alertAnchorId : ancre stable, sans caractere hors [a-z0-9_]", () => {
  assert.equal(alertAnchorId("cronos_zkevm"), "alerte-cronos_zkevm");
  assert.equal(alertAnchorId("Neon EVM"), "alerte-neon_evm");
  assert.equal(alertAnchorId("a\"><b"), "alerte-ab");
});

test("upcomingTimeline : echeances futures sous 90 j, triees, dedoublonnees, avec l'ouverture annoncee d'un guide", () => {
  const dl = (kind: string, at: string) => ({ kind, at, assets: null, countdownMs: 0, sources: [] });
  const chains = [
    chain({ chainKey: "abstract", name: "Abstract", deadlines: [dl("WITHDRAW_LAST", "2026-12-15T00:00:00Z"), dl("NETWORK_SHUTDOWN", "2026-12-15T00:00:00Z"), dl("NETWORK_SHUTDOWN", "2026-12-15T00:00:00Z")] }),
    chain({ chainKey: "sophon", name: "Sophon", deadlines: [dl("WITHDRAW_LAST", "2026-11-25T00:00:00Z"), dl("NETWORK_SHUTDOWN", "2026-11-30T00:00:00Z")] }),
    chain({ chainKey: "cronos_zkevm", name: "Cronos zkEVM", deadlines: [dl("NETWORK_SHUTDOWN", "2027-06-03T03:00:00Z")] }),
    chain({ chainKey: "lisk", name: "Lisk", deadlines: [], recoveryGuide: { ...guide, opensAt: { at: "2027-01-01T00:00:00Z", approximate: true, labelFr: "janvier 2027", labelEn: "January 2027", sources: [src] } } }),
  ];
  const t = upcomingTimeline(chains, NOW);
  assert.deepEqual(t.map((e) => `${e.chainKey}:${e.kind}`), ["sophon:NETWORK_SHUTDOWN", "abstract:WITHDRAW_LAST", "abstract:NETWORK_SHUTDOWN", "lisk:RECOVERY_OPENS"]);
  assert.equal(t.at(-1)!.labelFr, "janvier 2027");
  assert.ok(t.every((e) => e.atMs > NOW && e.atMs <= NOW + 90 * D));
  assert.deepEqual(upcomingTimeline(null, NOW), []);
});

test("textes du guide presents en francais et en anglais", () => {
  for (const lang of ["fr", "en"] as const) {
    const tx = sentinelText(lang);
    assert.ok(tx.guideTitle && tx.groupNow && tx.copyLink && tx.timelineTitle && tx.recoveryOpens);
    assert.ok(tx.groupClosed(3).includes("3"));
  }
  assert.equal(sentinelText("fr").guideTitle, "Comment récupérer mes fonds");
});
