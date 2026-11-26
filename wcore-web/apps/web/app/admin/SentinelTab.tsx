"use client";
import { useCallback, useEffect, useState } from "react";
import { getApiUrl } from "@/lib/api";
import {
  splitProposals, shortHash, safeHttpsUrl, chainDisplayName, kindLabel, statusLabel,
  type SentinelProposal, type SentinelChainName,
} from "@/lib/admin-sentinel";

const API_URL = getApiUrl();

function fmt(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleString("fr-FR") : iso;
}

function SourceLink({ url }: { url: string }) {
  const href = safeHttpsUrl(url);
  if (!href) return <span className="text-muted break-all">{url} (lien non https, non affich&eacute;)</span>;
  return <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent underline break-all">{href}</a>;
}

/** Vue reservee a l'administrateur : le serveur repond 401 aux autres, rien n'est expose sans session admin. */
export function SentinelTab() {
  const [proposals, setProposals] = useState<SentinelProposal[] | null>(null);
  const [chains, setChains] = useState<SentinelChainName[]>([]);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Acces perdu : aucune donnee Sentinel ne reste a l'ecran ni dans l'etat.
  const lose = () => { setProposals(null); setChains([]); setNotes({}); setConfirming(null); setError("Authentification administrateur requise."); };

  const load = useCallback(async (keepError = false) => {
    try {
      const pRes = await fetch(`${API_URL}/api/admin/sentinel/proposals`, { credentials: "include", cache: "no-store" });
      if (pRes.status === 401) { lose(); return; }
      if (!pRes.ok) { setError(`Erreur API ${pRes.status}`); return; }
      const body = await pRes.json() as { proposals?: SentinelProposal[] };
      setProposals(Array.isArray(body.proposals) ? body.proposals : []);
      if (!keepError) setError("");
    } catch (e) {
      setError((e as Error).message);
    }
    // Noms lisibles : plus tard et sans jamais bloquer ni effacer le reste (lecture publique, un echec laisse les cles brutes).
    try {
      const cRes = await fetch(`${API_URL}/api/sentinel/chains`);
      if (cRes.ok) {
        const c = await cRes.json() as { chains?: SentinelChainName[] };
        setChains(Array.isArray(c.chains) ? c.chains.map((x) => ({ chainKey: x.chainKey, name: x.name })) : []);
      }
    } catch { /* cles brutes */ }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function reject(id: string) {
    setBusy(id);
    try {
      const res = await fetch(`${API_URL}/api/admin/sentinel/proposals/${encodeURIComponent(id)}`, {
        method: "POST", credentials: "include", headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: "REJECTED", note: (notes[id] || "").trim() || undefined }),
      });
      if (res.status === 401) lose();
      else if (res.status === 409) { setError("Proposition déjà traitée ou collecte en cours : réessaie dans un instant."); setConfirming(null); await load(true); }
      else if (!res.ok) setError(`Rejet refusé (${res.status})`);
      else { setConfirming(null); await load(); }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (error && !proposals) return <p className="text-sm text-red-400">{error}</p>;
  if (!proposals) return <p className="text-muted">Chargement…</p>;
  const { pending, decided } = splitProposals(proposals);

  return (
    <div>
      {error ? <p className="mb-3 text-sm text-red-400">{error}</p> : null}
      <h2 className="mb-2 text-sm font-semibold">Propositions en attente ({pending.length})</h2>
      <p className="mb-4 text-xs text-muted">
        Une proposition na&icirc;t quand une source officielle surveill&eacute;e change, ou qu&apos;une annonce contient un mot-cl&eacute; : ce n&apos;est pas forc&eacute;ment une fermeture de cha&icirc;ne.
        Ouvre la source, lis-la, puis classe sans suite si rien ne change. Si l&apos;annonce modifie une &eacute;ch&eacute;ance, ne rejette pas : signale-la pour mettre &agrave; jour la fiche de la cha&icirc;ne (l&apos;approbation exige une fiche compl&egrave;te, avec au moins une source officielle par &eacute;ch&eacute;ance).
      </p>
      {pending.length === 0 ? <p className="mb-6 text-sm text-muted">Aucune proposition en attente.</p> : null}
      <div className="mb-8 space-y-3">
        {pending.map((p) => (
          <div key={p.id} className="rounded-lg border border-border bg-card p-4 text-xs">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold">{chainDisplayName(p.chainKey, chains)}</span>
              <span className="rounded border border-yellow-500/40 px-2 py-0.5 text-yellow-400">{statusLabel(p.status)}</span>
            </div>
            <p className="text-muted">{kindLabel(p.kind)}</p>
            <p className="mt-1">Source : <span className="font-mono">{p.sourceId}</span> &mdash; <SourceLink url={p.url} /></p>
            <p className="mt-1">D&eacute;tect&eacute;e le {fmt(p.detectedAt)}</p>
            <p className="mt-1 font-mono text-[11px] text-muted">hash {shortHash(p.previousSha256)} &rarr; {shortHash(p.newSha256)}</p>
            {p.snippet ? <blockquote className="mt-2 whitespace-pre-wrap break-words rounded border border-border/60 bg-bg/30 p-2">{p.snippet}</blockquote> : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                value={notes[p.id] || ""} maxLength={500} placeholder="Note (facultatif)"
                onChange={(e) => setNotes((n) => ({ ...n, [p.id]: e.target.value }))}
                className="min-w-[12rem] flex-1 rounded border border-border bg-bg px-2 py-1 text-xs text-fg"
              />
              {confirming === p.id ? (
                <>
                  <button disabled={busy === p.id} onClick={() => reject(p.id)} className="rounded border border-red-500/60 px-3 py-1 text-red-400 hover:bg-red-950/30 disabled:opacity-50">Confirmer le rejet</button>
                  <button onClick={() => setConfirming(null)} className="rounded border border-border px-3 py-1 text-muted hover:text-fg">Annuler</button>
                </>
              ) : (
                <button onClick={() => setConfirming(p.id)} className="rounded border border-border px-3 py-1 hover:bg-card">Rejeter (classer sans suite)</button>
              )}
            </div>
          </div>
        ))}
      </div>

      <details>
        <summary className="cursor-pointer text-sm font-semibold">D&eacute;j&agrave; trait&eacute;es ({decided.length})</summary>
        <div className="mt-3 space-y-2">
          {decided.map((p) => (
            <div key={p.id} className="rounded border border-border/60 bg-bg/30 px-3 py-2 text-xs">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-semibold">{chainDisplayName(p.chainKey, chains)} <span className="font-mono text-muted">{p.sourceId}</span></span>
                <span className={p.status === "APPROVED" ? "text-green-400" : "text-muted"}>{statusLabel(p.status)} le {fmt(p.decidedAt)}</span>
              </div>
              {p.note ? <p className="mt-1 text-muted">{p.note}</p> : null}
            </div>
          ))}
          {decided.length === 0 ? <p className="text-xs text-muted">Aucune.</p> : null}
        </div>
      </details>
    </div>
  );
}
