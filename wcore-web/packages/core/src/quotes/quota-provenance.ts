export type QuotaDocumentationStatus = "DOCUMENTED_EXPLICITLY" | "DOCUMENTED_BUT_SCOPE_UNKNOWN" | "NOT_DOCUMENTED" | "UNVERIFIED";
export type QuotaDocumentationWindow = "FIXED_ANCHORED_FIRST" | "ROLLING" | "CALENDAR" | "UNKNOWN";
export type QuotaDocumentationScope = "API_KEY" | "IP" | "ACCOUNT" | "GLOBAL" | "UNKNOWN";

export interface QuotaDocumentationTarget {
  readonly providerId: string;
  readonly endpoint: string;
  readonly endpointVersion: string;
  readonly tier: string;
  readonly window: QuotaDocumentationWindow;
}

export interface QuotaDocumentationEvidence extends Omit<QuotaDocumentationTarget, "window"> {
  readonly sourceUrl: string;
  readonly readAt: number;
  readonly expiresAt: number;
  readonly invalidated: boolean;
  readonly status: QuotaDocumentationStatus;
  readonly value: number;
  readonly unit: "request";
  readonly windowMs: number;
  readonly window: QuotaDocumentationWindow;
  readonly scope: QuotaDocumentationScope;
}

export interface QuotaProvenanceInput {
  readonly evidence?: QuotaDocumentationEvidence;
  readonly reviewedEvidence: ReadonlySet<QuotaDocumentationEvidence>;
  readonly target: QuotaDocumentationTarget;
  readonly now: number;
}

export interface QuotaProvenanceDecision {
  readonly status: QuotaDocumentationStatus;
  readonly documentationQualified: boolean;
  readonly reason: string;
  readonly enforcementApplicable: false;
  readonly authorized: false;
  readonly networkAccess: false;
}

/**
 * Contrat documentaire local, sans intégration au quota ni au control plane.
 * Racine de confiance : le code local de confiance charge et revoit les preuves,
 * vérifie notamment que sourceUrl est une source officielle, puis fournit leurs
 * références exactes gelées. Fournir soi-même le Set ne prouve aucune authenticité
 * distante. URL, boolean et hash utilisateur ne sont pas des attestations.
 * Tous les champs sont scalaires : Object.freeze empêche leur mutation après revue.
 * Horodatages en millisecondes ; expiresAt est une borne exclusive.
 */
export function evaluateQuotaProvenance(input: QuotaProvenanceInput): QuotaProvenanceDecision {
  const decision = (status: QuotaDocumentationStatus, reason: string, documentationQualified = false): QuotaProvenanceDecision => ({
    status, reason, documentationQualified, enforcementApplicable: false, authorized: false, networkAccess: false,
  });
  const e = input.evidence;
  if (!e) return decision("NOT_DOCUMENTED", "NO_EVIDENCE");
  if (!input.reviewedEvidence.has(e) || !Object.isFrozen(e)) return decision("UNVERIFIED", "UNTRUSTED_REFERENCE");
  const keys = ["providerId", "endpoint", "endpointVersion", "tier"] as const;
  if (keys.some((key) => typeof e[key] !== "string" || !e[key].trim())) return decision("UNVERIFIED", "INVALID_EVIDENCE");
  if (keys.some((key) => e[key] !== input.target[key])) return decision("UNVERIFIED", "IDENTITY_MISMATCH");
  let sourceIsHttps = false;
  try {
    const source = new URL(e.sourceUrl);
    sourceIsHttps = source.protocol === "https:" && !source.username && !source.password;
  } catch { /* URL absente ou malformée : fail-closed. */ }
  if (!sourceIsHttps || e.invalidated !== false || !Number.isFinite(input.now)
    || !Number.isFinite(e.readAt) || !Number.isFinite(e.expiresAt)
    || e.readAt > input.now || e.expiresAt <= e.readAt || input.now >= e.expiresAt
    || !Number.isSafeInteger(e.value) || e.value <= 0 || e.unit !== "request"
    || !Number.isSafeInteger(e.windowMs) || e.windowMs <= 0
    || !["FIXED_ANCHORED_FIRST", "ROLLING", "CALENDAR", "UNKNOWN"].includes(e.window)
    || !["API_KEY", "IP", "ACCOUNT", "GLOBAL", "UNKNOWN"].includes(e.scope)
    || !["DOCUMENTED_EXPLICITLY", "DOCUMENTED_BUT_SCOPE_UNKNOWN", "NOT_DOCUMENTED", "UNVERIFIED"].includes(e.status)) {
    return decision("UNVERIFIED", "INVALID_OR_STALE_EVIDENCE");
  }
  if (e.status === "NOT_DOCUMENTED" || e.status === "UNVERIFIED") return decision(e.status, "NO_EXPLICIT_DOCUMENTATION");
  if (e.status === "DOCUMENTED_BUT_SCOPE_UNKNOWN" || e.scope === "UNKNOWN" || e.window === "UNKNOWN") {
    return decision("DOCUMENTED_BUT_SCOPE_UNKNOWN", "SCOPE_OR_WINDOW_UNKNOWN");
  }
  return decision("DOCUMENTED_EXPLICITLY", e.window === input.target.window
    ? "DOCUMENTATION_QUALIFIED_NOT_ENFORCEMENT"
    : "DOCUMENTATION_QUALIFIED_WINDOW_MISMATCH_NOT_ENFORCEMENT", true);
}
