import { describe, it, expect } from "vitest";
import { healthBadge, healthValueLabel, healthTotalsLabel } from "./portfolio-health-view";

describe("health badge", () => {
  it("keeps UNKNOWN neutral, never an error", () => {
    expect(healthBadge("UNKNOWN", null)).toEqual({ label: "Inconnu", tone: "neutral", staleMarked: false });
  });

  it("shows ERROR as an error without claiming freshness", () => {
    expect(healthBadge("ERROR", null)).toEqual({ label: "Erreur", tone: "error", staleMarked: false });
  });

  it("marks staleness separately from the state", () => {
    expect(healthBadge("KNOWN", true)).toEqual({ label: "OK · périmé", tone: "warn", staleMarked: true });
    expect(healthBadge("KNOWN", null).staleMarked).toBe(false);
    expect(healthBadge("KNOWN", false).staleMarked).toBe(false);
  });
});

describe("health value label", () => {
  it("never formats a missing value as zero", () => {
    expect(healthValueLabel(null, false)).toEqual({ text: null, qualifier: "AUCUNE_VALEUR" });
  });

  it("keeps the known amount but qualifies it when incomplete", () => {
    const partial = healthValueLabel(2000, false);
    expect(partial.text).toContain("2");
    expect(partial.text).toContain("€");
    expect(partial.qualifier).toBe("PARTIEL");
    expect(healthValueLabel(2000, true).qualifier).toBe("COMPLET");
  });
});

describe("health totals label", () => {
  it("leaves staleness unlabelled when it was not evaluated", () => {
    const label = healthTotalsLabel({ knownValueEur: 2000, valueComplete: true, staleEvaluated: false, staleSources: null });
    expect(label.staleText).toBeNull();
    expect(label.valueQualifier).toBe("COMPLET");
  });

  it("counts stale sources only from an evaluated projection", () => {
    expect(healthTotalsLabel({ knownValueEur: 2000, valueComplete: true, staleEvaluated: true, staleSources: 0 }).staleText).toBe("aucune source périmée");
    expect(healthTotalsLabel({ knownValueEur: 2000, valueComplete: true, staleEvaluated: true, staleSources: 2 }).staleText).toBe("2 source(s) périmée(s)");
  });
});
