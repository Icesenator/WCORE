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
 *   du registre ni d'une date.
 * - Lecture seule : aucune transaction, aucune signature.
 */

export interface WatchSource { chainKey: string; url: string; publisher: string }

export const WATCH_KEY = "sentinel:v1:watch";
const MAX_SEEN = 300;
const CONTEXT = 80;

// Vocabulaire de fermeture/migration (anglais, langue des annonces officielles).
const KEYWORDS = /\b(sunset\w*|shut(?:ting)?[ -]?down|wind(?:ing)?[ -]down|end[ -]of[ -](?:life|support|service)|deprecat\w*|discontinu\w*|decommission\w*|migrat\w*|relaunch\w*|cease[sd]? operations?|final(?:ly)? withdraw\w*|withdrawal deadline)\b/gi;

interface WatchState { seen: string[]; checkedAt: string }
export interface WatchResult { checked: number; failed: number; proposals: Proposal[] }

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** Texte lisible d'une page : sans script, style ni balises, espaces normalises. */
export function visibleText(html: string): string {
  return html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Passages (mot cle + contexte) d'un texte, normalises en minuscules pour une empreinte stable. */
export function keywordSnippets(text: string): string[] {
  const out = new Map<string, string>();
  for (const m of text.matchAll(KEYWORDS)) {
    const i = m.index ?? 0;
    const raw = text.slice(Math.max(0, i - CONTEXT), Math.min(text.length, i + m[0].length + CONTEXT)).trim();
    const key = raw.toLowerCase().replace(/\s+/g, " ");
    if (!out.has(key)) out.set(key, raw);
  }
  return [...out.values()];
}

export async function runAnnouncementWatch(
  store: CacheStore,
  fetchText: (url: string) => Promise<{ status: number; text: string }>,
  nowMs: number,
  sources: readonly WatchSource[],
): Promise<WatchResult> {
  const state = (await store.get<Record<string, WatchState>>(WATCH_KEY)) || {};
  const result: WatchResult = { checked: 0, failed: 0, proposals: [] };
  const iso = new Date(nowMs).toISOString();
  for (const src of sources) {
    const key = `${src.chainKey}:${src.url}`;
    result.checked++;
    let res: { status: number; text: string };
    try { res = await fetchText(src.url); } catch { result.failed++; continue; }
    if (res.status < 200 || res.status >= 300) { result.failed++; continue; }
    const snippets = keywordSnippets(visibleText(res.text));
    const hashed = snippets.map((s) => ({ h: sha(s.toLowerCase().replace(/\s+/g, " ")).slice(0, 16), s }));
    const prev = state[key];
    if (prev) {
      const seen = new Set(prev.seen);
      for (const { h, s } of hashed) {
        if (seen.has(h)) continue;
        result.proposals.push({
          id: `${src.chainKey}:watch:${h}`, chainKey: src.chainKey, sourceId: "watch", url: src.url,
          previousSha256: null, newSha256: h, detectedAt: iso, status: "PENDING_ADMIN_REVIEW",
          kind: "ANNOUNCEMENT_KEYWORD", snippet: s.slice(0, 400),
        });
      }
    }
    const merged = [...(prev?.seen ?? []), ...hashed.map((x) => x.h).filter((h) => !prev?.seen.includes(h))];
    state[key] = { seen: merged.slice(-MAX_SEEN), checkedAt: iso };
  }
  await store.set(WATCH_KEY, state);
  return result;
}
