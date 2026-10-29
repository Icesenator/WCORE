/**
 * WCORE — Portfolio Health : libellés d'affichage (PUR, sans UI).
 *
 * Objectif : donner à l'UI un vocabulaire unique, déterministe et non
 * trompeur, sans qu'aucun composant n'ait à réinterpréter les états.
 *
 * Contrat :
 * - UNKNOWN n'est jamais présenté comme une erreur ni comme un zéro ;
 * - une valeur partielle garde son montant connu et porte un qualificatif ;
 * - une valeur absente n'est jamais formatée en 0,00 € ;
 * - la fraîcheur est un marqueur distinct de l'état, jamais un état inventé.
 */
import type { HealthState } from "./portfolio-health";

export type HealthTone = "ok" | "warn" | "error" | "neutral";

export interface HealthBadge {
  readonly label: string;
  readonly tone: HealthTone;
  /** true seulement si la source a été évaluée stale (jamais par défaut). */
  readonly staleMarked: boolean;
}

const LABELS: Record<HealthState, { label: string; tone: HealthTone }> = {
  KNOWN: { label: "OK", tone: "ok" },
  PARTIAL: { label: "Partiel", tone: "warn" },
  DEGRADED: { label: "Dégradé", tone: "warn" },
  ERROR: { label: "Erreur", tone: "error" },
  UNKNOWN: { label: "Inconnu", tone: "neutral" },
  NOT_SCANNED: { label: "Non scanné", tone: "neutral" },
};

export function healthBadge(state: HealthState, stale: boolean | null): HealthBadge {
  const base = LABELS[state];
  const isStale = stale === true;
  return {
    label: isStale ? `${base.label} · périmé` : base.label,
    tone: isStale ? "warn" : base.tone,
    staleMarked: isStale,
  };
}

export type HealthValueQualifier = "COMPLET" | "PARTIEL" | "AUCUNE_VALEUR";

export interface HealthValueLabel {
  /** null quand aucune valeur n'est connue : jamais "0,00 €". */
  readonly text: string | null;
  readonly qualifier: HealthValueQualifier;
}

const EUR = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});

export function healthValueLabel(knownValueEur: number | null, valueComplete: boolean): HealthValueLabel {
  if (knownValueEur === null || !Number.isFinite(knownValueEur)) {
    return { text: null, qualifier: "AUCUNE_VALEUR" };
  }
  return {
    text: EUR.format(knownValueEur),
    qualifier: valueComplete ? "COMPLET" : "PARTIEL",
  };
}

export interface HealthTotalsLabel {
  readonly valueText: string | null;
  readonly valueQualifier: HealthValueQualifier;
  /** null quand la fraîcheur n'a pas été évaluée (aucun seuil fourni). */
  readonly staleText: string | null;
}

export function healthTotalsLabel(input: {
  readonly knownValueEur: number | null;
  readonly valueComplete: boolean;
  readonly staleEvaluated: boolean;
  readonly staleSources: number | null;
}): HealthTotalsLabel {
  const value = healthValueLabel(input.knownValueEur, input.valueComplete);
  return {
    valueText: value.text,
    valueQualifier: value.qualifier,
    staleText: !input.staleEvaluated || input.staleSources === null
      ? null
      : input.staleSources === 0
        ? "aucune source périmée"
        : `${input.staleSources} source(s) périmée(s)`,
  };
}
