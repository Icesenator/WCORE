"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, getApiUrl } from "@/lib/api";
import type { SentinelAlertsResponse, SentinelChainsResponse, SentinelHealthResponse } from "@/lib/sentinel-view";

// Registre public partage entre composants (badges, page, cloche) : une seule requete.
let chainsPromise: Promise<SentinelChainsResponse | null> | null = null;
let chainsAt = 0;
const CHAINS_TTL_MS = 10 * 60 * 1000;

export function loadSentinelChains(force = false): Promise<SentinelChainsResponse | null> {
  if (!force && chainsPromise && Date.now() - chainsAt < CHAINS_TTL_MS) return chainsPromise;
  chainsAt = Date.now();
  chainsPromise = fetch(`${getApiUrl()}/api/sentinel/chains`, { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<SentinelChainsResponse>) : null))
    .catch(() => null);
  return chainsPromise;
}

/** undefined = chargement en cours ; null = registre indisponible (API injoignable ou erreur). */
export function useSentinelChains(): SentinelChainsResponse | null | undefined {
  const [data, setData] = useState<SentinelChainsResponse | null | undefined>(undefined);
  useEffect(() => { let alive = true; loadSentinelChains().then((d) => { if (alive) setData(d); }); return () => { alive = false; }; }, []);
  return data;
}

export const SENTINEL_CHANGED_EVENT = "wcore-sentinel-changed";

export function hasStoredSession(): boolean {
  try { return typeof window !== "undefined" && !!window.localStorage.getItem("wcore_address"); } catch { return false; }
}

export type PrivateState = { status: "loading" } | { status: "anonymous" } | { status: "error" } | { status: "ok"; data: SentinelAlertsResponse };

/** Alertes privees (exposition). 401 = utilisateur non connecte : aucune donnee privee. */
export function useSentinelAlerts(pollMs = 10 * 60 * 1000): { state: PrivateState; reload: () => void; ack: (id: string) => Promise<boolean> } {
  const [state, setState] = useState<PrivateState>({ status: "loading" });
  const reload = useCallback(() => {
    // Meme regle que ConnectButton : sans adresse memorisee il n'y a pas de session.
    // Un visiteur ne declenche donc ni appel authentifie, ni refresh, ni wcore-auth-expired.
    if (!hasStoredSession()) { setState({ status: "anonymous" }); return; }
    apiFetch("/api/sentinel/alerts")
      .then(async (r) => {
        if (r.status === 401) return setState({ status: "anonymous" });
        if (!r.ok) return setState({ status: "error" });
        setState({ status: "ok", data: (await r.json()) as SentinelAlertsResponse });
      })
      .catch(() => setState({ status: "error" }));
  }, []);
  useEffect(() => {
    reload();
    const t = setInterval(reload, pollMs);
    const onChange = () => reload();
    const events = ["wcore-auth-changed", "wcore-logout", SENTINEL_CHANGED_EVENT];
    // Un accuse de reception depuis un composant resynchronise tous les autres (cloche, page).
    for (const e of events) window.addEventListener(e, onChange);
    return () => {
      clearInterval(t);
      for (const e of events) window.removeEventListener(e, onChange);
    };
  }, [reload, pollMs]);
  const ack = useCallback(async (id: string) => {
    const r = await apiFetch(`/api/sentinel/alerts/${encodeURIComponent(id)}/ack`, { method: "POST" }).catch(() => null);
    if (r && r.ok) { window.dispatchEvent(new Event(SENTINEL_CHANGED_EVENT)); return true; }
    return false;
  }, []);
  return { state, reload, ack };
}

/** undefined = chargement en cours ; null = etat de la surveillance inconnu (jamais affiche comme sain). */
export function useSentinelHealth(): SentinelHealthResponse | null | undefined {
  const [h, setH] = useState<SentinelHealthResponse | null | undefined>(undefined);
  useEffect(() => {
    fetch(`${getApiUrl()}/api/sentinel/health`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then(setH).catch(() => setH(null));
  }, []);
  return h;
}
