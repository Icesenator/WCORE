"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePreferences } from "@/components/PreferencesProvider";
import { useSentinelAlerts, useSentinelChains, useSentinelHealth } from "@/lib/use-sentinel";
import {
  alertAnchorId, alertGroup, codeLabel, deadlineLabel, formatDeadlineAt, formatDeadlineCountdown, guideText, nextDeadline, opensAtLabel, recoveryGuideView, recoveryLabel, recoveryNoteFor, sentinelText, severityClass, sortAlerts, sourcePublisherFor, statusClass, statusLabel, upcomingTimeline,
  type SentinelAlertView, type SentinelChainView, type SentinelGuideItemView, type SentinelLang, type SentinelSourceView, type SentinelText,
} from "@/lib/sentinel-view";
import { OfficialChanges } from "./OfficialChanges";

function useNow(stepMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), stepMs); return () => clearInterval(t); }, [stepMs]);
  return now;
}

function SourceLinks({ urls, tx, lang }: { urls: { url: string; publisher: string; publisherEn?: string | null; official: boolean }[]; tx: SentinelText; lang: SentinelLang }) {
  if (!urls.length) return <span className="text-muted">{tx.noSource}</span>;
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1">
      {urls.map((s) => (
        <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="underline decoration-dotted hover:text-fg">
          {sourcePublisherFor(s, lang)}{s.official ? "" : tx.unofficial}
        </a>
      ))}
    </span>
  );
}

function InlineSources({ sources, lang }: { sources: SentinelSourceView[]; lang: SentinelLang }) {
  return (
    <span className="ml-1 opacity-70">
      ({sources.map((s, i) => (
        <span key={s.url}>{i > 0 ? ", " : ""}<a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="underline decoration-dotted hover:text-fg">{sourcePublisherFor(s, lang)}</a></span>
      ))})
    </span>
  );
}

function GuideList({ title, items, ordered, lang }: { title: string; items: SentinelGuideItemView[]; ordered?: boolean; lang: SentinelLang }) {
  if (!items.length) return null;
  const Tag = ordered ? "ol" : "ul";
  return (
    <div className="mt-2">
      <div className="font-semibold">{title}</div>
      <Tag className={`ml-4 mt-1 space-y-1 ${ordered ? "list-decimal" : "list-disc"}`}>
        {items.map((it, i) => <li key={i}>{guideText(it, lang)}<InlineSources sources={it.sources} lang={lang} /></li>)}
      </Tag>
    </div>
  );
}

/** Bloc repliable « Comment recuperer mes fonds » ; rien si la chaine n'a pas de guide valide. */
function RecoveryGuideBlock({ chain, lang, tx }: { chain?: SentinelChainView; lang: SentinelLang; tx: SentinelText }) {
  const g = recoveryGuideView(chain);
  if (!g) return null;
  return (
    <details className="mt-2 rounded-md border border-current/30 bg-black/20 px-3 py-1 text-xs" data-testid="sentinel-recovery-guide">
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">{tx.guideTitle}</summary>
      {g.opensAt && <p className="mt-1 font-semibold">{tx.guideOpensAt(opensAtLabel(g.opensAt, lang))}<InlineSources sources={g.opensAt.sources} lang={lang} /></p>}
      {g.links.length > 0 && (
        <div className="mt-2">
          <div className="font-semibold">{tx.guideLinks}</div>
          <ul className="ml-4 mt-1 list-disc space-y-1">
            {g.links.map((l) => (
              <li key={l.url}>
                <a href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="font-medium underline hover:text-fg">{lang === "en" ? l.labelEn : l.labelFr}</a>
                <span className="ml-1 opacity-70">{new URL(l.url).hostname}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <GuideList title={tx.guideSteps} items={g.steps} ordered lang={lang} />
      <GuideList title={tx.guideEligibility} items={g.eligibility} lang={lang} />
      <GuideList title={tx.guideFeesRisks} items={g.feesAndRisks} lang={lang} />
      <p className="my-2 opacity-70">{tx.guideVerified(g.verifiedAt.slice(0, 10))}</p>
    </details>
  );
}

function CopyLinkButton({ anchorId, tx }: { anchorId: string; tx: SentinelText }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    const url = `${window.location.origin}${window.location.pathname}#${anchorId}`;
    window.history.replaceState(null, "", `#${anchorId}`);
    void navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }, () => undefined);
  };
  return (
    <button type="button" onClick={copy} className="ml-auto min-h-11 rounded px-2 text-xs underline decoration-dotted opacity-80 hover:opacity-100 focus-visible:outline focus-visible:outline-2">
      {copied ? tx.linkCopied : tx.copyLink}
    </button>
  );
}

function AlertCard({ a, chain, onAck, now, generatedAt, lang, tx, anchorId }: { a: SentinelAlertView; chain?: SentinelChainView; onAck?: (id: string) => void; now: number; generatedAt: number; lang: SentinelLang; tx: SentinelText; anchorId?: string }) {
  const countdown = a.actionByMs === null ? null : a.actionByMs - now;
  return (
    <li id={anchorId} className={`scroll-mt-4 rounded-lg border p-3 ${severityClass(a.severity)}`} data-testid="sentinel-alert">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-black/30 px-1.5 py-0.5 text-xs font-bold">{a.severity}</span>
        <span className="font-semibold">{chain?.name ?? a.chainKey}</span>
        <span className="text-sm">{codeLabel(a.code, lang)}</span>
        {a.conflict && <span className="rounded bg-black/30 px-1.5 text-xs">{tx.conflictingDates}</span>}
        {a.acknowledged && <span className="text-xs opacity-80">{tx.acknowledged}</span>}
        {anchorId && <CopyLinkButton anchorId={anchorId} tx={tx} />}
      </div>
      <div className="mt-1 text-sm opacity-90">
        {a.deadlineKind ? `${deadlineLabel(a.deadlineKind, lang)}${lang === "fr" ? " :" : ":"} ` : ""}
        {a.actionByMs !== null ? `${formatDeadlineAt(new Date(a.actionByMs).toISOString(), a.deadlineApproximate, lang)} — ${formatDeadlineCountdown(countdown, a.deadlineApproximate, lang)}` : ""}
        {a.exposure !== "AUTH_REQUIRED" && <span className="ml-2">· {tx.exposure}{lang === "fr" ? " :" : ":"} {a.exposure}</span>}
      </div>
      {chain && recoveryNoteFor(chain, lang) && <p className="mt-1 text-xs opacity-80">{recoveryNoteFor(chain, lang)}</p>}
      <div className="mt-1 text-xs opacity-80">
        <SourceLinks urls={a.officialSourceUrls.map((u) => ({ url: u, publisher: new URL(u).hostname, official: true }))} tx={tx} lang={lang} />
      </div>
      <RecoveryGuideBlock chain={chain} lang={lang} tx={tx} />
      {onAck && a.id && !a.acknowledged && (a.severity === "P0" || a.severity === "P1") && (
        <button type="button" onClick={() => onAck(a.id!)} className="mt-2 min-h-11 rounded-md border border-current px-3 py-1 text-xs font-semibold hover:bg-black/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
          {tx.acknowledge}
        </button>
      )}
      <span className="sr-only">{tx.computedAt(new Date(generatedAt).toISOString())}</span>
    </li>
  );
}

export function SentinelClient() {
  const { language: lang } = usePreferences();
  const tx = sentinelText(lang);
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
  // Les ancres (#chain-…, #alertes, #alerte-<cle>) visent des elements rendus apres chargement : defiler une fois
  // les donnees la, en ouvrant d'abord le groupe replie qui contient la cible (sinon le lien tomberait dans le vide).
  // Une seule fois par chargement : un rafraichissement des donnees ne fait pas redefiler la page.
  const scrolledToHash = useRef(false);
  useEffect(() => {
    if (!chains || scrolledToHash.current || typeof window === "undefined" || !window.location.hash) return;
    let id: string;
    try { id = decodeURIComponent(window.location.hash.slice(1)); } catch { return; }
    const el = document.getElementById(id);
    if (!el) return;
    scrolledToHash.current = true;
    for (let d = el.closest("details"); d; d = d.parentElement?.closest("details") ?? null) d.open = true;
    el.scrollIntoView({ block: "start" });
  }, [chains]);
  // Groupes d'urgence : ce qui demande une action (echeance a venir, recuperation ouverte ou annoncee, P0)
  // d'abord ; les chaines deja fermees sans exposition connue ensuite, repliees.
  const nowAlerts = shownAlerts.filter((a) => alertGroup(a, byKey.get(a.chainKey), now) === "now");
  const closedAlerts = shownAlerts.filter((a) => alertGroup(a, byKey.get(a.chainKey), now) === "closed");
  // Une seule ancre par chaine : la premiere alerte rendue (ordre de gravite) la porte.
  const anchored = new Set<string>();
  const anchorFor = (a: SentinelAlertView) => {
    if (a.chainKey === "sentinel" || anchored.has(a.chainKey)) return undefined;
    anchored.add(a.chainKey);
    return alertAnchorId(a.chainKey);
  };
  const timeline = upcomingTimeline(chains?.chains, now);
  const renderCard = (a: SentinelAlertView, i: number) => (
    <AlertCard key={a.id ?? `${a.chainKey}-${a.code}-${i}`} a={a} chain={byKey.get(a.chainKey)} now={now} generatedAt={genAt} lang={lang} tx={tx} anchorId={anchorFor(a)} onAck={state.status === "ok" ? (id) => { void ack(id); } : undefined} />
  );
  // Bannière P0 : alertes critiques non acquittées (personnelles si connecté, sinon générales).
  const criticalOpen = shownAlerts.filter((a) => a.severity === "P0" && !a.acknowledged);

  return (
    <main className="mx-auto max-w-5xl px-3 py-6 sm:px-6">
      <header className="mb-4">
        <h1 className="text-2xl font-bold">Chain Sentinel</h1>
        <p className="text-sm text-muted">{tx.intro}</p>
      </header>

      {criticalOpen.length > 0 && (
        <div role="alert" data-testid="sentinel-p0-banner" className={`mb-4 rounded-lg border px-3 py-2 text-sm font-semibold ${severityClass("P0")}`}>
          {state.status === "ok" ? tx.criticalPersonal : tx.criticalGeneral}{lang === "fr" ? " :" : ":"} {criticalOpen.map((a) => `${byKey.get(a.chainKey)?.name ?? a.chainKey} (${codeLabel(a.code, lang)})`).join(" · ")}.{" "}
          <a href="#alertes" className="underline">{tx.seeAlerts}</a>
        </div>
      )}

      <section aria-label={tx.monitoringRegion} className="mb-4">
        {health === undefined ? (
          <p className="rounded-md border border-border px-3 py-2 text-sm text-muted">{tx.monitoringChecking}</p>
        ) : health === null ? (
          <p role="alert" className={`rounded-md border px-3 py-2 text-sm ${severityClass("P1")}`}>{tx.monitoringUnknown}</p>
        ) : health.monitoring.status === "STALE" ? (
          <p role="alert" className={`rounded-md border px-3 py-2 text-sm ${severityClass(health.monitoring.severity ?? "P1")}`}>
            {tx.monitoringStale(health.lastSuccessAt ? new Date(health.lastSuccessAt).toISOString().slice(0, 16).replace("T", " ") + " UTC" : tx.never)}
          </p>
        ) : (
          <p className="rounded-md border border-border px-3 py-2 text-sm text-muted">
            {tx.lastCheck(health.lastSuccessAt ? new Date(health.lastSuccessAt).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "—", health.sourcesChecked, health.sourcesFailed)}
          </p>
        )}
      </section>

      {chains && (
        <section aria-label={tx.timelineTitle} className="mb-6" data-testid="sentinel-timeline">
          <h2 className="mb-2 text-lg font-semibold">{tx.timelineTitle}</h2>
          {timeline.length === 0 ? <p className="text-sm text-muted">{tx.timelineEmpty}</p> : (
            <>
              <div className="relative mb-3 h-6 rounded-full border border-border bg-card" aria-hidden="true">
                {timeline.map((e) => (
                  <span key={`${e.chainKey}-${e.kind}-${e.atMs}`} title={`${e.name} · ${e.kind === "RECOVERY_OPENS" ? tx.recoveryOpens : deadlineLabel(e.kind, lang)}`}
                    className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/40 ${e.kind === "RECOVERY_OPENS" ? "bg-emerald-400" : e.kind === "NETWORK_SHUTDOWN" ? "bg-red-400" : "bg-amber-300"}`}
                    style={{ left: `${Math.min(98, Math.max(2, ((e.atMs - now) / (90 * 86400000)) * 100))}%` }} />
                ))}
              </div>
              <ol className="space-y-1 text-sm">
                {timeline.map((e) => (
                  <li key={`${e.chainKey}-${e.kind}-${e.atMs}`} className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-mono text-xs text-muted">{e.kind === "RECOVERY_OPENS" ? opensAtLabel(e, lang) : formatDeadlineAt(e.at, e.approximate, lang)}</span>
                    <a href={`#${alertAnchorId(e.chainKey)}`} className="font-medium underline decoration-dotted">{e.name}</a>
                    <span>{e.kind === "RECOVERY_OPENS" ? tx.recoveryOpens : deadlineLabel(e.kind, lang)}</span>
                    <span className="text-xs text-muted">{formatDeadlineCountdown(e.atMs - now, e.approximate, lang)}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>
      )}

      <section id="alertes" aria-label={tx.alertsTitle} className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">{tx.alertsTitle}</h2>
        {state.status === "anonymous" && <p className="mb-2 text-sm text-muted">{tx.signInForExposure}</p>}
        {state.status === "error" && <p className="mb-2 text-sm text-amber-200">{tx.personalUnavailable}</p>}
        {chains === undefined && state.status !== "ok" ? <p className="text-sm text-muted">{tx.loading}</p> : chains === null && state.status !== "ok" ? (
          <p role="alert" className={`rounded-md border px-3 py-2 text-sm ${severityClass("P1")}`}>{tx.registryUnavailableAlerts}</p>
        ) : shownAlerts.length === 0 ? (
          <p className="text-sm text-muted">{tx.noAlerts}</p>
        ) : (
          <>
            {nowAlerts.length > 0 && (
              <>
                <h3 className="mb-2 text-sm font-semibold uppercase text-muted">{tx.groupNow}</h3>
                <ul className="space-y-2" data-testid="sentinel-alerts-now">{nowAlerts.map(renderCard)}</ul>
              </>
            )}
            {closedAlerts.length > 0 && (
              <details className="mt-4" data-testid="sentinel-alerts-closed">
                <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold uppercase text-muted">{tx.groupClosed(closedAlerts.length)}</summary>
                <ul className="mt-2 space-y-2">{closedAlerts.map(renderCard)}</ul>
              </details>
            )}
          </>
        )}
      </section>

      <OfficialChanges chains={chains ? [...chains.chains, ...(chains.extraOfficialChanges ?? [])] : chains} lang={lang === "fr" ? "fr" : "en"} now={now} />

      <section aria-label={tx.chainsTitle} className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">{tx.chainsTitle}</h2>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-card text-left text-xs uppercase text-muted">
              <tr><th className="px-3 py-2">{tx.colNetwork}</th><th className="px-3 py-2">{tx.colStatus}</th><th className="px-3 py-2">{tx.colNextDeadline}</th><th className="px-3 py-2">{tx.colSources}</th></tr>
            </thead>
            <tbody>
              {[...active, ...retired].map((c) => {
                const d = nextDeadline(c);
                return (
                  <tr key={c.chainKey} id={`chain-${c.chainKey}`} className="border-t border-border align-top">
                    <td className="px-3 py-2"><div className="font-medium">{c.name}</div><div className="text-xs text-muted">chain ID {c.chainId}{c.successorChainId ? ` · ${tx.successor(c.successorChainId)}` : ""}</div></td>
                    <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs ${statusClass(c.status)}`}>{statusLabel(c.status, lang)}</span></td>
                    <td className="px-3 py-2">{d ? <><div>{deadlineLabel(d.kind, lang)}</div><div className="text-xs text-muted">{formatDeadlineAt(d.at, d.approximate, lang)} · {formatDeadlineCountdown(Date.parse(d.at) - now, d.approximate, lang)}</div></> : "—"}</td>
                    <td className="px-3 py-2 text-xs"><SourceLinks urls={Array.from(new Map([...c.deadlines.flatMap((x) => x.sources), ...(c.sources ?? [])].map((s) => [s.url, s])).values())} tx={tx} lang={lang} /></td>
                  </tr>
                );
              })}
              {chains === undefined && <tr><td colSpan={4} className="px-3 py-3 text-muted">{tx.loading}</td></tr>}
              {chains === null && <tr><td colSpan={4} className="px-3 py-3 text-muted">{tx.registryUnavailable}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-label={tx.retiredRegion}>
        <h2 className="mb-2 text-lg font-semibold">{tx.retiredTitle}</h2>
        <ul className="space-y-2 text-sm">
          {retired.map((c) => (
            <li key={c.chainKey} className="rounded-lg border border-border p-3">
              <div className="font-medium">{c.name} <span className="text-xs text-muted">(chain ID {c.chainId})</span></div>
              <div className="text-xs text-muted">{tx.recovery}{lang === "fr" ? " :" : ":"} {recoveryLabel(c.recoveryAfterShutdown, lang)}{recoveryNoteFor(c, lang) ? ` — ${recoveryNoteFor(c, lang)}` : ""}</div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
