// Chain Sentinel — logique d'affichage pure (testable sans navigateur).

export type SentinelStatus = "ACTIVE" | "WINDING_DOWN" | "RETIRED" | "UNKNOWN";
export type SentinelSeverity = "P0" | "P1" | "P2";

export interface SentinelSourceView { url: string; publisher: string; publisherEn?: string | null; official: boolean }
export interface SentinelDeadlineView { kind: string; at: string; assets: string[] | null; countdownMs: number; sources: SentinelSourceView[] }
export interface SentinelChainView {
  chainKey: string; chainId: number; name: string; status: SentinelStatus; successorChainId: number | null;
  recoveryAfterShutdown: "AVAILABLE" | "PLANNED" | "NOT_AVAILABLE" | "UNKNOWN"; recoveryNote: string | null;
  recoveryNoteEn?: string | null;
  lastVerifiedAt: string; deadlines: SentinelDeadlineView[];
}
export interface SentinelAlertView {
  id?: string; chainKey: string; chainId: number; code: string; severity: SentinelSeverity;
  actionByMs: number | null; countdownMs: number | null; deadlineKind: string | null; conflict: boolean;
  officialSourceUrls: string[]; exposure: string; acknowledged?: boolean;
}
export interface SentinelChainsResponse { version: number; generatedAt: string; chains: SentinelChainView[]; alerts: SentinelAlertView[] }
export interface SentinelAlertsResponse { generatedAt: string; alerts: SentinelAlertView[]; pendingNotificationIds: string[] }
export interface SentinelHealthResponse { lastRunAt: string | null; lastSuccessAt: string | null; sourcesChecked: number; sourcesFailed: number; monitoring: { status: "OK" | "STALE"; severity?: SentinelSeverity } }

const DAY = 86400000, HOUR = 3600000, MIN = 60000;

export type SentinelLang = "fr" | "en";

/** Compte a rebours lisible ; une echeance passee l'indique explicitement. Francais par defaut. */
export function formatCountdown(ms: number | null, lang: SentinelLang = "fr"): string {
  if (ms === null || !Number.isFinite(ms)) return "—";
  const past = ms < 0;
  const a = Math.abs(ms);
  const d = Math.floor(a / DAY), h = Math.floor((a % DAY) / HOUR), m = Math.floor((a % HOUR) / MIN);
  const day = lang === "en" ? "d" : "j";
  const txt = d > 0 ? `${d} ${day} ${h} h` : h > 0 ? `${h} h ${m} min` : `${m} min`;
  if (lang === "en") return past ? `overdue by ${txt}` : `in ${txt}`;
  return past ? `dépassée depuis ${txt}` : `dans ${txt}`;
}

const STATUS_LABELS: Record<SentinelLang, Record<SentinelStatus, string>> = {
  fr: { ACTIVE: "Actif", WINDING_DOWN: "Fermeture annoncée", RETIRED: "Retiré", UNKNOWN: "Inconnu" },
  en: { ACTIVE: "Active", WINDING_DOWN: "Shutdown announced", RETIRED: "Retired", UNKNOWN: "Unknown" },
};

const CODE_LABELS: Record<SentinelLang, Record<string, string>> = {
  fr: {
    ACTION_REQUIRED_BEFORE_DEADLINE: "Action requise avant l'échéance",
    FUNDS_STRANDED_AFTER_SHUTDOWN: "Fonds bloqués après fermeture",
    EXPOSURE_UNKNOWN_AFTER_SHUTDOWN: "Exposition inconnue après fermeture",
    RECOVERY_WINDOW_OPEN: "Fenêtre de récupération ouverte",
    RECOVERY_PLANNED: "Récupération annoncée (non ouverte)",
    RETIRED_NO_EXPOSURE: "Réseau retiré, aucune exposition attestée",
    UNVERIFIED_ANNOUNCEMENT: "Annonce non vérifiée par une source officielle",
    SENTINEL_STALE: "Surveillance interrompue",
  },
  en: {
    ACTION_REQUIRED_BEFORE_DEADLINE: "Action required before the deadline",
    FUNDS_STRANDED_AFTER_SHUTDOWN: "Funds stranded after shutdown",
    EXPOSURE_UNKNOWN_AFTER_SHUTDOWN: "Exposure unknown after shutdown",
    RECOVERY_WINDOW_OPEN: "Recovery window open",
    RECOVERY_PLANNED: "Recovery announced (not open yet)",
    RETIRED_NO_EXPOSURE: "Network retired, no exposure attested",
    UNVERIFIED_ANNOUNCEMENT: "Announcement not verified by an official source",
    SENTINEL_STALE: "Monitoring interrupted",
  },
};

const DEADLINE_LABELS: Record<SentinelLang, Record<string, string>> = {
  fr: {
    NON_NATIVE_BRIDGE_LAST: "Dernier bridge (actifs non natifs)",
    BRIDGE_WITHDRAW_LAST: "Dernier retrait par bridge",
    UNSTAKE_LAST: "Dernier unstake",
    WITHDRAW_LAST: "Dernier retrait",
    NETWORK_SHUTDOWN: "Arrêt du réseau",
    CLAIM_END: "Fin de la réclamation",
  },
  en: {
    NON_NATIVE_BRIDGE_LAST: "Last bridge (non-native assets)",
    BRIDGE_WITHDRAW_LAST: "Last bridge withdrawal",
    UNSTAKE_LAST: "Last unstake",
    WITHDRAW_LAST: "Last withdrawal",
    NETWORK_SHUTDOWN: "Network shutdown",
    CLAIM_END: "End of claims",
  },
};

export type SentinelRecovery = SentinelChainView["recoveryAfterShutdown"];
const RECOVERY_LABELS: Record<SentinelLang, Record<SentinelRecovery, string>> = {
  fr: { AVAILABLE: "ouverte", PLANNED: "annoncée, non ouverte", NOT_AVAILABLE: "aucune", UNKNOWN: "non établie" },
  en: { AVAILABLE: "open", PLANNED: "announced, not open yet", NOT_AVAILABLE: "none", UNKNOWN: "not established" },
};

/** Libelles francais, conserves pour les appelants existants. */
export const STATUS_LABEL = STATUS_LABELS.fr;
export const CODE_LABEL = CODE_LABELS.fr;
export const DEADLINE_LABEL = DEADLINE_LABELS.fr;

export const statusLabel = (s: SentinelStatus, lang: SentinelLang): string => STATUS_LABELS[lang][s] ?? s;
/** Un code ou une echeance inconnus restent affiches tels quels. */
export const codeLabel = (code: string, lang: SentinelLang): string => CODE_LABELS[lang][code] ?? code;
export const deadlineLabel = (kind: string, lang: SentinelLang): string => DEADLINE_LABELS[lang][kind] ?? kind;
export const recoveryLabel = (r: SentinelRecovery, lang: SentinelLang): string => RECOVERY_LABELS[lang][r] ?? r;

const SENTINEL_TEXTS = {
  fr: {
    intro: "Fermetures et migrations de réseaux : échéances, sources officielles, exposition de votre portefeuille. Aucune transaction n'est jamais effectuée.",
    noSource: "aucune source",
    unofficial: " (non officielle)",
    conflictingDates: "dates contradictoires",
    acknowledged: "acquittée",
    exposure: "exposition",
    acknowledge: "Accuser réception",
    computedAt: (iso: string) => `Calculé le ${iso}`,
    criticalPersonal: "Alerte critique",
    criticalGeneral: "Alerte critique générale (exposition non vérifiée)",
    seeAlerts: "Voir les alertes",
    monitoringRegion: "État de la surveillance",
    monitoringChecking: "Surveillance : vérification…",
    monitoringUnknown: "Surveillance : état inconnu (service injoignable). Les échéances affichées peuvent être obsolètes.",
    monitoringStale: (last: string) => `Surveillance interrompue : dernier contrôle réussi ${last}. Les échéances affichées peuvent être obsolètes.`,
    never: "jamais",
    lastCheck: (last: string, checked: number, failed: number) => `Dernier contrôle automatique : ${last} · ${checked} source(s), ${failed} en échec.`,
    alertsTitle: "Alertes",
    signInForExposure: "Connectez-vous pour voir l'exposition de votre portefeuille ; les alertes ci-dessous sont générales.",
    personalUnavailable: "Alertes personnelles indisponibles pour le moment.",
    loading: "Chargement…",
    registryUnavailableAlerts: "Registre Chain Sentinel indisponible : impossible d'afficher les alertes. Ce n'est pas une absence d'alerte.",
    noAlerts: "Aucune alerte.",
    chainsTitle: "Chaînes surveillées",
    colNetwork: "Réseau",
    colStatus: "Statut",
    colNextDeadline: "Prochaine échéance",
    colSources: "Sources",
    successor: (id: number | string) => `successeur distinct ${id}`,
    registryUnavailable: "Registre indisponible.",
    retiredRegion: "Historique des chaînes retirées",
    retiredTitle: "Chaînes retirées et récupération",
    recovery: "Récupération",
    bellLabel: (n: number) => `${n} alerte(s) Chain Sentinel non acquittée(s)`,
  },
  en: {
    intro: "Network shutdowns and migrations: deadlines, official sources, exposure of your wallet. No transaction is ever made.",
    noSource: "no source",
    unofficial: " (unofficial)",
    conflictingDates: "conflicting dates",
    acknowledged: "acknowledged",
    exposure: "exposure",
    acknowledge: "Acknowledge",
    computedAt: (iso: string) => `Computed at ${iso}`,
    criticalPersonal: "Critical alert",
    criticalGeneral: "General critical alert (exposure not verified)",
    seeAlerts: "See alerts",
    monitoringRegion: "Monitoring status",
    monitoringChecking: "Monitoring: checking…",
    monitoringUnknown: "Monitoring: status unknown (service unreachable). The deadlines shown may be out of date.",
    monitoringStale: (last: string) => `Monitoring interrupted: last successful check ${last}. The deadlines shown may be out of date.`,
    never: "never",
    lastCheck: (last: string, checked: number, failed: number) => `Last automatic check: ${last} · ${checked} source(s), ${failed} failed.`,
    alertsTitle: "Alerts",
    signInForExposure: "Sign in to see your wallet's exposure; the alerts below are general.",
    personalUnavailable: "Personal alerts are unavailable for now.",
    loading: "Loading…",
    registryUnavailableAlerts: "Chain Sentinel registry unavailable: alerts cannot be shown. This does not mean there are no alerts.",
    noAlerts: "No alerts.",
    chainsTitle: "Monitored chains",
    colNetwork: "Network",
    colStatus: "Status",
    colNextDeadline: "Next deadline",
    colSources: "Sources",
    successor: (id: number | string) => `separate successor ${id}`,
    registryUnavailable: "Registry unavailable.",
    retiredRegion: "Retired chains history",
    retiredTitle: "Retired chains and recovery",
    recovery: "Recovery",
    bellLabel: (n: number) => `${n} unacknowledged Chain Sentinel alert(s)`,
  },
} satisfies Record<SentinelLang, Record<string, unknown>>;

export type SentinelText = (typeof SENTINEL_TEXTS)["fr"];
/** Textes de la page /sentinel, de la cloche et du badge, dans la langue du site. */
export function sentinelText(lang: SentinelLang): SentinelText {
  return SENTINEL_TEXTS[lang] ?? SENTINEL_TEXTS.fr;
}

export function severityClass(s: SentinelSeverity): string {
  return s === "P0" ? "border-red-500/60 bg-red-500/10 text-red-300" : s === "P1" ? "border-amber-500/60 bg-amber-500/10 text-amber-200" : "border-sky-500/40 bg-sky-500/10 text-sky-200";
}

export function statusClass(s: SentinelStatus): string {
  return s === "RETIRED" ? "bg-red-500/15 text-red-300" : s === "WINDING_DOWN" ? "bg-amber-500/15 text-amber-200" : s === "ACTIVE" ? "bg-emerald-500/15 text-emerald-300" : "bg-zinc-500/15 text-zinc-300";
}

const SEV_RANK: Record<SentinelSeverity, number> = { P0: 0, P1: 1, P2: 2 };
export function sortAlerts<T extends SentinelAlertView>(alerts: readonly T[]): T[] {
  return [...alerts].sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || (a.actionByMs ?? Infinity) - (b.actionByMs ?? Infinity));
}

/** Prochaine echeance future, ou derniere passee si toutes le sont. */
export function nextDeadline(chain: SentinelChainView): SentinelDeadlineView | null {
  const future = chain.deadlines.filter((d) => d.countdownMs > 0).sort((a, b) => a.countdownMs - b.countdownMs);
  if (future.length) return future[0] ?? null;
  return [...chain.deadlines].sort((a, b) => b.countdownMs - a.countdownMs)[0] ?? null;
}

export function normalizeKey(k: string): string { return String(k || "").trim().toLowerCase().replace(/[\s-]+/g, "_"); }

/** Index chainKey normalise -> chaine a risque (statut non ACTIVE). */
export function riskIndex(chains: readonly SentinelChainView[] | null | undefined): Map<string, SentinelChainView> {
  const m = new Map<string, SentinelChainView>();
  // Fail-safe : une reponse sans tableau ne doit jamais casser le rendu des cartes (ChainCard, scans).
  if (!Array.isArray(chains)) return m;
  for (const c of chains) if (c && typeof c.chainKey === "string" && c.status !== "ACTIVE") m.set(normalizeKey(c.chainKey), c);
  return m;
}

/** Valide la forme minimale de GET /api/sentinel/chains ; toute autre reponse = registre indisponible (null). */
export function asSentinelChainsResponse(json: unknown): SentinelChainsResponse | null {
  if (!json || typeof json !== "object") return null;
  const j = json as Partial<SentinelChainsResponse>;
  return Array.isArray(j.chains) && Array.isArray(j.alerts) ? (j as SentinelChainsResponse) : null;
}

const SEVERITIES: readonly string[] = ["P0", "P1", "P2"];
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isStrOrNull = (v: unknown) => v === null || typeof v === "string";
const isNumOrNull = (v: unknown) => v === null || (typeof v === "number" && Number.isFinite(v));
const isUrl = (v: unknown) => { if (typeof v !== "string") return false; try { new URL(v); return true; } catch { return false; } };

/** Champs d'une alerte effectivement lus par la cloche et la page /sentinel. */
function isAlertView(a: unknown): a is SentinelAlertView {
  return isObj(a) && typeof a.chainKey === "string" && typeof a.code === "string" && SEVERITIES.includes(a.severity as string)
    && isNumOrNull(a.actionByMs) && isStrOrNull(a.deadlineKind ?? null) && typeof a.exposure === "string"
    && Array.isArray(a.officialSourceUrls) && a.officialSourceUrls.every(isUrl)
    && (a.id === undefined || typeof a.id === "string")
    && (a.acknowledged === undefined || typeof a.acknowledged === "boolean")
    && (a.conflict === undefined || typeof a.conflict === "boolean");
}

/**
 * Valide GET /api/sentinel/alerts. Une seule alerte invalide rejette toute la reponse (null) :
 * l'ecarter en silence pourrait masquer une alerte P0 et simuler « aucune alerte ».
 */
export function asSentinelAlertsResponse(json: unknown): SentinelAlertsResponse | null {
  if (!isObj(json)) return null;
  const { alerts, pendingNotificationIds } = json;
  if (!Array.isArray(alerts) || !alerts.every(isAlertView)) return null;
  if (!Array.isArray(pendingNotificationIds) || !pendingNotificationIds.every((id) => typeof id === "string")) return null;
  return json as unknown as SentinelAlertsResponse;
}

/** Valide GET /api/sentinel/health ; toute autre reponse = etat de surveillance inconnu (null), jamais « sain ». */
export function asSentinelHealthResponse(json: unknown): SentinelHealthResponse | null {
  if (!isObj(json) || !isObj(json.monitoring)) return null;
  const m = json.monitoring;
  if (m.status !== "OK" && m.status !== "STALE") return null;
  if (m.severity !== undefined && !SEVERITIES.includes(m.severity as string)) return null;
  if (!isStrOrNull(json.lastRunAt) || !isStrOrNull(json.lastSuccessAt)) return null;
  const n = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  if (!n(json.sourcesChecked) || !n(json.sourcesFailed)) return null;
  return json as unknown as SentinelHealthResponse;
}

export type PrivateState = { status: "loading" } | { status: "anonymous" } | { status: "error" } | { status: "ok"; data: SentinelAlertsResponse };

/** Etat prive a partir de la reponse HTTP : 401 = visiteur ; erreur ou reponse invalide = indisponible, jamais « aucune alerte ». */
export function toPrivateState(httpStatus: number, json: unknown): PrivateState {
  if (httpStatus === 401) return { status: "anonymous" };
  if (httpStatus < 200 || httpStatus >= 300) return { status: "error" };
  const data = asSentinelAlertsResponse(json);
  return data ? { status: "ok", data } : { status: "error" };
}

/** Nombre de notifications a afficher sur la cloche (P0/P1 non acquittees). */
export function pendingCount(res: SentinelAlertsResponse | null): number {
  // Fail-safe : une reponse incomplete ne doit jamais faire planter la Sidebar (global error boundary).
  return res && Array.isArray(res.pendingNotificationIds) ? res.pendingNotificationIds.length : 0;
}

/** Garde de confidentialite : une vue publique ne doit jamais contenir d'exposition. */
export function isPublicSafe(res: SentinelChainsResponse): boolean {
  return res.alerts.every((a) => a.exposure === "AUTH_REQUIRED") && !JSON.stringify(res).includes("privateDetail");
}

/** Note de recuperation dans la langue de l'interface ; repli sur la note francaise. */
export function recoveryNoteFor(chain: Pick<SentinelChainView, "recoveryNote" | "recoveryNoteEn">, lang: "fr" | "en"): string | null {
  return (lang === "en" ? chain.recoveryNoteEn || chain.recoveryNote : chain.recoveryNote) || null;
}

/** Nom de la source dans la langue de l'interface ; repli sur le nom d'origine. */
export function sourcePublisherFor(source: Pick<SentinelSourceView, "publisher" | "publisherEn">, lang: "fr" | "en"): string {
  return (lang === "en" && source.publisherEn) || source.publisher;
}
