"use client";

import { useEffect, useMemo, useState } from "react";
import { useSentinelAlerts, useSentinelChains, useSentinelHealth } from "@/lib/use-sentinel";
import {
  CODE_LABEL, DEADLINE_LABEL, STATUS_LABEL, formatCountdown, nextDeadline, severityClass, sortAlerts, statusClass,
  type SentinelAlertView, type SentinelChainView,
} from "@/lib/sentinel-view";

function useNow(stepMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), stepMs); return () => clearInterval(t); }, [stepMs]);
  return now;
}

function SourceLinks({ urls }: { urls: { url: string; publisher: string; official: boolean }[] }) {
  if (!urls.length) return <span className="text-muted">aucune source</span>;
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1">
      {urls.map((s) => (
        <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="underline decoration-dotted hover:text-fg">
          {s.publisher}{s.official ? "" : " (non officielle)"}
        </a>
      ))}
    </span>
  );
}

function AlertCard({ a, chain, onAck, now, generatedAt }: { a: SentinelAlertView; chain?: SentinelChainView; onAck?: (id: string) => void; now: number; generatedAt: number }) {
  const countdown = a.actionByMs === null ? null : a.actionByMs - now;
  return (
    <li className={`rounded-lg border p-3 ${severityClass(a.severity)}`} data-testid="sentinel-alert">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-black/30 px-1.5 py-0.5 text-xs font-bold">{a.severity}</span>
        <span className="font-semibold">{chain?.name ?? a.chainKey}</span>
        <span className="text-sm">{CODE_LABEL[a.code] ?? a.code}</span>
        {a.conflict && <span className="rounded bg-black/30 px-1.5 text-xs">dates contradictoires</span>}
        {a.acknowledged && <span className="ml-auto text-xs opacity-80">acquittée</span>}
      </div>
      <div className="mt-1 text-sm opacity-90">
        {a.deadlineKind ? `${DEADLINE_LABEL[a.deadlineKind] ?? a.deadlineKind} : ` : ""}
        {a.actionByMs !== null ? `${new Date(a.actionByMs).toISOString().slice(0, 16).replace("T", " ")} UTC — ${formatCountdown(countdown)}` : ""}
        {a.exposure !== "AUTH_REQUIRED" && <span className="ml-2">· exposition : {a.exposure}</span>}
      </div>
      {chain?.recoveryNote && <p className="mt-1 text-xs opacity-80">{chain.recoveryNote}</p>}
      <div className="mt-1 text-xs opacity-80">
        <SourceLinks urls={a.officialSourceUrls.map((u) => ({ url: u, publisher: new URL(u).hostname, official: true }))} />
      </div>
      {onAck && a.id && !a.acknowledged && (a.severity === "P0" || a.severity === "P1") && (
        <button type="button" onClick={() => onAck(a.id!)} className="mt-2 min-h-11 rounded-md border border-current px-3 py-1 text-xs font-semibold hover:bg-black/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
          Accuser réception
        </button>
      )}
      <span className="sr-only">Calculé le {new Date(generatedAt).toISOString()}</span>
    </li>
  );
}

export function SentinelClient() {
  const now = useNow();
  const chains = useSentinelChains();
  const health = useSentinelHealth();
  const { state, ack } = useSentinelAlerts();
  const byKey = useMemo(() => new Map((chains?.chains ?? []).map((c) => [c.chainKey, c])), [chains]);
  const privateAlerts = state.status === "ok" ? sortAlerts(state.data.alerts) : [];
  const publicAlerts = sortAlerts(chains?.alerts ?? []);
  const shownAlerts = state.status === "ok" ? privateAlerts : publicAlerts;
  const active = (chains?.chains ?? []).filter((c) => c.status === "WINDING_DOWN" || c.status === "UNKNOWN");
  const retired = (chains?.chains ?? []).filter((c) => c.status === "RETIRED");
  const genAt = chains ? Date.parse(chains.generatedAt) : now;
  // Les ancres (#chain-…, #alertes) visent des elements rendus apres chargement : defiler une fois les donnees la.
  useEffect(() => {
    if (!chains || typeof window === "undefined" || !window.location.hash) return;
    document.getElementById(decodeURIComponent(window.location.hash.slice(1)))?.scrollIntoView({ block: "start" });
  }, [chains]);
  // Bannière P0 : alertes critiques non acquittées (personnelles si connecté, sinon générales).
  const criticalOpen = shownAlerts.filter((a) => a.severity === "P0" && !a.acknowledged);

  return (
    <main className="mx-auto max-w-5xl px-3 py-6 sm:px-6">
      <header className="mb-4">
        <h1 className="text-2xl font-bold">Chain Sentinel</h1>
        <p className="text-sm text-muted">Fermetures et migrations de réseaux : échéances, sources officielles, exposition de votre portefeuille. Aucune transaction n&apos;est jamais effectuée.</p>
      </header>

      {criticalOpen.length > 0 && (
        <div role="alert" data-testid="sentinel-p0-banner" className={`mb-4 rounded-lg border px-3 py-2 text-sm font-semibold ${severityClass("P0")}`}>
          {state.status === "ok" ? "Alerte critique" : "Alerte critique générale (exposition non vérifiée)"} : {criticalOpen.map((a) => `${byKey.get(a.chainKey)?.name ?? a.chainKey} (${CODE_LABEL[a.code] ?? a.code})`).join(" · ")}.{" "}
          <a href="#alertes" className="underline">Voir les alertes</a>
        </div>
      )}

      <section aria-label="État de la surveillance" className="mb-4">
        {health === undefined ? (
          <p className="rounded-md border border-border px-3 py-2 text-sm text-muted">Surveillance : vérification…</p>
        ) : health === null ? (
          <p role="alert" className={`rounded-md border px-3 py-2 text-sm ${severityClass("P1")}`}>Surveillance : état inconnu (service injoignable). Les échéances affichées peuvent être obsolètes.</p>
        ) : health.monitoring.status === "STALE" ? (
          <p role="alert" className={`rounded-md border px-3 py-2 text-sm ${severityClass(health.monitoring.severity ?? "P1")}`}>
            Surveillance interrompue : dernier contrôle réussi {health.lastSuccessAt ? new Date(health.lastSuccessAt).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "jamais"}. Les échéances affichées peuvent être obsolètes.
          </p>
        ) : (
          <p className="rounded-md border border-border px-3 py-2 text-sm text-muted">
            Dernier contrôle automatique : {health.lastSuccessAt ? new Date(health.lastSuccessAt).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "—"} · {health.sourcesChecked} source(s), {health.sourcesFailed} en échec.
          </p>
        )}
      </section>

      <section id="alertes" aria-label="Alertes" className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">Alertes</h2>
        {state.status === "anonymous" && <p className="mb-2 text-sm text-muted">Connectez-vous pour voir l&apos;exposition de votre portefeuille ; les alertes ci-dessous sont générales.</p>}
        {state.status === "error" && <p className="mb-2 text-sm text-amber-200">Alertes personnelles indisponibles pour le moment.</p>}
        {chains === undefined && state.status !== "ok" ? <p className="text-sm text-muted">Chargement…</p> : chains === null && state.status !== "ok" ? (
          <p role="alert" className={`rounded-md border px-3 py-2 text-sm ${severityClass("P1")}`}>Registre Chain Sentinel indisponible : impossible d&apos;afficher les alertes. Ce n&apos;est pas une absence d&apos;alerte.</p>
        ) : shownAlerts.length === 0 ? (
          <p className="text-sm text-muted">Aucune alerte.</p>
        ) : (
          <ul className="space-y-2">
            {shownAlerts.map((a, i) => (
              <AlertCard key={a.id ?? `${a.chainKey}-${a.code}-${i}`} a={a} chain={byKey.get(a.chainKey)} now={now} generatedAt={genAt} onAck={state.status === "ok" ? (id) => { void ack(id); } : undefined} />
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Chaînes surveillées" className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">Chaînes surveillées</h2>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-card text-left text-xs uppercase text-muted">
              <tr><th className="px-3 py-2">Réseau</th><th className="px-3 py-2">Statut</th><th className="px-3 py-2">Prochaine échéance</th><th className="px-3 py-2">Sources</th></tr>
            </thead>
            <tbody>
              {[...active, ...retired].map((c) => {
                const d = nextDeadline(c);
                return (
                  <tr key={c.chainKey} id={`chain-${c.chainKey}`} className="border-t border-border align-top">
                    <td className="px-3 py-2"><div className="font-medium">{c.name}</div><div className="text-xs text-muted">chain ID {c.chainId}{c.successorChainId ? ` · successeur distinct ${c.successorChainId}` : ""}</div></td>
                    <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs ${statusClass(c.status)}`}>{STATUS_LABEL[c.status]}</span></td>
                    <td className="px-3 py-2">{d ? <><div>{DEADLINE_LABEL[d.kind] ?? d.kind}</div><div className="text-xs text-muted">{d.at.slice(0, 16).replace("T", " ")} UTC · {formatCountdown(Date.parse(d.at) - now)}</div></> : "—"}</td>
                    <td className="px-3 py-2 text-xs"><SourceLinks urls={Array.from(new Map(c.deadlines.flatMap((x) => x.sources).map((s) => [s.url, s])).values())} /></td>
                  </tr>
                );
              })}
              {chains === undefined && <tr><td colSpan={4} className="px-3 py-3 text-muted">Chargement…</td></tr>}
              {chains === null && <tr><td colSpan={4} className="px-3 py-3 text-muted">Registre indisponible.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-label="Historique des chaînes retirées">
        <h2 className="mb-2 text-lg font-semibold">Chaînes retirées et récupération</h2>
        <ul className="space-y-2 text-sm">
          {retired.map((c) => (
            <li key={c.chainKey} className="rounded-lg border border-border p-3">
              <div className="font-medium">{c.name} <span className="text-xs text-muted">(chain ID {c.chainId})</span></div>
              <div className="text-xs text-muted">Récupération : {{ AVAILABLE: "ouverte", PLANNED: "annoncée, non ouverte", NOT_AVAILABLE: "aucune", UNKNOWN: "non établie" }[c.recoveryAfterShutdown]}{c.recoveryNote ? ` — ${c.recoveryNote}` : ""}</div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
