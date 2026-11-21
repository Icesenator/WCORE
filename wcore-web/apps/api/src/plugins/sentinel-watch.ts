import { createHash } from "node:crypto";
import type { CacheStore } from "@wcore/core";
import type { Proposal } from "./sentinel.js";

/**
 * Chain Sentinel — veille des annonces (anticipation).
 *
 * Releve la page d'actualites officielle de chaque chaine suivie et signale tout NOUVEAU passage
 * qui parle de fermeture, de migration ou de fin de support. Le but est de prevenir plusieurs
 * semaines avant la date limite (Moonbeam : annonce le 03/07/2026, limite au 31/07/2026), pas de
 * constater une chaine deja arretee.
 *
 * - Premiere lecture d'une source = ligne de base (aucune proposition) : les mots deja presents
 *   (menus, anciennes annonces) ne declenchent rien.
 * - Un passage nouveau cree une proposition PENDING_ADMIN_REVIEW, jamais une ecriture automatique
 *   du registre ni d'une date. Au plus MAX_PROPOSALS_PER_SOURCE par source et par passe : un surplus
 *   (page coque lue en ligne de base, refonte du site) est range en ligne de base sans bruit.
 * - L'empreinte d'un passage ignore les chiffres, les dates relatives et le texte voisin : un
 *   compteur ou « 3 days ago » ne cree jamais de fausse proposition.
 * - L'etat « deja vu » n'est ecrit par l'appelant qu'APRES la persistance des propositions : une
 *   panne de stockage ne perd jamais une annonce.
 * - Lecture seule : aucune transaction, aucune signature.
 */

/** strict : flux de versions (notes de version) ; seuls les mots d'arret sont retenus, pas « migration » ni « deprecated ». */
export interface WatchSource { chainKey: string; url: string; publisher: string; strict?: boolean }

export const WATCH_KEY = "sentinel:v1:watch";
const MAX_SEEN = 600;
const DISPLAY_CONTEXT = 80;
const HASH_CONTEXT = 30;
const MAX_PROPOSALS_PER_SOURCE = 5;
const MAX_TEXT = 2_000_000;
const BATCH = 5;
/** Au-dela, les pages restantes sont relevees a la passe suivante : la passe reste sous le verrou de 10 min. */
const DEADLINE_MS = 3 * 60_000;

// Vocabulaire de fermeture/migration (anglais, langue des annonces officielles). Separateur : espace, tiret ou
// tiret typographique, espace insecable.
const SEP = "[\\s\\-\\u00a0\\u2010-\\u2015]";
const STOP = `sunset\\w*|shut(?:ting)?${SEP}?down|wind(?:ing)?${SEP}down|end${SEP}of${SEP}(?:life|support|service)|discontinu\\w*|decommission\\w*|cease[sd]?(?:${SEP}all)?${SEP}operations?|final(?:ly)?${SEP}withdraw\\w*|withdrawal${SEP}deadline`;
const KEYWORDS = new RegExp(`\\b(${STOP}|deprecat\\w*|migrat\\w*|relaunch\\w*)\\b`, "gi");

/** checkedAt vide = jamais lue avec succes (pas de ligne de base) ; triedAt = derniere tentative, reussie ou non. */
export interface WatchState { seen: string[]; checkedAt: string; triedAt?: string }
export type WatchStateMap = Record<string, WatchState>;
export interface WatchResult { checked: number; failed: number; proposals: Proposal[]; state: WatchStateMap }

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

// Notes de version : « migrat* », « deprecat* » et « relaunch* » y sont des termes techniques courants ; seul le vocabulaire d'arret est retenu.
const NET = "mainnet|network|chain|rollup|l2";
const STRICT_KEYWORDS = new RegExp(
  `\\b(${STOP}|(?:${NET})\\b[^.\\n]{0,80}\\b(?:deprecat\\w*|retir(?:e[sd]?|ing))|(?:deprecat\\w*|retir(?:e[sd]?|ing))\\b[^.\\n]{0,80}\\b(?:${NET}))\\b`, "gi");

// Contenu HTML echappe d'un flux : seules les balises (&lt;p&gt;...) sont decodees ; un « &lt; » de texte brut
// (« versions < 2.0 ») reste echappe, pour ne pas etre pris pour le debut d'une balise.
const unescapeFeed = (s: string) => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&lt;(\/?[a-zA-Z][^&<>]*?)&gt;/g, "<$1>")
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&");

/** Texte lisible d'une page : sans commentaire, script, style ni balises, espaces normalises. Un flux Atom/RSS a son contenu HTML echappe : il est d'abord decode. */
export function visibleText(html: string): string {
  const src = html.slice(0, MAX_TEXT);
  return (/<(?:feed|rss)\b/i.test(src.slice(0, 2000)) ? unescapeFeed(src) : src)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/?(?:p|div|article|section|li|ul|ol|h[1-6]|tr|td|th|br|a|nav|header|footer|time|span)\b[^>]*>/gi, " | ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/[ \t\r\n]+/g, " ")
    .trim();
}

/** Passages (mot cle + contexte d'affichage) et leur empreinte stable. */
export function keywordSnippets(text: string, strict = false): Array<{ hash: string; snippet: string }> {
  const out = new Map<string, string>();
  for (const m of text.matchAll(strict ? STRICT_KEYWORDS : KEYWORDS)) {
    const i = m.index ?? 0;
    const end = i + m[0].length;
    // Contexte coupe aux frontieres de bloc (« | ») : un article voisin n'entre pas dans l'empreinte.
    const left = text.slice(Math.max(0, i - HASH_CONTEXT), i).split("|").pop() ?? "";
    const right = (text.slice(end, Math.min(text.length, end + HASH_CONTEXT)).split("|")[0]) ?? "";
    const stable = (left + m[0] + right)
      .toLowerCase()
      .replace(/\b\d+\s*(?:s|sec|seconds?|m|min|minutes?|h|hours?|d|days?|weeks?|months?)\s+ago\b/g, " ")
      .replace(/\d+/g, "#")
      .replace(/\s+/g, " ")
      .trim();
    const hash = sha(stable).slice(0, 16);
    if (!out.has(hash)) out.set(hash, text.slice(Math.max(0, i - DISPLAY_CONTEXT), Math.min(text.length, end + DISPLAY_CONTEXT)).replace(/\s*\|\s*/g, " ").trim());
  }
  return [...out].map(([hash, snippet]) => ({ hash, snippet }));
}

/** Une passe de veille. N'ecrit RIEN : l'appelant persiste `state` apres les propositions (voir saveWatchState). */
export async function runAnnouncementWatch(
  store: CacheStore,
  fetchText: (url: string) => Promise<{ status: number; text: string }>,
  nowMs: number,
  sources: readonly WatchSource[],
): Promise<WatchResult> {
  const state: WatchStateMap = { ...((await store.get<WatchStateMap>(WATCH_KEY)) || {}) };
  const result: WatchResult = { checked: 0, failed: 0, proposals: [], state };
  const iso = new Date(nowMs).toISOString();
  const one = async (src: WatchSource) => {
    const key = `${src.chainKey}:${src.url}`;
    result.checked++;
    let res: { status: number; text: string };
    const fail = () => { result.failed++; state[key] = { seen: state[key]?.seen ?? [], checkedAt: state[key]?.checkedAt ?? "", triedAt: iso }; };
    try { res = await fetchText(src.url); } catch { fail(); return; }
    if (res.status < 200 || res.status >= 300) { fail(); return; }
    const found = keywordSnippets(visibleText(res.text), src.strict === true);
    const prev = state[key];
    const seen = new Set(prev?.seen ?? []);
    if (prev?.checkedAt) {
      const fresh = found.filter((f) => !seen.has(f.hash));
      for (const { hash, snippet } of fresh.slice(0, MAX_PROPOSALS_PER_SOURCE)) {
        result.proposals.push({
          id: `${src.chainKey}:watch:${hash}`, chainKey: src.chainKey, sourceId: "watch", url: src.url,
          previousSha256: null, newSha256: hash, detectedAt: iso, status: "PENDING_ADMIN_REVIEW",
          kind: "ANNOUNCEMENT_KEYWORD", snippet: snippet.slice(0, 400),
        });
      }
      // Surplus : une seule proposition de synthese, jamais un abandon silencieux.
      const rest = fresh.slice(MAX_PROPOSALS_PER_SOURCE);
      if (rest.length) {
        const h = sha(rest.map((r) => r.hash).join(",")).slice(0, 16);
        result.proposals.push({
          id: `${src.chainKey}:watch:more:${h}`, chainKey: src.chainKey, sourceId: "watch", url: src.url,
          previousSha256: null, newSha256: h, detectedAt: iso, status: "PENDING_ADMIN_REVIEW",
          kind: "ANNOUNCEMENT_KEYWORD", snippet: `(+${rest.length} autres passages nouveaux, par ex.) ${rest[0]!.snippet}`.slice(0, 400),
        });
      }
    }    const merged = [...(prev?.seen ?? []), ...found.map((f) => f.hash).filter((h) => !seen.has(h))];
    state[key] = { seen: merged.slice(-MAX_SEEN), checkedAt: iso, triedAt: iso };
  };
  // Lots de BATCH pages en parallele : la passe reste courte face au verrou de la collecte.
  // Les sources relevees le plus anciennement (ou jamais) passent en premier : si le budget de temps est epuise,
  // les pages restantes sont prises en tete a la passe suivante, aucune ne reste indefiniment sans surveillance.
  const rank = (x: WatchSource) => { const w = state[`${x.chainKey}:${x.url}`]; return w ? (w.triedAt ?? w.checkedAt) : ""; };
  const ordered = [...sources].sort((a, b) => (rank(a)).localeCompare(rank(b)));
  const t0 = Date.now();
  for (let i = 0; i < ordered.length; i += BATCH) {
    if (Date.now() - t0 > DEADLINE_MS) break;
    await Promise.all(ordered.slice(i, i + BATCH).map(one));
  }
  return result;
}

/** A appeler apres la persistance des propositions. */
export async function saveWatchState(store: CacheStore, state: WatchStateMap): Promise<void> {
  await store.set(WATCH_KEY, state);
}
