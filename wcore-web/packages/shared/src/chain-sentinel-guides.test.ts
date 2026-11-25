import { describe, it, expect } from "vitest";
import { VERIFIED_LIFECYCLE_REGISTRY } from "./chain-sentinel";
import { RECOVERY_GUIDES, recoveryGuideFor, recoveryGuideProblems, type RecoveryGuide } from "./chain-sentinel-guides";

describe("guides de recuperation", () => {
  it("chaque guide est bien forme : sources presentes, liens officiels, textes FR et EN", () => {
    for (const [key, g] of Object.entries(RECOVERY_GUIDES)) expect(recoveryGuideProblems(g), key).toEqual([]);
  });

  it("chaque guide vise une fiche du registre embarque et s'y applique (meme etat de recuperation)", () => {
    for (const key of Object.keys(RECOVERY_GUIDES)) {
      const rec = VERIFIED_LIFECYCLE_REGISTRY.find((r) => r.chainKey === key);
      expect(rec, key).toBeDefined();
      expect(recoveryGuideFor(rec!), key).toBe(RECOVERY_GUIDES[key]);
    }
  });

  it("couvre les fiches demandees", () => {
    for (const key of ["abstract", "sophon", "neon", "cronos_zkevm", "lisk", "blast", "gravity"]) expect(RECOVERY_GUIDES[key], key).toBeDefined();
  });

  it("une fiche dont l'etat de recuperation a change ne recoit pas le guide perime", () => {
    const lisk = VERIFIED_LIFECYCLE_REGISTRY.find((r) => r.chainKey === "lisk")!;
    expect(recoveryGuideFor({ ...lisk, recoveryAfterShutdown: "AVAILABLE" })).toBeNull();
    expect(recoveryGuideFor({ chainKey: "inconnue", recoveryAfterShutdown: "UNKNOWN" })).toBeNull();
    expect(recoveryGuideFor({ chainKey: "constructor", recoveryAfterShutdown: "UNKNOWN" })).toBeNull();
  });

  it("detecte une affirmation sans source, une source inconnue et un lien non officiel", () => {
    const bad: RecoveryGuide = {
      appliesWhen: "UNKNOWN", verifiedAt: "2026-11-25T00:00:00Z",
      links: [{ sourceId: "relay", labelFr: "Relais", labelEn: "Relay" }],
      steps: [{ fr: "Etape", en: "Step", sourceIds: [] }, { fr: "Autre", en: "Other", sourceIds: ["absente"] }],
      sources: { relay: { url: "https://example.org/", publisher: "Relais", official: false, retrievedAt: "2026-11-25T00:00:00Z" } },
    };
    const p = recoveryGuideProblems(bad);
    expect(p).toContain("unsourced: Etape");
    expect(p).toContain("unknown source absente");
    expect(p).toContain("unofficial link relay");
  });

  it("formule au conditionnel ou cite la source : aucune promesse de remboursement", () => {
    const text = JSON.stringify(RECOVERY_GUIDES).toLowerCase();
    for (const banned of ["garanti ", "guaranteed", "vous serez rembours", "will be refunded"]) expect(text.includes(banned), banned).toBe(false);
  });
});
