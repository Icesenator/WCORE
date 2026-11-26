"use client";
import {
  collectOfficialChanges, formatChangeDate, OFFICIAL_CHANGES_TEXT, type ChainOfficialChanges, type OfficialChangeView,
} from "@/lib/sentinel-official-changes";

type Lang = "fr" | "en";
type Txt = (typeof OFFICIAL_CHANGES_TEXT)[Lang];

function Card({ chain, change, lang, tx, tone }: { chain: string; change: OfficialChangeView; lang: Lang; tx: Txt; tone: "vigilance" | "info" }) {
  return (
    <li className={`rounded-lg border p-3 text-sm ${tone === "vigilance" ? "border-amber-400/60 bg-amber-950/20" : "border-border bg-card"}`}>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-medium">{chain}</span>
        <span className={`rounded-full border px-2 py-0.5 text-xs ${tone === "vigilance" ? "border-amber-400/60 text-amber-200" : "border-border text-muted"}`}>{tone === "vigilance" ? tx.vigilance : tx.info}</span>
      </div>
      <p className="mt-1 font-medium">{tx.modifiedOn(formatChangeDate(change.detectedAt, lang))}</p>
      <p className="text-xs text-muted">{tone === "vigilance" ? tx.seems : tx.seemsInfo}</p>
      {change.excerpts.length > 0 && (
        <div className="mt-2">
          <p className="text-xs text-muted">{tx.excerpt}</p>
          <ul className="mt-1 space-y-1">
            {change.excerpts.map((e, i) => <li key={i} className="rounded border border-border/60 bg-bg/30 px-2 py-1 text-xs italic">{e}</li>)}
          </ul>
        </div>
      )}
      <a href={change.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs underline">{tx.open}</a>
    </li>
  );
}

/** Changements de pages officielles : vigilance en tete, information repliee, mineur tres discret. Texte echappe par React, jamais de HTML. */
export function OfficialChanges({ chains, lang, now }: { chains: ReadonlyArray<{ chainKey: string; name: string; officialChanges?: unknown }> | null | undefined; lang: Lang; now: number }) {
  const tx = OFFICIAL_CHANGES_TEXT[lang];
  const { vigilance, info, minor } = collectOfficialChanges(chains, now);
  if (chains == null) return null;
  const flat = (g: ChainOfficialChanges[]) => g.flatMap((c) => c.changes.map((x) => ({ chain: c.name, key: JSON.stringify([c.chainKey, x.sourceId, x.detectedAt, x.level, x.excerpts]), x })));
  const infos = flat(info);
  const minors = flat(minor);
  return (
    <section aria-label={tx.title} className="mb-6" data-testid="sentinel-official-changes">
      <h2 className="mb-1 text-lg font-semibold">{tx.title}</h2>
      <p className="mb-2 text-xs text-muted">{tx.intro}</p>
      {vigilance.length === 0 && infos.length === 0 && minors.length === 0 && <p className="text-sm text-muted">{tx.none}</p>}
      {vigilance.length > 0 && <ul className="space-y-2" data-testid="sentinel-official-vigilance">{flat(vigilance).map(({ chain, key, x }) => <Card key={key} chain={chain} change={x} lang={lang} tx={tx} tone="vigilance" />)}</ul>}
      {infos.length > 0 && (
        <details className="mt-3" data-testid="sentinel-official-info">
          <summary className="min-h-11 cursor-pointer py-2 text-sm text-muted">{tx.moreInfo(infos.length)}</summary>
          <ul className="mt-2 space-y-2">{infos.map(({ chain, key, x }) => <Card key={key} chain={chain} change={x} lang={lang} tx={tx} tone="info" />)}</ul>
        </details>
      )}
      {minors.length > 0 && (
        <details className="mt-2" data-testid="sentinel-official-minor">
          <summary className="cursor-pointer text-xs text-muted">{tx.minorTitle(minors.length)}</summary>
          <ul className="mt-1 space-y-0.5 text-xs text-muted">
            {minors.map(({ chain, key, x }) => (
              <li key={key}>{chain} — {formatChangeDate(x.detectedAt, lang)} · <a href={x.url} target="_blank" rel="noopener noreferrer" className="underline">{tx.open}</a></li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
