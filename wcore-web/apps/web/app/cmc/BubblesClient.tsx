"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getApiUrl } from "@/lib/api";
import {
  bubbleMetric, bubbleShade, computeRadii, createBubbles, formatChange, isStablecoinRow, periodChange, selectBubbleRows, sharpLogoUrl, stepBubbles,
  type Bubble, type BubbleMode, type BubblePeriod,
} from "@/lib/market-bubbles";
import { parseMarketCapResponse, type MarketCapResponse, type MarketCapRow, type MarketKind } from "./market-cap";

interface BubblesClientProps {
  endpoint: string;
  title: string;
  kind: MarketKind;
  tablePath: string;
  /** Fenêtre détachée : pas de titre ni de menu, les bulles occupent toute la fenêtre. */
  popup?: boolean;
  /** Adresse de la version détachée, ouverte par le bouton « Pop out ». */
  popupPath?: string;
}

const PERIOD_LABELS: Record<BubblePeriod, string> = { h1: "Hour", d1: "Day", w1: "Week", m1: "Month" };
const COUNTS = [50, 100, 200, 500] as const;
// Les classements changent toutes les heures (cryptos) ou une fois par jour (actions) :
// relire toutes les 5 minutes suffit. Le serveur sert son instantané en cache.
const AUTO_REFRESH_MS = 300_000;

const eur = new Intl.NumberFormat("en", { style: "currency", currency: "EUR", notation: "compact", maximumFractionDigits: 2 });
const formatEur = (v: number | null) => (v !== null && Number.isFinite(v) ? eur.format(v) : "-");

interface Hover { row: MarketCapRow; left: number; top: number }

export function BubblesClient({ endpoint, title, kind, tablePath, popup = false, popupPath }: BubblesClientProps) {
  const periods: BubblePeriod[] = kind === "stock" ? ["d1", "w1", "m1"] : ["h1", "d1", "w1", "m1"];
  const [snapshot, setSnapshot] = useState<MarketCapResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<BubblePeriod>("d1");
  const [mode, setMode] = useState<BubbleMode>("change");
  const [count, setCount] = useState<number>(100);
  const [search, setSearch] = useState("");
  const [hideStables, setHideStables] = useState(false);
  // Fenêtre détachée : les commandes peuvent être repliées pour laisser toute la place aux bulles.
  const [controlsHidden, setControlsHidden] = useState(false);
  const [hover, setHover] = useState<Hover | null>(null);
  const [frameHeight, setFrameHeight] = useState(480);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bubblesRef = useRef<Bubble[]>([]);
  const rowsRef = useRef<Map<string, MarketCapRow>>(new Map());
  const sizeRef = useRef({ w: 800, h: 560 });
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const logosRef = useRef<Map<string, HTMLImageElement | null>>(new Map());
  const viewRef = useRef({ period, search: "" });
  const hasDataRef = useRef(false);
  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) paintBubbles(ctx, canvas, sizeRef.current, bubblesRef.current, rowsRef.current, viewRef.current, dragRef.current?.id ?? null, logosRef.current);
  }, []);
  useEffect(() => { viewRef.current = { period, search: search.trim().toLowerCase() }; paint(); }, [period, search, paint]);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`${getApiUrl()}${endpoint}`, { signal });
      if (!response.ok) throw new Error(`Request failed with HTTP ${response.status}`);
      setSnapshot(parseMarketCapResponse(await response.json()));
      hasDataRef.current = true;
      setError(null);
    } catch (cause) {
      if ((cause as { name?: string })?.name === "AbortError") return;
      // Une relecture ratée ne doit pas barrer des bulles déjà affichées : on garde les données
      // et on réessaie au prochain passage. L'erreur n'est montrée que s'il n'y a rien à afficher.
      if (hasDataRef.current) return;
      setError(cause instanceof Error ? cause.message : "Unable to load market data");
    }
  }, [endpoint]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    const timer = setInterval(() => { if (document.visibilityState === "visible") void load(); }, AUTO_REFRESH_MS);
    return () => { controller.abort(); clearInterval(timer); };
  }, [load]);

  // Choix mémorisé dans le navigateur (lu après le montage : identique au rendu serveur).
  useEffect(() => {
    try { if (localStorage.getItem("wcore_bubbles_hide_stables") === "1") setHideStables(true); } catch { /* stockage indisponible */ }
  }, []);
  function chooseStables(value: string) {
    const hide = value === "hide";
    setHideStables(hide);
    try { localStorage.setItem("wcore_bubbles_hide_stables", hide ? "1" : "0"); } catch { /* stockage indisponible */ }
  }

  // Les stablecoins sont retirés avant le classement : « Top 100 » reste 100 bulles.
  const rows = useMemo(() => {
    const all = snapshot?.rows ?? [];
    return selectBubbleRows(kind === "crypto" && hideStables ? all.filter((r) => !isStablecoinRow(r)) : all, count);
  }, [snapshot, count, kind, hideStables]);
  const knownChanges = useMemo(() => rows.filter((r) => periodChange(r, period) !== null).length, [rows, period]);

  // Aucune variation connue sur la période (ex. actions avant le premier jour d'historique) :
  // on taille par capitalisation plutôt que d'afficher un amas de bulles minuscules.
  const sizeMode: BubbleMode = mode === "change" && rows.length > 0 && knownChanges === 0 ? "marketcap" : mode;

  // (Re)calcule tailles et bulles quand les données, la période, le mode ou la taille changent.
  const rebuild = useCallback(() => {
    const { w, h } = sizeRef.current;
    // En capitalisation, BTC écraserait tout : échelle compressée (rayon ∝ capitalisation^0,3).
    const values = rows.map((r) => {
      const v = bubbleMetric(r, sizeMode, period);
      return v !== null && sizeMode === "marketcap" ? v ** 0.6 : v;
    });
    const radii = computeRadii(values, w, h, {
      fill: rows.length > 200 ? 0.68 : 0.64,
      minRadius: rows.length > 200 ? 6 : 10,
    });
    const previous = new Set(bubblesRef.current.map((b) => b.id));
    const next = createBubbles(rows, radii, w, h, bubblesRef.current);
    // Nouvelles bulles : on stabilise la disposition tout de suite, pour qu'elle soit propre dès
    // la première image (et même si le navigateur suspend l'animation).
    if (next.some((b) => !previous.has(b.id))) for (let i = 0; i < 240; i++) stepBubbles(next, w, h);
    bubblesRef.current = next;
    rowsRef.current = new Map(rows.map((r) => [r.symbol, r]));
    paint();
  }, [rows, sizeMode, period, paint]);

  useEffect(() => { rebuild(); }, [rebuild]);

  // Taille du canvas = taille du conteneur, en pixels physiques pour un rendu net.
  useEffect(() => {
    const wrap = wrapRef.current, canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const resize = () => {
      const w = Math.max(320, wrap.clientWidth);
      // Fenêtre détachée : toute la hauteur restante sous les commandes.
      const h = popup
        ? Math.max(200, Math.floor(window.innerHeight - wrap.getBoundingClientRect().top - 6))
        : Math.max(380, Math.min(window.innerHeight - 240, Math.round(w * 0.62)));
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      // Le cadre change de taille (hydratation, rotation, fenêtre) : on garde la disposition en
      // la mettant à l'échelle, sinon les bulles resteraient groupées dans l'ancienne surface.
      const prev = sizeRef.current;
      if (prev.w !== w || prev.h !== h) {
        for (const b of bubblesRef.current) { b.x *= w / prev.w; b.y *= h / prev.h; }
        for (let i = 0; i < 60; i++) stepBubbles(bubblesRef.current, w, h);
      }
      sizeRef.current = { w, h };
      setFrameHeight(h);
      rebuild();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    // La hauteur d'une fenêtre détachée peut changer sans que la largeur du cadre bouge.
    window.addEventListener("resize", resize);
    return () => { observer.disconnect(); window.removeEventListener("resize", resize); };
  }, [rebuild, popup, controlsHidden]);

  // Boucle d'animation : physique + dessin. requestAnimationFrame se met en pause onglet masqué.
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      stepBubbles(bubblesRef.current, sizeRef.current.w, sizeRef.current.h, { time: performance.now() });
      paint();
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [paint]);

  const hitTest = (x: number, y: number) => {
    const list = bubblesRef.current;
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i]!;
      if ((x - b.x) ** 2 + (y - b.y) ** 2 <= b.r * b.r) return b;
    }
    return null;
  };
  const localPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  function onPointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    const { x, y } = localPoint(event);
    const b = hitTest(x, y);
    if (!b) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { id: b.id, dx: x - b.x, dy: y - b.y };
  }
  function onPointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const { x, y } = localPoint(event);
    const drag = dragRef.current;
    if (drag) {
      const b = bubblesRef.current.find((item) => item.id === drag.id);
      if (b) { b.vx = (x - drag.dx - b.x) * 0.3; b.vy = (y - drag.dy - b.y) * 0.3; b.x = x - drag.dx; b.y = y - drag.dy; }
    }
    const hit = hitTest(x, y);
    const row = hit ? rowsRef.current.get(hit.id) : undefined;
    setHover(row ? { row, left: Math.max(8, Math.min(x + 14, sizeRef.current.w - 190)), top: Math.max(8, y - 10) } : null);
    event.currentTarget.style.cursor = hit ? (drag ? "grabbing" : "grab") : "default";
  }
  function onPointerUp() { dragRef.current = null; }

  const hoverChange = hover ? periodChange(hover.row, period) : null;

  function openPopup() {
    if (!popupPath) return;
    const w = Math.min(1600, window.screen.availWidth), h = Math.min(950, window.screen.availHeight);
    window.open(popupPath, `wcore-bubbles-${kind}`, `popup=yes,width=${w},height=${h}`);
  }

  return (
    <main className={popup ? "w-full px-1.5 pb-0 pt-1.5" : "w-full px-4 py-5 sm:px-6 sm:py-7"}>
      <header className={popup
        ? `mb-1.5 flex-wrap items-center gap-1.5 ${controlsHidden ? "hidden" : "flex"}`
        : "mb-4 flex flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-end lg:justify-between"}>
        <div className={popup ? "hidden" : undefined}>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">
            {kind === "stock" ? "Public companies" : "Crypto assets"} · bubbles
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-fg sm:text-3xl">{title}</h1>
          <p className="mt-2 text-sm text-muted">
            Size shows the {sizeMode === "change" ? "size of the move" : "market cap"}; green is up, red is down, grey is unknown.{" "}
            <Link href={tablePath} className="text-accent underline-offset-2 hover:underline">Table view</Link>
          </p>
        </div>
        <div className={popup ? "flex flex-wrap items-center gap-1.5" : "flex flex-wrap items-end gap-2"}>
          <Segmented compact={popup} label="Period" value={period} onChange={(v) => setPeriod(v as BubblePeriod)}
            options={periods.map((p) => ({ value: p, label: PERIOD_LABELS[p] }))} />
          <Segmented compact={popup} label="Size" value={mode} onChange={(v) => setMode(v as BubbleMode)}
            options={[{ value: "change", label: "Change" }, { value: "marketcap", label: "Market cap" }]} />
          <Segmented compact={popup} label="Top" value={String(count)} onChange={(v) => setCount(Number(v))}
            options={COUNTS.map((c) => ({ value: String(c), label: String(c) }))} />
          {kind === "crypto" ? (
            <Segmented compact={popup} label="Stablecoins" value={hideStables ? "hide" : "show"} onChange={chooseStables}
              options={[{ value: "show", label: popup ? "Stables" : "Show" }, { value: "hide", label: popup ? "No stables" : "Hide" }]} />
          ) : null}
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            {popup ? null : "Find"}
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Find"
              placeholder={popup ? "Find" : "Name or ticker"}
              className={popup
                ? "h-7 w-24 rounded-md border border-border bg-card px-2 text-xs text-fg outline-none focus:border-accent"
                : "h-9 w-40 rounded-lg border border-border bg-card px-3 text-sm text-fg outline-none focus:border-accent"} />
          </label>
          {popup ? (
            <button type="button" onClick={() => setControlsHidden(true)} title="Hide the controls"
              className="h-7 rounded-md border border-border bg-card px-2 text-xs text-muted transition hover:border-accent hover:text-accent">
              Collapse
            </button>
          ) : null}
          {!popup && popupPath ? (
            <button type="button" onClick={openPopup} title="Open the bubbles in their own window"
              className="h-9 rounded-lg border border-border bg-card px-3 text-sm text-fg transition hover:border-accent hover:text-accent">
              Pop out
            </button>
          ) : null}
        </div>
      </header>

      {error ? <p role="alert" className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-400">{error}</p> : null}
      {snapshot && mode === "change" && knownChanges === 0 ? (
        <p className="mb-3 rounded-lg border border-border bg-card p-3 text-sm text-muted">
          No {PERIOD_LABELS[period].toLowerCase()} change is known yet for these assets
          {kind === "stock" ? ": stock changes build up from our own daily history (1, 7 and 30 days)." : "."}{" "}
          Until then, bubbles are sized by market cap.
        </p>
      ) : null}

      {/* Le canvas est hors du flux : sa taille ne peut pas imposer celle du cadre (sinon il ne regrandit plus). */}
      <div ref={wrapRef} style={{ height: frameHeight }} className="relative w-full min-w-0 overflow-hidden rounded-xl border border-border bg-card">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`${title}: ${rows.length} bubbles, ${PERIOD_LABELS[period]} change`}
          className="absolute inset-0 block h-full w-full touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={() => { setHover(null); dragRef.current = null; }}
        />
        {popup && controlsHidden ? (
          <button type="button" onClick={() => setControlsHidden(false)} title="Show the controls"
            className="absolute right-1.5 top-1.5 z-10 h-6 rounded-md border border-border bg-bg/80 px-2 text-[11px] text-muted transition hover:border-accent hover:text-accent">
            Controls
          </button>
        ) : null}
        {!snapshot && !error ? <p className="absolute inset-0 flex items-center justify-center text-sm text-muted">Loading…</p> : null}
        {hover ? (
          <div className="pointer-events-none absolute z-10 min-w-44 rounded-lg border border-border bg-bg/95 p-3 text-xs shadow-lg"
            style={{ left: hover.left, top: hover.top }}>
            <p className="font-semibold text-fg">#{hover.row.rank} {hover.row.name} <span className="text-muted">{hover.row.symbol}</span></p>
            <p className="mt-1 text-muted">Price <span className="text-fg">{formatEur(hover.row.priceEur)}</span></p>
            <p className="text-muted">Market cap <span className="text-fg">{formatEur(hover.row.marketCapEur)}</span></p>
            <p className="text-muted">{PERIOD_LABELS[period]}{" "}
              <span className={hoverChange === null ? "text-muted" : hoverChange >= 0 ? "text-green-500" : "text-red-500"}>{formatChange(hoverChange)}</span>
            </p>
          </div>
        ) : null}
      </div>
      <p className={popup ? "hidden" : "mt-2 text-xs text-muted"}>
        {snapshot ? `Snapshot ${new Date(snapshot.generatedAt).toLocaleString("en")} · ` : ""}
        {kind === "crypto" ? "Rankings refresh hourly" : "Rankings refresh daily"}; this page re-reads them every 5 minutes. Drag a bubble to move it.
      </p>
    </main>
  );
}

function Segmented({ label, value, options, onChange, compact = false }: {
  label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void; compact?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 text-xs font-medium text-muted">
      {compact ? null : label}
      <div role="group" aria-label={label} title={compact ? label : undefined}
        className={`flex overflow-hidden border border-border bg-card ${compact ? "h-7 rounded-md" : "h-9 rounded-lg"}`}>
        {options.map((o) => (
          <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}
            className={`transition ${compact ? "px-2 text-xs" : "px-3 text-sm"} ${o.value === value ? "bg-accent font-semibold text-black" : "text-fg hover:bg-border/40"}`}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function paintBubbles(
  ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, size: { w: number; h: number }, bubbles: readonly Bubble[],
  rows: Map<string, MarketCapRow>, view: { period: BubblePeriod; search: string }, dragId: string | null,
  logos: Map<string, HTMLImageElement | null>,
) {
  const { w, h } = size;
  const dpr = canvas.width / w;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  for (const b of bubbles) {
    const row = rows.get(b.id);
    if (!row) continue;
    const change = periodChange(row, view.period);
    const q = view.search;
    const dim = q !== "" && !row.symbol.toLowerCase().includes(q) && !row.name.toLowerCase().includes(q);
    ctx.globalAlpha = dim ? 0.15 : 1;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    // Relief : reflet décalé vers le haut à gauche, bord plus sombre.
    const shade = bubbleShade(change);
    const gradient = ctx.createRadialGradient(b.x - b.r * 0.35, b.y - b.r * 0.4, b.r * 0.05, b.x, b.y, b.r);
    gradient.addColorStop(0, shade.light);
    gradient.addColorStop(0.55, shade.base);
    gradient.addColorStop(1, shade.dark);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.lineWidth = dragId === b.id ? 3 : 1.25;
    ctx.strokeStyle = shade.rim;
    ctx.stroke();
    drawLabel(ctx, b, row, change, logos, dpr);
  }
  ctx.globalAlpha = 1;
}

function drawLabel(ctx: CanvasRenderingContext2D, b: Bubble, row: MarketCapRow, change: number | null, logos: Map<string, HTMLImageElement | null>, dpr: number) {
  // Taille réelle du logo à l'écran, en pixels physiques : elle décide de la définition demandée.
  const logo = loadLogo(row, logos, (b.r < 14 ? b.r * 1.25 : b.r * 0.55) * dpr);
  if (b.r < 14) {
    // Trop petite pour un texte lisible : le logo seul, plutôt qu'un disque muet.
    if (logo && b.r >= 7) {
      const s = b.r * 1.25;
      try { ctx.drawImage(logo, b.x - s / 2, b.y - s / 2, s, s); } catch { /* logo illisible : ignoré */ }
    }
    return;
  }
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const showLogo = logo && b.r >= 30;
  const symbolSize = Math.max(9, Math.min(26, b.r * 0.36));
  const changeSize = Math.max(8, symbolSize * 0.72);
  let y = b.y - (showLogo ? b.r * 0.08 : changeSize * 0.45);
  if (showLogo) {
    const s = b.r * 0.55;
    try { ctx.drawImage(logo, b.x - s / 2, b.y - b.r * 0.72, s, s); } catch { /* logo illisible : ignoré */ }
    y = b.y + b.r * 0.12;
  }
  // Ombre portée du texte, seulement sur les bulles assez grandes (coût de rendu).
  if (b.r >= 26) { ctx.shadowColor = "rgba(0, 0, 0, 0.6)"; ctx.shadowBlur = 4; }
  ctx.font = `700 ${symbolSize}px system-ui, sans-serif`;
  ctx.fillText(row.symbol.slice(0, 8), b.x, y, b.r * 1.7);
  if (b.r >= 20) {
    ctx.font = `600 ${changeSize}px system-ui, sans-serif`;
    ctx.fillText(formatChange(change), b.x, y + symbolSize * 0.95, b.r * 1.7);
  }
  ctx.shadowBlur = 0;
}

function loadLogo(row: MarketCapRow, logos: Map<string, HTMLImageElement | null>, pixels: number): HTMLImageElement | null {
  if (!row.logoUrl) return null;
  const ready = (img: HTMLImageElement | null | undefined) => (img && img.complete && img.naturalWidth > 0 ? img : null);
  const url = sharpLogoUrl(row.logoUrl, pixels);
  const cached = logos.get(url);
  // En attendant la version nette (ou si elle manque), on garde le logo de base déjà chargé.
  if (cached !== undefined) return ready(cached) ?? (url === row.logoUrl ? null : ready(logos.get(row.logoUrl)));
  const img = new Image();
  img.decoding = "async";
  img.referrerPolicy = "no-referrer";
  img.onerror = () => {
    logos.set(url, null);
    if (url !== row.logoUrl && logos.get(row.logoUrl!) === undefined) loadLogo(row, logos, 64);
  };
  img.src = url;
  logos.set(url, img);
  return url === row.logoUrl ? null : ready(logos.get(row.logoUrl));
}
