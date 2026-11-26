// Chain Sentinel — changements detectes automatiquement sur les pages officielles (logique pure, testable).
// Donnees issues d'une analyse locale d'une page externe : jamais des echeances verifiees. Le serveur nettoie
// deja les extraits ; le client re-borne et re-verifie tout (defense en profondeur) avant l'affichage.

export type OfficialChangeLevel = "VIGILANCE" | "INFO" | "MINEUR";
export interface OfficialChangeView { sourceId: string; url: string; detectedAt: string; level: OfficialChangeLevel; excerpts: string[]; expiresAt: string }
export interface ChainOfficialChanges { chainKey: string; name: string; changes: OfficialChangeView[] }

const LEVELS: readonly OfficialChangeLevel[] = ["VIGILANCE", "INFO", "MINEUR"];
export const EXCERPT_DISPLAY_MAX = 200;
const EXCERPTS_MAX = 3;

/** Lien affichable seulement s'il est https. */
export function officialHttpsUrl(url: unknown): string | null {
  if (typeof url !== "string") return null;
  try { const u = new URL(url); return u.protocol === "https:" ? u.toString() : null; } catch { return null; }
}

/** Extrait : texte seul, sans balise ni lien, une ligne, borne. */
export function cleanExcerpt(raw: unknown): string {
  const s = String(raw ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/(?:https?:\/\/|www\.)\S+/gi, " ")
    .replace(/[<>[\]{}`|\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s.length > EXCERPT_DISPLAY_MAX ? `${s.slice(0, EXCERPT_DISPLAY_MAX - 1).trimEnd()}…` : s;
}

/** Valide une entree de l'API ; null si malformee ou expiree. */
export function readOfficialChange(raw: unknown, nowMs: number): OfficialChangeView | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const url = officialHttpsUrl(r.url);
  const level = LEVELS.find((l) => l === r.level);
  if (!url || !level || typeof r.detectedAt !== "string" || !Number.isFinite(Date.parse(r.detectedAt))) return null;
  const exp = typeof r.expiresAt === "string" ? Date.parse(r.expiresAt) : NaN;
  // Sans expiration valide, une entree n'est jamais affichee (aucune duree d'affichage illimitee).
  if (!Number.isFinite(exp) || exp <= nowMs) return null;
  const excerpts = level === "MINEUR" ? [] : (Array.isArray(r.excerpts) ? r.excerpts : []).slice(0, EXCERPTS_MAX).map(cleanExcerpt).filter(Boolean);
  return { sourceId: cleanExcerpt(r.sourceId).slice(0, 40), url, detectedAt: r.detectedAt, level, excerpts, expiresAt: typeof r.expiresAt === "string" ? r.expiresAt : "" };
}

/** Changements par chaine, regroupes par niveau d'importance (vigilance d'abord). */
export function collectOfficialChanges(
  chains: ReadonlyArray<{ chainKey: string; name: string; officialChanges?: unknown }> | null | undefined, nowMs: number,
): { vigilance: ChainOfficialChanges[]; info: ChainOfficialChanges[]; minor: ChainOfficialChanges[] } {
  const out = { vigilance: [] as ChainOfficialChanges[], info: [] as ChainOfficialChanges[], minor: [] as ChainOfficialChanges[] };
  for (const c of chains ?? []) {
    const list = (Array.isArray(c.officialChanges) ? c.officialChanges : []).map((x) => readOfficialChange(x, nowMs)).filter((x): x is OfficialChangeView => x !== null);
    const by = (l: OfficialChangeLevel) => list.filter((x) => x.level === l).sort((a, b) => Date.parse(b.detectedAt) - Date.parse(a.detectedAt));
    const v = by("VIGILANCE"), i = by("INFO"), m = by("MINEUR");
    if (v.length) out.vigilance.push({ chainKey: c.chainKey, name: String(c.name), changes: v });
    if (i.length) out.info.push({ chainKey: c.chainKey, name: String(c.name), changes: i });
    if (m.length) out.minor.push({ chainKey: c.chainKey, name: String(c.name), changes: m });
  }
  return out;
}

export function formatChangeDate(iso: string, lang: "fr" | "en"): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : iso;
}

export const OFFICIAL_CHANGES_TEXT = {
  fr: {
    title: "Pages officielles modifiées",
    intro: "Détecté automatiquement par une analyse du texte des pages officielles, sans validation humaine. Ces extraits ne sont pas des échéances vérifiées : seules les fiches ci-dessus font foi. À vérifier sur la source.",
    vigilance: "Vigilance", info: "Information", minor: "Modification mineure",
    modifiedOn: (d: string) => `Page officielle modifiée le ${d}`,
    seems: "Il semble que la page évoque un arrêt, une migration, un retrait ou une date limite. À vérifier sur la source officielle.",
    seemsInfo: "Il semble que la page mentionne une migration ou une évolution. À vérifier sur la source officielle.",
    excerpt: "Extrait de la page (non vérifié) :",
    open: "Ouvrir la source officielle",
    moreInfo: (n: number) => `Autres changements à titre d'information (${n})`,
    minorTitle: (n: number) => `Modifications mineures (${n}) : mise en page, texte, lien`,
    none: "Aucun changement récent détecté sur les pages officielles surveillées.",
  },
  en: {
    title: "Official pages changed",
    intro: "Detected automatically by analysing the text of official pages, with no human review. These excerpts are not verified deadlines: only the records above are authoritative. Check the source.",
    vigilance: "Watch", info: "Information", minor: "Minor change",
    modifiedOn: (d: string) => `Official page changed on ${d}`,
    seems: "The page appears to mention a shutdown, migration, withdrawal or deadline. Check the official source.",
    seemsInfo: "The page appears to mention a migration or change. Check the official source.",
    excerpt: "Page excerpt (unverified):",
    open: "Open the official source",
    moreInfo: (n: number) => `Other changes, for information (${n})`,
    minorTitle: (n: number) => `Minor changes (${n}): layout, text, links`,
    none: "No recent change detected on the monitored official pages.",
  },
} as const;
