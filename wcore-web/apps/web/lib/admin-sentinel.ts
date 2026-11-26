/** Aides pures de la vue d'administration Chain Sentinel (propositions a valider). */

export type ProposalStatus = "PENDING_ADMIN_REVIEW" | "AUTO_PUBLISHED" | "APPROVED" | "REJECTED";
export type ProposalKind = "SOURCE_CHANGED" | "ANNOUNCEMENT_KEYWORD";

export interface SentinelProposal {
  id: string;
  chainKey: string;
  sourceId: string;
  url: string;
  previousSha256: string | null;
  newSha256: string;
  detectedAt: string;
  status: ProposalStatus;
  decidedAt?: string;
  note?: string;
  kind?: ProposalKind;
  snippet?: string;
  analysis?: { level: "VIGILANCE" | "INFO" | "MINEUR"; excerpts: string[] };
}

export interface SentinelChainName { chainKey: string; name: string }

/** Hash raccourci : 12 premiers caracteres, « — » si absent. */
export function shortHash(h: string | null | undefined): string {
  return h ? h.slice(0, 12) : "—";
}

/** Lien affichable seulement s'il est https (jamais javascript:, http:, data:). */
export function safeHttpsUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Nom lisible de la chaine, sinon la cle brute. */
export function chainDisplayName(chainKey: string, chains: readonly SentinelChainName[]): string {
  return chains.find((c) => c.chainKey === chainKey)?.name || chainKey;
}

function byDateDesc(a: SentinelProposal, b: SentinelProposal): number {
  return Date.parse(b.detectedAt) - Date.parse(a.detectedAt);
}

/** En attente (plus recentes d'abord) et deja traitees (decision la plus recente d'abord). */
export function splitProposals(list: readonly SentinelProposal[]): { pending: SentinelProposal[]; auto: SentinelProposal[]; decided: SentinelProposal[] } {
  const pending = list.filter((p) => p.status === "PENDING_ADMIN_REVIEW").sort(byDateDesc);
  const auto = list.filter((p) => p.status === "AUTO_PUBLISHED").sort(byDateDesc);
  const decided = list
    .filter((p) => p.status !== "PENDING_ADMIN_REVIEW" && p.status !== "AUTO_PUBLISHED")
    .sort((a, b) => (Date.parse(b.decidedAt || b.detectedAt) || 0) - (Date.parse(a.decidedAt || a.detectedAt) || 0));
  return { pending, auto, decided };
}

export function kindLabel(kind: ProposalKind | undefined): string {
  return kind === "ANNOUNCEMENT_KEYWORD" ? "Annonce à mot-clé (possible fermeture)" : "Contenu de la source modifié";
}

export function statusLabel(status: ProposalStatus): string {
  if (status === "APPROVED") return "Approuvée";
  if (status === "REJECTED") return "Rejetée";
  if (status === "AUTO_PUBLISHED") return "Traitée automatiquement";
  return "En attente";
}
