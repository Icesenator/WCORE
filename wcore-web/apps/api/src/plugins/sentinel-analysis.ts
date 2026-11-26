import { visibleText } from "./sentinel-watch.js";

/**
 * Chain Sentinel — analyse locale des changements de pages officielles (aucun modele externe).
 *
 * Tout texte vient d'une page externe : c'est une DONNEE non fiable. Il est normalise (texte seul,
 * jamais de balise), borne, et les extraits servis au public sont nettoyes (balises, liens,
 * marqueurs, retours a la ligne). Rien de ce module n'ecrit une echeance : une date trouvee ici
 * est un indice, jamais un fait verifie.
 */

export type ChangeLevel = "VIGILANCE" | "INFO" | "MINEUR";
export interface ChangeAnalysis {
  level: ChangeLevel;
  /** DIFF : lignes ajoutees comparees a la version precedente ; SNIPPET : passage d'annonce ; UNAVAILABLE : version precedente non conservee. */
  detail: "DIFF" | "SNIPPET" | "UNAVAILABLE";
  /** Au plus EXCERPT_MAX extraits nettoyes des lignes ajoutees, les plus pertinents d'abord. */
  excerpts: string[];
  addedCount: number;
  removedCount: number;
  /** Mots-cles reconnus (liste fermee, jamais du texte de la page). */
  keywords: string[];
  /** Dates trouvees (AAAA-MM-JJ), indices non verifies. */
  dates: string[];
  analyzedAt: string;
}

export const SNAPSHOT_MAX = 20_000;
export const EXCERPT_MAX = 3;
export const EXCERPT_LEN = 200;
const LINES_MAX = 10_000;
const DAY = 86_400_000;

/** Texte normalise et borne d'une page : une ligne par bloc, sans HTML ni script. */
export function normalizeSnapshot(html: string): string {
  const lines = visibleText(html).split("|").map((l) => l.replace(/\s+/g, " ").trim()).filter((l) => l.length >= 3);
  return lines.join("\n").slice(0, SNAPSHOT_MAX);
}

const NEGATION = /\b(no|not|never|cannot|aucun\w*|pas|jamais|sans)\b/;
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const SEP = "[\\s\\-\\u00a0\\u2010-\\u2015]";
// Mots forts : suffisent seuls (vigilance). Francais et anglais, accents ignores (texte replie).
const STRONG = new RegExp(`\\b(sunset\\w*|shut(?:ting)?${SEP}?down|wind(?:ing)?${SEP}?down|end${SEP}of${SEP}(?:life|support|service)|eol|discontinu\\w*|decommission\\w*|cease[sd]?(?:${SEP}all)?${SEP}operations?|final(?:ly)?${SEP}withdraw\\w*|withdrawal${SEP}deadline|fermeture|fermer|fermera\\w*|clotur\\w*|cessation|cessera\\w*|arret\\w*|fin${SEP}(?:de${SEP}vie|du${SEP}support|de${SEP}support|du${SEP}service)|mise${SEP}hors${SEP}service|date${SEP}limite|abandon\\w*|sera${SEP}(?:arrete|ferme|desactive|retire)\\w*)\\b`, "g");
// Mots faibles : retenus avec une date proche (meme ligne) ou comme simple information.
const WEAK = new RegExp(`\\b(deprecat\\w*|migrat\\w*|withdraw\\w*|retrait\\w*|bridge\\w*|deadline|final|last${SEP}day|claim\\w*|reclamation\\w*|relaunch\\w*|retire[sd]?|retiring|desactiv\\w*|deprecie\\w*|obsolet\\w*|migrer|basculer)\\b`, "g");

const MONTHS: Record<string, number> = {
  january: 1, jan: 1, janvier: 1, february: 2, feb: 2, fevrier: 2, fev: 2, march: 3, mar: 3, mars: 3, april: 4, apr: 4, avril: 4, avr: 4,
  may: 5, mai: 5, june: 6, jun: 6, juin: 6, july: 7, jul: 7, juillet: 7, juil: 7, august: 8, aug: 8, aout: 8,
  september: 9, sep: 9, sept: 9, septembre: 9, october: 10, oct: 10, octobre: 10, november: 11, nov: 11, novembre: 11, december: 12, dec: 12, decembre: 12,
};
const MONTH_RE = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");

function toIso(y: number, m: number, d: number): string | null {
  if (!(y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const t = Date.UTC(y, m - 1, d);
  const dt = new Date(t);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

/** Dates AAAA-MM-JJ, « 15 December 2026 », « December 15, 2026 », « 15/12/2026 » (jour/mois). */
export function extractDates(text: string): string[] {
  const t = fold(text);
  const out = new Set<string>();
  for (const m of t.matchAll(/\b(20\d\d)-(\d{2})-(\d{2})\b/g)) { const v = toIso(+m[1]!, +m[2]!, +m[3]!); if (v) out.add(v); }
  for (const m of t.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th|er)?\\s+(?:of\\s+)?(${MONTH_RE})\\.?,?\\s+(20\\d\\d)\\b`, "g"))) { const v = toIso(+m[3]!, MONTHS[m[2]!]!, +m[1]!); if (v) out.add(v); }
  for (const m of t.matchAll(new RegExp(`\\b(${MONTH_RE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(20\\d\\d)\\b`, "g"))) { const v = toIso(+m[3]!, MONTHS[m[1]!]!, +m[2]!); if (v) out.add(v); }
  for (const m of t.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(20\d\d)\b/g)) { const v = toIso(+m[3]!, +m[2]!, +m[1]!); if (v) out.add(v); }
  return [...out].sort();
}

// Controles C0/C1, espaces et marques de sens nuls, separateurs de ligne (U+2028/9), BOM.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS =new RegExp("[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]", "g");

/** Extrait servi au public : texte seul, sans balise, lien, marqueur ni saut de ligne, borne. */
export function sanitizeExcerpt(raw: string, max = EXCERPT_LEN): string {
  const s = String(raw)
    .replace(CONTROL_CHARS, " ")
    .replace(/(?:https?:\/\/|ftp:\/\/|www\.)\S+/gi, " ")
    .replace(/[<>[\]{}`|\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

/** Fenetre de `max` caracteres autour de l'indice, dans la ligne d'origine. */
function windowAround(line: string, index: number, max = EXCERPT_LEN * 2): string {
  if (line.length <= max) return line;
  const start = Math.max(0, Math.min(index - Math.floor(max / 3), line.length - max));
  return line.slice(start, start + max);
}

interface LineHit { line: string; strong: string[]; weak: string[]; dates: string[]; relevantDate: boolean; at: number }

function inspectLine(line: string, nowMs: number): LineHit {
  const f = fold(line);
  const strong = [...new Set([...f.matchAll(STRONG)].map((m) => m[1]!.replace(/\s+/g, " ")))];
  const weak = [...new Set([...f.matchAll(WEAK)].map((m) => m[1]!.replace(/\s+/g, " ")))];
  const dates = extractDates(line);
  const relevantDate = dates.some((d) => { const t = Date.parse(d); return t >= nowMs - DAY && t <= nowMs + 1095 * DAY; });
  const first = Math.min(...[...f.matchAll(STRONG), ...f.matchAll(WEAK)].map((m) => m.index ?? 0), line.length);
  return { line, strong, weak, dates, relevantDate, at: first === line.length ? 0 : first };
}

function classify(lines: string[], nowMs: number): { level: ChangeLevel; excerpts: string[]; keywords: string[]; dates: string[] } {
  const hits = lines.slice(0, LINES_MAX).map((l) => inspectLine(l, nowMs));
  // Annonce fragmentee entre blocs (liens, spans) : le texte des lignes ajoutees est aussi lu d'un seul tenant.
  if (lines.length > 1) {
    const j = inspectLine(lines.slice(0, LINES_MAX).join(" ").slice(0, SNAPSHOT_MAX), nowMs);
    if (j.strong.length > 0 && !hits.some((h) => h.strong.length > 0)) hits.push(j);
  }
  const isVigil = (h: LineHit) => h.strong.length > 0 || (h.weak.length > 0 && h.relevantDate);
  const rank = (h: LineHit) => (isVigil(h) ? 3 : h.weak.length ? 2 : h.dates.length ? 1 : 0);
  const keywords = [...new Set(hits.flatMap((h) => [...h.strong, ...h.weak]))].slice(0, 12);
  const dates = [...new Set(hits.filter((h) => h.strong.length || h.weak.length).flatMap((h) => h.dates))].slice(0, 6);
  const level: ChangeLevel = hits.some(isVigil) ? "VIGILANCE" : hits.some((h) => h.weak.length > 0) ? "INFO" : "MINEUR";
  const picked = hits.filter((h) => rank(h) >= 1 || level === "MINEUR").sort((a, b) => rank(b) - rank(a));
  const excerpts = level === "MINEUR" ? [] : picked.filter((h) => h.strong.length || h.weak.length).slice(0, EXCERPT_MAX).map((h) => sanitizeExcerpt(windowAround(h.line, h.at))).filter(Boolean);
  return { level, excerpts, keywords, dates };
}

/** Lignes ajoutees / retirees entre deux textes normalises (comparaison de lignes exactes). */
export function diffLines(prev: string, next: string): { added: string[]; removed: string[] } {
  const p = prev.split("\n").filter(Boolean);
  const n = next.split("\n").filter(Boolean);
  const ps = new Set(p);
  const ns = new Set(n);
  return { added: n.filter((l) => !ps.has(l)), removed: p.filter((l) => !ns.has(l)) };
}

/** Classe un changement de page : `prev` null = version precedente non conservee. */
export function analyzeChange(prev: string | null, next: string, nowMs: number): ChangeAnalysis {
  const analyzedAt = new Date(nowMs).toISOString();
  if (prev === null) {
    return { level: "INFO", detail: "UNAVAILABLE", excerpts: [], addedCount: 0, removedCount: 0, keywords: [], dates: [], analyzedAt };
  }
  const { added, removed } = diffLines(prev, next);
  if (added.length === 0 && removed.length === 0) {
    // Empreinte differente mais texte analyse identique : changement hors zone bornee (ou de mise en page).
    return { level: next.length >= SNAPSHOT_MAX ? "INFO" : "MINEUR", detail: "DIFF", excerpts: [], addedCount: 0, removedCount: 0, keywords: [], dates: [], analyzedAt };
  }
  const c = classify(added, nowMs);
  // Une page plus longue que la zone analysee peut cacher la fin du changement : jamais « mineur » dans ce cas.
  const truncated = next.length >= SNAPSHOT_MAX || prev.length >= SNAPSHOT_MAX;
  let level: ChangeLevel = truncated && c.level === "MINEUR" ? "INFO" : c.level;
  let excerpts = c.excerpts;
  // Contexte : une ligne modifiee juste a cote d'une mention de fermeture (ou une negation retiree alors que la page
  // en contient une) peut changer le sens sans contenir elle-meme le mot : jamais « mineur », extrait = la mention voisine.
  if (level !== "VIGILANCE") {
    const nl = next.split(String.fromCharCode(10));
    const addedSet = new Set(added);
    const near = nl.flatMap((l, i) => (addedSet.has(l) ? [nl[i - 1], nl[i + 1]] : [])).filter((l): l is string => !!l).map((l) => inspectLine(l, nowMs)).filter((h) => h.strong.length > 0);
    const negationRemoved = removed.some((l) => NEGATION.test(fold(l))) && nl.some((l) => inspectLine(l, nowMs).strong.length > 0);
    if (near.length > 0 || negationRemoved) {
      if (level === "MINEUR") level = "INFO";
      const src = near[0] ?? nl.map((l) => inspectLine(l, nowMs)).find((h) => h.strong.length > 0);
      if (src && excerpts.length === 0) excerpts = [sanitizeExcerpt(windowAround(src.line, src.at))];
    }
  }
  return { level, detail: "DIFF", excerpts, addedCount: added.length, removedCount: removed.length, keywords: c.keywords, dates: c.dates, analyzedAt };
}

/** Passage d'annonce deja isole par la veille : meme classement, sur le seul passage. */
export function analyzeSnippet(snippet: string, nowMs: number): ChangeAnalysis {
  const c = classify([snippet], nowMs);
  // La veille n'isole que des passages a mot-cle : jamais « mineur ».
  const level: ChangeLevel = c.level === "MINEUR" ? "INFO" : c.level;
  const excerpts = c.excerpts.length ? c.excerpts : [sanitizeExcerpt(snippet)].filter(Boolean);
  return { level, detail: "SNIPPET", excerpts, addedCount: 1, removedCount: 0, keywords: c.keywords, dates: c.dates, analyzedAt: new Date(nowMs).toISOString() };
}

/** Duree d'affichage : mineur 7 j, info 30 j, vigilance 90 j (ou jusqu'a une fiche validee posterieure). */
export function expiryMs(level: ChangeLevel): number {
  return (level === "VIGILANCE" ? 90 : level === "INFO" ? 30 : 7) * DAY;
}

/** `verified: false` : indice issu d'une analyse automatique de page, jamais une echeance de fiche validee. */
export interface PublicOfficialChange { sourceId: string; url: string; detectedAt: string; level: ChangeLevel; excerpts: string[]; expiresAt: string; verified: false }

export interface AnalyzedProposal { sourceId: string; url: string; detectedAt: string; status: string; analysis?: ChangeAnalysis }

/**
 * Changements officiels affichables pour une chaine : traites automatiquement, non expires, non rejetes
 * par l'administrateur, sur une URL officielle connue (jamais une URL arbitraire). Une vigilance
 * couverte par une fiche validee apres sa detection n'est plus servie.
 */
export function publicOfficialChanges(
  proposals: readonly AnalyzedProposal[], allowedUrls: ReadonlySet<string>, lastVerifiedAt: string, nowMs: number,
): PublicOfficialChange[] {
  const verified = Date.parse(lastVerifiedAt);
  const out: PublicOfficialChange[] = [];
  for (const p of proposals) {
    if (p.status !== "AUTO_PUBLISHED" || !p.analysis || !allowedUrls.has(p.url) || !p.url.startsWith("https://")) continue;
    const at = Date.parse(p.detectedAt);
    if (!Number.isFinite(at)) continue;
    const exp = at + expiryMs(p.analysis.level);
    if (exp <= nowMs) continue;
    if (p.analysis.level === "VIGILANCE" && Number.isFinite(verified) && verified >= at) continue;
    out.push({ sourceId: p.sourceId, url: p.url, detectedAt: p.detectedAt, level: p.analysis.level, excerpts: p.analysis.level === "MINEUR" ? [] : p.analysis.excerpts.slice(0, EXCERPT_MAX).map((e) => sanitizeExcerpt(e)), expiresAt: new Date(exp).toISOString(), verified: false });
  }
  const order = { VIGILANCE: 0, INFO: 1, MINEUR: 2 } as const;
  return out.sort((a, b) => order[a.level] - order[b.level] || Date.parse(b.detectedAt) - Date.parse(a.detectedAt)).slice(0, 6);
}
