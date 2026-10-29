/**
 * WC-12 — quota fenêtré PUR, piloté par une horloge injectée.
 *
 * Invariants :
 * - aucun accès réseau, aucun timeout OS, aucune lecture d'horloge système ;
 * - l'attestation de provenance est EXPLICITE : SYNTHETIC (borne locale de test)
 *   ou UNATTESTED (limite fournisseur non prouvée) ;
 * - aucune autorisation LIVE n'est implémentée : même une config attestée avec
 *   source ne peut PAS accorder le réseau aujourd'hui (NO_LIVE_GRANT_IMPLEMENTED) ;
 * - une config UNATTESTED est fail-closed : elle n'invente aucune limite LI.FI ;
 * - SYNTHETIC utilise une fenêtre fixe locale, pas un quota rolling fournisseur ;
 * - état en mémoire par instance : redémarrer perd le quota, sans coordination distribuée.
 */
export type QuoteQuotaAttestation = "SYNTHETIC" | "UNATTESTED";

export interface QuoteQuotaPolicy {
  attestation: QuoteQuotaAttestation;
  /** Nombre d'admissions par fenêtre. */
  limit: number;
  /** Durée de fenêtre en millisecondes. */
  windowMs: number;
  /** Provenance de la limite si elle est prouvée ; `null` = non prouvée. */
  source: string | null;
}

export type QuotaAdmissionDecision = "ADMITTED" | "REFUSED_QUOTA_EXCEEDED" | "REFUSED_QUOTA_UNATTESTED" | "REFUSED_QUOTA_CLOCK_INVALID";

export interface QuoteQuotaWindow {
  admit(providerId: string): QuotaAdmissionDecision;
  used(providerId: string): number;
  policy(): Readonly<QuoteQuotaPolicy>;
}

export interface QuoteQuotaLiveDecision {
  authorized: boolean;
  reason: "NO_LIVE_GRANT_IMPLEMENTED";
}

const ATTESTATIONS: readonly string[] = ["SYNTHETIC", "UNATTESTED"];

export function validateQuotaPolicy(policy: QuoteQuotaPolicy): QuoteQuotaPolicy {
  const invalid = (): never => { throw new TypeError("INVALID_QUOTA_POLICY"); };
  if (!policy || typeof policy !== "object") invalid();
  if (!ATTESTATIONS.includes(policy.attestation)) invalid();
  if (!Number.isSafeInteger(policy.limit) || policy.limit <= 0) invalid();
  if (!Number.isFinite(policy.windowMs) || policy.windowMs <= 0) invalid();
  if (policy.source !== null && typeof policy.source !== "string") invalid();
  return { attestation: policy.attestation, limit: policy.limit, windowMs: policy.windowMs, source: policy.source };
}

/**
 * Aucune autorisation LIVE n'existe. Une config explicite ne remplace pas un
 * grant implémenté : la fonction refuse donc TOUJOURS.
 */
export function quotaAuthorizesLive(policy: QuoteQuotaPolicy): QuoteQuotaLiveDecision {
  validateQuotaPolicy(policy);
  return { authorized: false, reason: "NO_LIVE_GRANT_IMPLEMENTED" };
}

export function createQuotaWindow(policy: QuoteQuotaPolicy, clock: { now(): number }): QuoteQuotaWindow {
  const validated = validateQuotaPolicy(policy);
  const perProvider = new Map<string, { start: number; used: number }>();
  // L'horloge injectée est partagée par tous les providers de cette instance :
  // le repère monotone est donc global, même après un refus pour épuisement.
  let lastObservedAt = 0;

  const admit = (providerId: string): QuotaAdmissionDecision => {
    if (validated.attestation !== "SYNTHETIC") return "REFUSED_QUOTA_UNATTESTED";
    const now = clock.now();
    // Horloge invalide ou reculante : admission indisponible, sans consommation.
    if (!Number.isFinite(now) || now < lastObservedAt) return "REFUSED_QUOTA_CLOCK_INVALID";
    lastObservedAt = now;
    const entry = perProvider.get(providerId);
    if (!entry || now - entry.start >= validated.windowMs) {
      perProvider.set(providerId, { start: now, used: 1 });
      return "ADMITTED";
    }
    if (entry.used >= validated.limit) return "REFUSED_QUOTA_EXCEEDED";
    entry.used += 1;
    return "ADMITTED";
  };

  return {
    admit,
    used: (providerId) => perProvider.get(providerId)?.used ?? 0,
    policy: () => ({ ...validated }),
  };
}
