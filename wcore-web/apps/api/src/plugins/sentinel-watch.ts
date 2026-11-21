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

export interface WatchSource { chainKey: string; url: string; publisher: string }

export const WATCH_KEY = "sentinel:v1:watch";
const MAX_SEEN = 300;
const DISPLAY_CONTEXT = 80;
const HASH_CONTEXT = 30;
const MAX_PROPOSALS_PER_SOURCE = 5;
const MAX_TEXT = 2_000_000;
const BATCH = 5;

// Vocabulaire de fermeture/migration (anglais, langue des annonces officielles).
const KEYWORDS = /\b(sunset\w*|shut(?:ting)?[ -]?down|wind(?:ing)?[ -]down|end[ -]of[ -](?:life|support|service)|deprecat\w*|discontinu\w*|decommission\w*|migrat\w*|relaunch\w*|cease[sd]? operations?|final(?:ly)? withdraw\w*|withdrawal deadline)\b/gi;

export interface WatchState { seen: string[]; checkedAt: string }
export type WatchStateMap = Record<string, WatchState>;
export interface WatchResult { checked: number; failed: number; proposals: Proposal[]; state: WatchStateMap }

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** Texte lisible d'une page : sans commentaire, script, style ni balises, espaces normalises. */
export function visibleText(html: string): string {
  return html.slice(0, MAX_TEXT)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/?(?:p|div|article|section|li|ul|ol|h[1-6]|tr|td|th|br|a|nav|header|footer|time|span)\b[^>]*>/gi, " | ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/[ \t\r\n]+/g, " ")
    .trim();
}

/** Passages (mot cle + contexte d'affichage) et leur empreinte stable. */
export function keywordSnippets(text: string): Array<{ hash: string; snippet: string }> {
  const out = new Map<string, string>();
  for (const m of text.matchAll(KEYWORDS)) {
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
    try { res = await fetchText(src.url); } catch { result.failed++; return; }
    if (res.status < 200 || res.status >= 300) { result.failed++; return; }
    const found = keywordSnippets(visibleText(res.text));
    const prev = state[key];
    const seen = new Set(prev?.seen ?? []);
    if (prev) {
      const fresh = found.filter((f) => !seen.has(f.hash));
      for (const { hash, snippet } of fresh.slice(0, MAX_PROPOSALS_PER_SOURCE)) {
        result.proposals.push({
          id: `${src.chainKey}:watch:${hash}`, chainKey: src.chainKey, sourceId: "watch", url: src.url,
          previousSha256: null, newSha256: hash, detectedAt: iso, status: "PENDING_ADMIN_REVIEW",
          kind: "ANNOUNCEMENT_KEYWORD", snippet: snippet.slice(0, 400),
        });
      }
    }
    const merged = [...(prev?.seen ?? []), ...found.map((f) => f.hash).filter((h) => !seen.has(h))];
    state[key] = { seen: merged.slice(-MAX_SEEN), checkedAt: iso };
  };
  // Lots de BATCH pages en parallele : la passe reste courte face au verrou de la collecte.
  for (let i = 0; i < sources.length; i += BATCH) await Promise.all(sources.slice(i, i + BATCH).map(one));
  return result;
}

/** A appeler apres la persistance des propositions. */
export async function saveWatchState(store: CacheStore, state: WatchStateMap): Promise<void> {
  await store.set(WATCH_KEY, state);
}
