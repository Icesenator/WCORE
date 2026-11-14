/**
 * Chain Sentinel — detection anticipee des fermetures et migrations de reseaux.
 *
 * Module metier pur (aucun reseau, aucune operation wallet) partage par l'API
 * (job serveur periodique) et le Web (rubrique « Chain Sentinel », badges).
 *
 * Invariants :
 * - une exposition n'est jamais declaree nulle sur la base d'un prix manquant
 *   ou d'un cache ancien : seul un solde 0 observe recemment vaut ZERO_ATTESTED ;
 * - une panne RPC ne change pas le statut de cycle de vie (seules des sources
 *   officielles le font) ;
 * - une alerte publique ne contient ni montant, ni adresse, ni position.
 */

import type { ScanResult as _ScanResultForAdapter } from "./scan-result";
export const LIFECYCLE_STATUSES = ["ACTIVE", "WINDING_DOWN", "RETIRED", "UNKNOWN"] as const;
export type LifecycleStatus = (typeof LIFECYCLE_STATUSES)[number];

export const DEADLINE_KINDS = [
  "NON_NATIVE_BRIDGE_LAST",
  "BRIDGE_WITHDRAW_LAST",
  "UNSTAKE_LAST",
  "WITHDRAW_LAST",
  "NETWORK_SHUTDOWN",
  "CLAIM_END",
] as const;
export type DeadlineKind = (typeof DEADLINE_KINDS)[number];

export interface SourceRef {
  url: string;
  publisher: string;
  /** Libelle anglais de la source, quand il differe (interface anglaise). */
  publisherEn?: string;
  /** true seulement pour un canal officiel du projet (site, docs, compte officiel). */
  official: boolean;
  retrievedAt: string;
  /** Empreinte du contenu lu, pour detecter une mise a jour de l'annonce. */
  contentSha256?: string;
}

export interface DeadlineFact {
  kind: DeadlineKind;
  /** ISO 8601 UTC. */
  at: string;
  sourceIds: string[];
  /** Actifs concernes (ex. ["G"], ["USDC", "USDT", "ETH"]) ; vide = tous. */
  assets?: string[];
}

export interface ChainLifecycleRecord {
  chainKey: string;
  chainId: number;
  name: string;
  status: LifecycleStatus;
  /** Reseau successeur eventuel : jamais fusionne automatiquement. */
  successorChainId?: number;
  deadlines: DeadlineFact[];
  sources: Record<string, SourceRef>;
  /** PLANNED = procedure officielle annoncee mais pas encore ouverte (aucune garantie). */
  recoveryAfterShutdown: "AVAILABLE" | "PLANNED" | "NOT_AVAILABLE" | "UNKNOWN";
  /** Precision libre et sourcee (ex. « reclamation manuelle prevue en janvier 2027 »). */
  recoveryNote?: string;
  /** Meme precision en anglais (interface anglaise) ; absente = la note francaise sert. */
  recoveryNoteEn?: string;
  lastVerifiedAt: string;
}

// ---------------------------------------------------------------------------
// Registre verifie (source officielle uniquement). Toute autre chaine = absente.
// ---------------------------------------------------------------------------
export const VERIFIED_LIFECYCLE_REGISTRY: readonly ChainLifecycleRecord[] = [
  {
    chainKey: "gravity",
    chainId: 1625,
    name: "Gravity Alpha Mainnet",
    status: "RETIRED",
    successorChainId: 127001,
    deadlines: [
      { kind: "NON_NATIVE_BRIDGE_LAST", at: "2026-10-23T00:00:00Z", sourceIds: ["galxe-l1-live"], assets: ["USDT", "USDC", "ETH"] },
      { kind: "BRIDGE_WITHDRAW_LAST", at: "2026-10-26T03:00:00Z", sourceIds: ["galxe-l1-live", "galxe-bridge-g"], assets: ["G"] },
      { kind: "UNSTAKE_LAST", at: "2026-10-26T03:00:00Z", sourceIds: ["galxe-l1-live"], assets: ["G"] },
      { kind: "NETWORK_SHUTDOWN", at: "2026-11-01T00:00:00Z", sourceIds: ["galxe-l1-live"] },
    ],
    sources: {
      "galxe-l1-live": { url: "https://help.galxe.com/en/articles/16010489-gravity-l1-mainnet-is-now-live", publisher: "Galxe Help Center", official: true, retrievedAt: "2026-11-07T11:40:00Z" },
      "galxe-bridge-g": { url: "https://help.galxe.com/en/articles/16305612-how-to-bridge-g-tokens-from-gravity-alpha-to-gravity-l1-mainnet", publisher: "Galxe Help Center", official: true, retrievedAt: "2026-11-07T11:42:00Z" },
    },
    recoveryAfterShutdown: "UNKNOWN",
    lastVerifiedAt: "2026-11-07T11:42:00Z",
  },
  {
    chainKey: "abstract",
    chainId: 2741,
    name: "Abstract",
    status: "WINDING_DOWN",
    // Heure non precisee par la source : debut de journee UTC retenu (lecture la plus prudente).
    deadlines: [
      { kind: "WITHDRAW_LAST", at: "2026-12-15T00:00:00Z", sourceIds: ["abs-migrate"] },
      { kind: "NETWORK_SHUTDOWN", at: "2026-12-15T00:00:00Z", sourceIds: ["abs-migrate"] },
    ],
    sources: {
      "abs-migrate": { url: "https://migrate.abs.xyz/", publisher: "Abstract (Migration Hub officiel)", publisherEn: "Abstract (official Migration Hub)", official: true, retrievedAt: "2026-11-07T12:25:00Z" },
    },
    recoveryAfterShutdown: "NOT_AVAILABLE",
    recoveryNote: "« Any users that do not migrate their assets by this date will lose access to their funds » ; bridge natif ~3 h.",
    recoveryNoteEn: "“Any users that do not migrate their assets by this date will lose access to their funds”; native bridge takes about 3 h.",
    lastVerifiedAt: "2026-11-07T12:25:00Z",
  },
  {
    chainKey: "cronos_zkevm",
    chainId: 388,
    name: "Cronos zkEVM Alpha",
    status: "WINDING_DOWN",
    deadlines: [
      { kind: "WITHDRAW_LAST", at: "2027-06-03T03:00:00Z", sourceIds: ["cronos-blog"] },
      { kind: "NETWORK_SHUTDOWN", at: "2027-06-03T03:00:00Z", sourceIds: ["cronos-blog"] },
    ],
    sources: {
      "cronos-blog": { url: "https://blog.cronos.com/p/sunsetting-the-cronos-zkevm-alpha", publisher: "Cronos Labs (blog officiel)", publisherEn: "Cronos Labs (official blog)", official: true, retrievedAt: "2026-11-07T12:20:00Z" },
    },
    recoveryAfterShutdown: "NOT_AVAILABLE",
    recoveryNote: "Assets remaining after the final shutdown will not be recoverable (blog officiel). Depots desactives.",
    recoveryNoteEn: "Assets remaining after the final shutdown will not be recoverable (official blog). Deposits disabled.",
    lastVerifiedAt: "2026-11-07T12:20:00Z",
  },
  {
    chainKey: "lisk",
    chainId: 1135,
    name: "Lisk Chain (L2)",
    status: "RETIRED",
    deadlines: [{ kind: "NETWORK_SHUTDOWN", at: "2026-11-02T00:00:00Z", sourceIds: ["lisk-blog"] }],
    sources: {
      "lisk-blog": { url: "https://lisk.com/blog/posts/lisk-chain-has-closed", publisher: "Lisk (blog officiel)", publisherEn: "Lisk (official blog)", official: true, retrievedAt: "2026-11-07T12:22:00Z" },
    },
    recoveryAfterShutdown: "PLANNED",
    recoveryNote: "Portal et Bridge fermes le 02/11/2026 ; « manual claims process in January 2027 », details a venir, aucune garantie.",
    recoveryNoteEn: "Portal and Bridge closed on 2026-11-02; “manual claims process in January 2027”, details to come, no guarantee.",
    lastVerifiedAt: "2026-11-07T12:22:00Z",
  },
  {
    chainKey: "blast",
    chainId: 81457,
    name: "Blast",
    status: "RETIRED",
    deadlines: [
      { kind: "BRIDGE_WITHDRAW_LAST", at: "2026-10-26T00:00:00Z", sourceIds: ["theblock-blast"] },
      // L annonce officielle « has been shut down » date au plus tard du 04/11/2026.
      { kind: "NETWORK_SHUTDOWN", at: "2026-11-04T00:00:00Z", sourceIds: ["blast-x-recovery"] },
      { kind: "CLAIM_END", at: "2027-11-04T00:00:00Z", sourceIds: ["blast-x-recovery"], assets: ["ETH", "USD", "USDB", "WETH"] },
    ],
    sources: {
      "blast-x-recovery": { url: "https://x.com/blast/status/2117993462356197406", publisher: "Blast (compte X officiel)", publisherEn: "Blast (official X account)", official: true, retrievedAt: "2026-11-07T12:24:00Z" },
      "theblock-blast": { url: "https://x.com/TheBlockCo/status/2106037806795817420", publisher: "The Block (relais)", publisherEn: "The Block (relay)", official: false, retrievedAt: "2026-11-07T12:24:00Z" },
    },
    recoveryAfterShutdown: "AVAILABLE",
    recoveryNote: "Site de recuperation sur Ethereum, actif 12 mois, support final le 04/11/2027 (ETH/USD, retraits en attente, Blast Mobile).",
    recoveryNoteEn: "Recovery site on Ethereum, live for 12 months, final support on 2027-11-04 (ETH/USD, pending withdrawals, Blast Mobile).",
    lastVerifiedAt: "2026-11-07T12:24:00Z",
  },
  {
    chainKey: "sophon",
    chainId: 50104,
    name: "Sophon",
    status: "WINDING_DOWN",
    // 2026-11-08 : dates confirmees par le compte X officiel @Sophon (fil 1/4-4/4 du 19/10/2026, rappel du 02/11/2026,
    // post epingle du 22/10/2026). Le guide docs (« no fixed shutdown date yet ») est anterieur et ne contredit pas.
    // Heure non precisee : debut de journee UTC retenu (lecture la plus prudente). Chain ID 50104 verifie (eth_chainId 0xc3b8).
    deadlines: [
      { kind: "WITHDRAW_LAST", at: "2026-11-25T00:00:00Z", sourceIds: ["sophon-x-timeline", "sophon-x-reminder"] },
      { kind: "NETWORK_SHUTDOWN", at: "2026-11-30T00:00:00Z", sourceIds: ["sophon-x-timeline", "sophon-x-reminder"] },
    ],
    sources: {
      "sophon-x-timeline": { url: "https://x.com/Sophon/status/2112253258030882831", publisher: "Sophon (compte X officiel, fil du 19/10/2026)", publisherEn: "Sophon (official X account, thread of 2026-10-19)", official: true, retrievedAt: "2026-11-08T18:45:00Z" },
      "sophon-x-reminder": { url: "https://x.com/Sophon/status/2117352374679244928", publisher: "Sophon (compte X officiel, rappel du 02/11/2026)", publisherEn: "Sophon (official X account, reminder of 2026-11-02)", official: true, retrievedAt: "2026-11-08T18:47:00Z" },
      "sophon-docs": { url: "https://docs.sophon.xyz/migration", publisher: "Sophon Documentation (officiel, guide sans date fixe, anterieur au 19/10)", publisherEn: "Sophon Documentation (official, undated guide, earlier than 2026-10-19)", official: true, retrievedAt: "2026-11-08T18:50:00Z" },
      "cointelegraph-sophon": { url: "https://cointelegraph.com/news/sophon-sets-nov-25-withdrawal-deadline-ahead-of-mainnet-shutdown", publisher: "Cointelegraph (relais)", publisherEn: "Cointelegraph (relay)", official: false, retrievedAt: "2026-11-07T12:27:00Z" },
    },
    recoveryAfterShutdown: "NOT_AVAILABLE",
    recoveryNote: "« assets left on Sophon Chain after the deadline risk becoming permanently inaccessible » (X officiel). Retraits et recompenses staking/Guardian : claim.sophon.com ; farms : farm.sophon.xyz. Guardian NFT, vSOPH et SOPH stake : transition automatique vers Ethereum (docs). Depots fermes depuis le 25/06/2026.",
    recoveryNoteEn: "“assets left on Sophon Chain after the deadline risk becoming permanently inaccessible” (official X). Withdrawals and staking/Guardian rewards: claim.sophon.com; farms: farm.sophon.xyz. Guardian NFT, vSOPH and staked SOPH: automatic transition to Ethereum (docs). Deposits closed since 2026-06-25.",
    lastVerifiedAt: "2026-11-08T18:50:00Z",
  },
  {
    chainKey: "zetachain",
    chainId: 7000,
    name: "ZetaChain",
    status: "WINDING_DOWN",
    // 2026-11-12 : « The ZetaChain L1 halts around Dec 9, 2026 [...] and is not restarted » (blog officiel du 04/11/2026,
    // proposition de gouvernance 2 adoptee le 07/11/2026). L'arret est lie a une hauteur de bloc publiee, « expected around
    // Dec 9 » ; heure non precisee : debut de journee UTC retenu (lecture la plus prudente).
    deadlines: [
      { kind: "WITHDRAW_LAST", at: "2026-12-09T00:00:00Z", sourceIds: ["zeta-blog"] },
      { kind: "NETWORK_SHUTDOWN", at: "2026-12-09T00:00:00Z", sourceIds: ["zeta-blog"] },
    ],
    sources: {
      "zeta-blog": { url: "https://www.zetachain.com/blog/zeta-moves-to-solana-dec-9", publisher: "ZetaChain (blog officiel)", publisherEn: "ZetaChain (official blog)", official: true, retrievedAt: "2026-11-14T10:15:00Z" },
      "zeta-hub-migrate": { url: "https://hub.zetachain.com/migrate", publisher: "ZetaHub (portail officiel de migration ZETA vers Solana)", publisherEn: "ZetaHub (official ZETA-to-Solana migration portal)", official: true, retrievedAt: "2026-11-14T10:15:00Z" },
      "zeta-hub-bridged": { url: "https://hub.zetachain.com/bridged-assets", publisher: "ZetaHub (portail officiel des actifs pontés)", publisherEn: "ZetaHub (official bridged-assets portal)", official: true, retrievedAt: "2026-11-14T10:15:00Z" },
    },
    // PLANNED : la reclamation est annoncee pour le jour de l'arret, elle n'est pas encore ouverte.
    recoveryAfterShutdown: "PLANNED",
    recoveryNote: "« Unwrap and exit pools before the snapshot. ZETA inside contracts and pools cannot be claimed by a key. » Avant l'instantane : sortir des pools et defaire l'emballage des ZETA ; aucune reclamation a faire avant le 9 decembre. Selon le plan officiel annonce (recuperation prevue, sans garantie) : le 9 decembre le portail hub.zetachain.com/migrate doit ouvrir ; on connecte le portefeuille qui detenait les ZETA et on signe un message (le plan precise : pas de transaction, aucun frais, pas de SOL, jamais de phrase secrete) nommant un portefeuille Solana ; le solde complet est annonce livre en ZETA natif sur Solana (au moins 10 ZETA a l'instantane ; ZETA stake ou en cours de retrait credite a l'instantane selon le plan). Actifs encore detenus en ZRC-20 : hub.zetachain.com/bridged-assets, annonces payes sur leur chaine d'origine (minimum de 5 $ par jeton). Selon le plan, les reclamations sont verifiees sur l'instantane publie, donc possibles apres l'arret, sans date limite indiquee a ce jour.",
    recoveryNoteEn: "“Unwrap and exit pools before the snapshot. ZETA inside contracts and pools cannot be claimed by a key.” Before the snapshot: exit pools and unwrap ZETA; no claim to make before December 9. Per the announced official plan (recovery planned, no guarantee): on December 9 the portal at hub.zetachain.com/migrate is due to open; connect the wallet that held the ZETA and sign a message (the plan states: no transaction, no fee, no SOL, never a seed phrase) naming a Solana wallet; the full balance is announced to be delivered as native ZETA on Solana (at least 10 ZETA at the snapshot; staked or unbonding ZETA is credited at the snapshot, per the plan). Assets still held as ZRC-20: hub.zetachain.com/bridged-assets, announced to be paid on their original chain (minimum of $5 per token). Per the plan, claims are checked against the published snapshot, so they are possible after the halt, with no deadline stated to date.",
    lastVerifiedAt: "2026-11-14T10:15:00Z",
  },
  {
    chainKey: "neon",
    chainId: 245022934,
    name: "Neon EVM",
    status: "WINDING_DOWN",
    // 2026-11-12 : « before December 31, 2026 » (annonce du site officiel). Heure non precisee : debut de journee UTC
    // retenu (lecture la plus prudente). Aucune date d'arret du reseau publiee : pas d'echeance NETWORK_SHUTDOWN.
    // Apres le 31/12, le module tiendra la sortie pour fermee (alerte « fonds bloques ») alors que la source ne dit
    // rien de l'apres : relire la source officielle avant cette date et ajuster la fiche.
    deadlines: [
      { kind: "WITHDRAW_LAST", at: "2026-12-31T00:00:00Z", sourceIds: ["neon-site"] },
    ],
    sources: {
      "neon-site": { url: "https://neonevm.org/", publisher: "Neon EVM (site officiel)", publisherEn: "Neon EVM (official site)", official: true, retrievedAt: "2026-11-12T18:10:00Z" },
    },
    recoveryAfterShutdown: "UNKNOWN",
    recoveryNote: "« Users and developers relying on Neon EVM should complete any necessary migration or withdrawal steps before December 31, 2026. » Date d'arret du reseau non publiee.",
    recoveryNoteEn: "“Users and developers relying on Neon EVM should complete any necessary migration or withdrawal steps before December 31, 2026.” No network shutdown date published.",
    lastVerifiedAt: "2026-11-12T18:10:00Z",
  },
];

// ---------------------------------------------------------------------------
// Exposition
// ---------------------------------------------------------------------------
export const EXPOSURE_STATES = ["POSITIVE", "ZERO_ATTESTED", "UNKNOWN", "NOT_COVERED"] as const;
export type ExposureState = (typeof EXPOSURE_STATES)[number];
export type PositionKind = "NATIVE" | "ERC20" | "STAKING" | "DEFI";

export interface ExposureInput {
  chainKey: string;
  kind: PositionKind;
  asset?: string;
  /** false = WCORE ne couvre pas ce type de position sur cette chaine. */
  covered: boolean;
  balance: number | null;
  /** Horodatage attesté de l'observation du solde (ms). */
  balanceObservedAt: number | null;
  /** Delai de deblocage (staking), en jours. */
  unbondingDays?: number;
}

/** Fraicheur maximale d'un solde pour en tirer une conclusion (6 h, contrat WalletCache). */
export const DEFAULT_BALANCE_MAX_AGE_MS = 6 * 3600 * 1000;

export function classifyExposure(input: ExposureInput, nowMs: number, maxAgeMs = DEFAULT_BALANCE_MAX_AGE_MS): ExposureState {
  if (!input.covered) return "NOT_COVERED";
  const b = input.balance;
  const ts = input.balanceObservedAt;
  if (b === null || !Number.isFinite(b) || ts === null || !Number.isFinite(ts) || ts <= 0 || ts > nowMs) return "UNKNOWN";
  if (b > 0) return "POSITIVE"; // un solde positif reste un fait, meme ancien
  if (b === 0 && nowMs - ts < maxAgeMs) return "ZERO_ATTESTED";
  return "UNKNOWN";
}

/** Agregat par chaine : jamais « sur » sans preuve de solde nul pour TOUTES les positions. */
export function aggregateExposure(states: readonly ExposureState[]): ExposureState {
  if (states.includes("POSITIVE")) return "POSITIVE";
  if (states.length === 0) return "NOT_COVERED";
  if (states.every((s) => s === "ZERO_ATTESTED")) return "ZERO_ATTESTED";
  if (states.every((s) => s === "NOT_COVERED")) return "NOT_COVERED";
  return "UNKNOWN";
}

// ---------------------------------------------------------------------------
// Echeance contraignante
// ---------------------------------------------------------------------------
export interface BindingDeadline {
  kind: DeadlineKind;
  /** Moment ou l'utilisateur doit avoir AGI (ms). */
  actionByMs: number;
  /** Deux sources officielles ou plus donnent des dates differentes pour ce type. */
  conflict: boolean;
  officialSourceUrls: string[];
  /** Au moins une source officielle soutient cette echeance. */
  verified: boolean;
}

const DAY_MS = 86400000;

function factOfficialUrls(rec: ChainLifecycleRecord, f: DeadlineFact): string[] {
  return f.sourceIds.map((id) => rec.sources[id]).filter((s): s is SourceRef => !!s && s.official).map((s) => s.url);
}

/**
 * Premiere echeance financiere reellement contraignante, compte tenu des
 * positions : un staking avec deblocage de N jours doit etre engage N jours
 * avant la derniere date de retrait/bridge si aucune date d'unstake n'est publiee.
 * Retourne null si aucune echeance n'existe ; les echeances passees sont incluses
 * (actionByMs <= now) pour qualifier une immobilisation.
 */
export function bindingDeadline(rec: ChainLifecycleRecord, exposures: readonly ExposureInput[], nowMs: number): BindingDeadline | null {
  if (!rec.deadlines.length) return null;
  const byKind = new Map<DeadlineKind, DeadlineFact[]>();
  const held = exposures.filter((e) => e.covered === false || e.balance === null || (e.balance ?? 0) > 0);
  for (const f of rec.deadlines) {
    const t = Date.parse(f.at);
    if (!Number.isFinite(t)) continue;
    // Une echeance limitee a certains actifs ne contraint que si une position les concerne
    // (une position d'actif inconnu ou non couverte est consideree comme concernee).
    if (f.assets && f.assets.length && exposures.length && !held.some((e) => !e.asset || f.assets!.includes(e.asset))) continue;
    byKind.set(f.kind, [...(byKind.get(f.kind) || []), f]);
  }
  const candidates: BindingDeadline[] = [];
  const staking = exposures.filter((e) => e.kind === "STAKING" && e.covered && (e.balance === null || e.balance > 0));
  const maxUnbondDays = staking.reduce((m, e) => Math.max(m, e.unbondingDays || 0), 0);
  for (const [kind, facts] of byKind) {
    const times = facts.map((f) => Date.parse(f.at));
    const earliest = Math.min(...times);
    const officialFacts = facts.filter((f) => factOfficialUrls(rec, f).length > 0);
    const officialTimes = new Set(officialFacts.map((f) => Date.parse(f.at)));
    let actionBy = earliest;
    if (kind === "UNSTAKE_LAST" && staking.length === 0) continue; // sans staking, non contraignant
    if ((kind === "WITHDRAW_LAST" || kind === "BRIDGE_WITHDRAW_LAST") && maxUnbondDays > 0 && !byKind.has("UNSTAKE_LAST")) {
      actionBy = earliest - maxUnbondDays * DAY_MS;
    }
    candidates.push({
      kind,
      actionByMs: actionBy,
      conflict: officialTimes.size > 1,
      officialSourceUrls: Array.from(new Set(facts.flatMap((f) => factOfficialUrls(rec, f)))),
      verified: officialFacts.length > 0,
    });
  }
  if (!candidates.length) return null;
  // Une sortie deja fermee (retrait, bridge ou arret passe) prime sur toute echeance future :
  // les fonds sont alors deja bloques, meme si le reseau tourne encore.
  const EXIT_KINDS: DeadlineKind[] = ["BRIDGE_WITHDRAW_LAST", "WITHDRAW_LAST", "NETWORK_SHUTDOWN"];
  const closedExits = candidates.filter((c) => c.actionByMs <= nowMs && EXIT_KINDS.includes(c.kind)).sort((a, b) => b.actionByMs - a.actionByMs);
  if (closedExits.length) return closedExits[0] ?? null;
  const future = candidates.filter((c) => c.actionByMs > nowMs).sort((a, b) => a.actionByMs - b.actionByMs);
  if (future.length) return future[0] ?? null;
  return candidates.sort((a, b) => b.actionByMs - a.actionByMs)[0] ?? null;
}

// ---------------------------------------------------------------------------
// Alertes
// ---------------------------------------------------------------------------
export type AlertSeverity = "P0" | "P1" | "P2";
export type AlertCode =
  | "ACTION_REQUIRED_BEFORE_DEADLINE"
  | "FUNDS_STRANDED_AFTER_SHUTDOWN"
  | "EXPOSURE_UNKNOWN_AFTER_SHUTDOWN"
  | "RECOVERY_WINDOW_OPEN"
  | "RECOVERY_PLANNED"
  | "RETIRED_NO_EXPOSURE"
  | "UNVERIFIED_ANNOUNCEMENT"
  | "SENTINEL_STALE";

export interface SentinelAlert {
  id: string;
  chainKey: string;
  chainId: number;
  code: AlertCode;
  severity: AlertSeverity;
  actionByMs: number | null;
  countdownMs: number | null;
  deadlineKind: DeadlineKind | null;
  conflict: boolean;
  officialSourceUrls: string[];
  exposure: ExposureState;
  /** Detail prive (jamais publie) : etat par position, sans montant. */
  privateDetail?: { positions: { kind: PositionKind; asset?: string; state: ExposureState }[] };
}

function alertId(chainKey: string, code: AlertCode, actionByMs: number | null): string {
  return `${chainKey}|${code}|${actionByMs === null ? "-" : new Date(actionByMs).toISOString()}`;
}

export function evaluateChain(rec: ChainLifecycleRecord, exposures: readonly ExposureInput[], nowMs: number): SentinelAlert | null {
  // Une panne RPC ou un statut inconnu ne declenchent rien : seules les sources officielles comptent.
  if (rec.status === "ACTIVE" || rec.status === "UNKNOWN") return null;
  const states = exposures.map((e) => classifyExposure(e, nowMs));
  const exposure = aggregateExposure(states);
  const bd = bindingDeadline(rec, exposures, nowMs);
  const base = {
    chainKey: rec.chainKey,
    chainId: rec.chainId,
    deadlineKind: bd ? bd.kind : null,
    conflict: bd ? bd.conflict : false,
    officialSourceUrls: bd ? bd.officialSourceUrls : [],
    exposure,
    privateDetail: { positions: exposures.map((e, i) => ({ kind: e.kind, asset: e.asset, state: states[i] ?? ("UNKNOWN" as ExposureState) })) },
  };
  const mk = (code: AlertCode, severity: AlertSeverity): SentinelAlert => {
    const actionByMs = bd ? bd.actionByMs : null;
    return { ...base, id: alertId(rec.chainKey, code, actionByMs), code, severity, actionByMs, countdownMs: actionByMs === null ? null : actionByMs - nowMs };
  };
  if (bd && !bd.verified) return mk("UNVERIFIED_ANNOUNCEMENT", exposure === "ZERO_ATTESTED" ? "P2" : "P1");
  const passed = !bd || bd.actionByMs <= nowMs;
  if (passed) {
    if (rec.recoveryAfterShutdown === "AVAILABLE" && exposure !== "ZERO_ATTESTED") {
      // L echeance utile devient la fin de la fenetre de reclamation, si elle est publiee.
      const claim = rec.deadlines.filter((f) => f.kind === "CLAIM_END").map((f) => ({ f, t: Date.parse(f.at) }))
        .filter((x) => Number.isFinite(x.t) && x.t > nowMs).sort((a, b) => a.t - b.t)[0];
      const a = mk("RECOVERY_WINDOW_OPEN", "P0");
      if (claim) {
        const urls = factOfficialUrls(rec, claim.f);
        return { ...a, id: alertId(rec.chainKey, "RECOVERY_WINDOW_OPEN", claim.t), actionByMs: claim.t, countdownMs: claim.t - nowMs, deadlineKind: "CLAIM_END", officialSourceUrls: urls.length ? urls : a.officialSourceUrls };
      }
      return a;
    }
    if (rec.recoveryAfterShutdown === "PLANNED" && exposure !== "ZERO_ATTESTED") return mk("RECOVERY_PLANNED", exposure === "POSITIVE" ? "P0" : "P1");
    if (exposure === "POSITIVE") return mk("FUNDS_STRANDED_AFTER_SHUTDOWN", "P0");
    if (exposure === "UNKNOWN" || exposure === "NOT_COVERED") return mk("EXPOSURE_UNKNOWN_AFTER_SHUTDOWN", "P1");
    return mk("RETIRED_NO_EXPOSURE", "P2");
  }
  if (exposure === "ZERO_ATTESTED") return mk("RETIRED_NO_EXPOSURE", "P2");
  const left = bd!.actionByMs - nowMs;
  return mk("ACTION_REQUIRED_BEFORE_DEADLINE", left <= 7 * DAY_MS ? "P0" : left <= 30 * DAY_MS ? "P1" : "P2");
}

// ---------------------------------------------------------------------------
// Deduplication, notifications, sante de la surveillance
// ---------------------------------------------------------------------------
export interface AlertDiff { added: SentinelAlert[]; unchanged: SentinelAlert[]; resolved: string[]; deadlineChanged: SentinelAlert[] }

export function diffAlerts(previous: readonly SentinelAlert[], current: readonly SentinelAlert[]): AlertDiff {
  const prevById = new Map(previous.map((a) => [a.id, a]));
  const prevByChainCode = new Map(previous.map((a) => [`${a.chainKey}|${a.code}`, a]));
  const added: SentinelAlert[] = [], unchanged: SentinelAlert[] = [], deadlineChanged: SentinelAlert[] = [];
  for (const a of current) {
    if (prevById.has(a.id)) { unchanged.push(a); continue; }
    if (prevByChainCode.has(`${a.chainKey}|${a.code}`)) deadlineChanged.push(a);
    else added.push(a);
  }
  const currentIds = new Set(current.map((a) => a.id));
  const changedKeys = new Set(deadlineChanged.map((a) => `${a.chainKey}|${a.code}`));
  const resolved = previous.filter((a) => !currentIds.has(a.id) && !changedKeys.has(`${a.chainKey}|${a.code}`)).map((a) => a.id);
  return { added, unchanged, resolved, deadlineChanged };
}

/** Alertes a pousser : P0/P1 non acquittees, y compris deja vues mais jamais acquittees. */
export function pendingNotifications(alerts: readonly SentinelAlert[], acknowledgedIds: ReadonlySet<string>): SentinelAlert[] {
  return alerts.filter((a) => (a.severity === "P0" || a.severity === "P1") && !acknowledgedIds.has(a.id))
    .sort((a, b) => (a.severity === b.severity ? (a.actionByMs ?? 0) - (b.actionByMs ?? 0) : a.severity === "P0" ? -1 : 1));
}

export function monitorHealthAlert(lastSuccessAtMs: number | null, nowMs: number, intervalMs: number): SentinelAlert | null {
  const stale = lastSuccessAtMs === null || nowMs - lastSuccessAtMs > 2 * intervalMs;
  if (!stale) return null;
  return {
    id: alertId("sentinel", "SENTINEL_STALE", null), chainKey: "sentinel", chainId: 0, code: "SENTINEL_STALE",
    severity: lastSuccessAtMs === null ? "P0" : "P1", actionByMs: null, countdownMs: null, deadlineKind: null,
    conflict: false, officialSourceUrls: [], exposure: "UNKNOWN",
  };
}

/** Projection publique : aucune donnee de portefeuille. */
export type PublicSentinelAlert = Omit<SentinelAlert, "exposure" | "privateDetail" | "id"> & { exposure: "AUTH_REQUIRED" };
export function toPublicAlert(a: SentinelAlert): PublicSentinelAlert {
  const { privateDetail: _p, exposure: _e, id: _i, ...rest } = a;
  return { ...rest, exposure: "AUTH_REQUIRED" };
}

/** Couverture des sources officielles sur un ensemble de chaines actives. */
export function officialSourceCoverage(activeChainKeys: readonly string[], registry: readonly ChainLifecycleRecord[] = VERIFIED_LIFECYCLE_REGISTRY): { monitored: number; withOfficialSource: number; ratio: number } {
  const keys = new Set(activeChainKeys.map((k) => k.toLowerCase()));
  // Une chaine n est couverte que si au moins une ECHEANCE est soutenue par une source officielle.
  const withSrc = registry.filter((r) => keys.has(r.chainKey) && r.deadlines.some((f) => factOfficialUrls(r, f).length > 0)).length;
  return { monitored: keys.size, withOfficialSource: withSrc, ratio: keys.size ? withSrc / keys.size : 0 };
}

// ---------------------------------------------------------------------------
// Adaptateur scans WCORE -> expositions (croisement financier)
// ---------------------------------------------------------------------------


export function normalizeChainKey(k: string): string {
  return String(k || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

/**
 * Construit les expositions d un utilisateur a partir de ses scans. Un scan
 * degrade ou en erreur ne peut jamais attester un solde nul ; les positions de
 * staking et DeFi ne sont pas couvertes par les scans actuels (NOT_COVERED).
 */
export function exposuresFromScans(scans: readonly _ScanResultForAdapter[], chainKeys: readonly string[]): ExposureInput[] {
  const wanted = new Set(chainKeys.map(normalizeChainKey));
  const out: ExposureInput[] = [];
  for (const scan of scans) {
    for (const chain of scan.chains || []) {
      const key = normalizeChainKey(chain.chainKey);
      if (!wanted.has(key)) continue;
      const observed = Date.parse(chain.cachedAt || scan.generatedAt);
      const ts = Number.isFinite(observed) ? observed : null;
      const unreliable = chain.degraded || (chain.errors && chain.errors.length > 0);
      const bal = (b: number) => (unreliable && b === 0 ? null : b);
      if (chain.native) out.push({ chainKey: key, kind: "NATIVE", asset: chain.native.symbol, covered: true, balance: bal(chain.native.balance), balanceObservedAt: ts });
      else out.push({ chainKey: key, kind: "NATIVE", covered: true, balance: null, balanceObservedAt: ts });
      for (const t of chain.tokens || []) out.push({ chainKey: key, kind: "ERC20", asset: t.symbol, covered: true, balance: bal(t.balance), balanceObservedAt: ts });
      out.push({ chainKey: key, kind: "STAKING", covered: false, balance: null, balanceObservedAt: null });
    }
  }
  return out;
}
