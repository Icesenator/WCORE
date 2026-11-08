// Chain Sentinel — logique d'affichage pure (testable sans navigateur).

export type SentinelStatus = "ACTIVE" | "WINDING_DOWN" | "RETIRED" | "UNKNOWN";
export type SentinelSeverity = "P0" | "P1" | "P2";

export interface SentinelSourceView { url: string; publisher: string; official: boolean }
export interface SentinelDeadlineView { kind: string; at: string; assets: string[] | null; countdownMs: number; sources: SentinelSourceView[] }
export interface SentinelChainView {
  chainKey: string; chainId: number; name: string; status: SentinelStatus; successorChainId: number | null;
  recoveryAfterShutdown: "AVAILABLE" | "PLANNED" | "NOT_AVAILABLE" | "UNKNOWN"; recoveryNote: string | null;
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

/** Compte a rebours lisible ; une echeance passee l'indique explicitement. */
export function formatCountdown(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "—";
  const past = ms < 0;
  const a = Math.abs(ms);
  const d = Math.floor(a / DAY), h = Math.floor((a % DAY) / HOUR), m = Math.floor((a % HOUR) / MIN);
  const txt = d > 0 ? `${d} j ${h} h` : h > 0 ? `${h} h ${m} min` : `${m} min`;
  return past ? `dépassée depuis ${txt}` : `dans ${txt}`;
}

export const STATUS_LABEL: Record<SentinelStatus, string> = {
  ACTIVE: "Actif", WINDING_DOWN: "Fermeture annoncée", RETIRED: "Retiré", UNKNOWN: "Inconnu",
};

export const CODE_LABEL: Record<string, string> = {
  ACTION_REQUIRED_BEFORE_DEADLINE: "Action requise avant l'échéance",
  FUNDS_STRANDED_AFTER_SHUTDOWN: "Fonds bloqués après fermeture",
  EXPOSURE_UNKNOWN_AFTER_SHUTDOWN: "Exposition inconnue après fermeture",
  RECOVERY_WINDOW_OPEN: "Fenêtre de récupération ouverte",
  RECOVERY_PLANNED: "Récupération annoncée (non ouverte)",
  RETIRED_NO_EXPOSURE: "Réseau retiré, aucune exposition attestée",
  UNVERIFIED_ANNOUNCEMENT: "Annonce non vérifiée par une source officielle",
  SENTINEL_STALE: "Surveillance interrompue",
};

export const DEADLINE_LABEL: Record<string, string> = {
  NON_NATIVE_BRIDGE_LAST: "Dernier bridge (actifs non natifs)",
  BRIDGE_WITHDRAW_LAST: "Dernier retrait par bridge",
  UNSTAKE_LAST: "Dernier unstake",
  WITHDRAW_LAST: "Dernier retrait",
  NETWORK_SHUTDOWN: "Arrêt du réseau",
  CLAIM_END: "Fin de la réclamation",
};

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
export function riskIndex(chains: readonly SentinelChainView[]): Map<string, SentinelChainView> {
  const m = new Map<string, SentinelChainView>();
  for (const c of chains) if (c.status !== "ACTIVE") m.set(normalizeKey(c.chainKey), c);
  return m;
}

/** Nombre de notifications a afficher sur la cloche (P0/P1 non acquittees). */
export function pendingCount(res: SentinelAlertsResponse | null): number {
  return res ? res.pendingNotificationIds.length : 0;
}

/** Garde de confidentialite : une vue publique ne doit jamais contenir d'exposition. */
export function isPublicSafe(res: SentinelChainsResponse): boolean {
  return res.alerts.every((a) => a.exposure === "AUTH_REQUIRED") && !JSON.stringify(res).includes("privateDetail");
}
