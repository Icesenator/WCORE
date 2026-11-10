// Vue en bulles des classements Market Cap : logique pure (testable sans navigateur).
import type { MarketCapRow } from "../app/cmc/market-cap";

export type BubblePeriod = "h1" | "d1" | "w1" | "m1";
export type BubbleMode = "change" | "marketcap";
export interface Bubble { id: string; x: number; y: number; vx: number; vy: number; r: number }

/** Les N premiers rangs ayant une capitalisation positive. */
export function selectBubbleRows(rows: readonly MarketCapRow[], count: number): MarketCapRow[] {
  return rows
    .filter((r) => typeof r.marketCapEur === "number" && r.marketCapEur > 0)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, count);
}

export function periodChange(row: MarketCapRow, period: BubblePeriod): number | null {
  const v = row.changes?.[period];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Valeur qui fixe la taille de la bulle : |variation| ou capitalisation ; null si inconnue. */
export function bubbleMetric(row: MarketCapRow, mode: BubbleMode, period: BubblePeriod): number | null {
  if (mode === "marketcap") return typeof row.marketCapEur === "number" && row.marketCapEur > 0 ? row.marketCapEur : null;
  const c = periodChange(row, period);
  return c === null ? null : Math.abs(c);
}

/**
 * Rayons proportionnels à la racine de la valeur (surface proportionnelle à la valeur), mis à
 * l'échelle pour que l'ensemble couvre `fill` de la surface, bornés par un rayon minimal et maximal.
 */
export function computeRadii(
  values: readonly (number | null)[],
  width: number,
  height: number,
  opts: { fill?: number; minRadius?: number; maxRadiusRatio?: number } = {},
): number[] {
  const fill = opts.fill ?? 0.55;
  const minR = opts.minRadius ?? 10;
  const maxR = Math.min(width, height) * (opts.maxRadiusRatio ?? 0.22);
  const roots = values.map((v) => (typeof v === "number" && v > 0 ? Math.sqrt(v) : 0));
  const sumSq = roots.reduce((s, r) => s + r * r, 0);
  if (sumSq <= 0) return values.map(() => minR);
  // Échelle telle que somme(pi * (k * root)^2) = fill * surface.
  // Plafonnée pour que seule la plus grosse touche le rayon maximal : l'ordre des tailles reste lisible.
  let k = Math.min(Math.sqrt((fill * width * height) / (Math.PI * sumSq)), maxR / Math.max(...roots));
  const radii = () => roots.map((r) => (r > 0 ? Math.min(maxR, Math.max(minR, k * r)) : minR));
  // Les bornes changent la surface réelle : on réduit l'échelle jusqu'à rester sous la cible.
  for (let i = 0; i < 20; i++) {
    const area = radii().reduce((s, r) => s + Math.PI * r * r, 0);
    if (area <= fill * width * height) break;
    k *= 0.95;
  }
  return radii();
}

/** Vert en hausse, rouge en baisse, gris si inconnu ; l'opacité croît avec l'ampleur. */
export function bubbleColor(change: number | null): string {
  if (change === null) return "rgba(113, 113, 122, 0.55)";
  const strength = Math.min(1, Math.abs(change) / 15);
  const alpha = (0.35 + 0.6 * strength).toFixed(3);
  return change >= 0 ? `rgba(22, 163, 74, ${alpha})` : `rgba(220, 38, 38, ${alpha})`;
}

export function formatChange(change: number | null): string {
  if (change === null) return "—";
  const v = Math.round(change * 10) / 10;
  return `${change >= 0 ? "+" : "-"}${Math.abs(v).toFixed(1)}%`;
}

/** Positions initiales ; une bulle déjà affichée garde sa place (pas de saut au rafraîchissement). */
export function createBubbles(
  rows: readonly MarketCapRow[],
  radii: readonly number[],
  width: number,
  height: number,
  previous: readonly Bubble[] = [],
  random: () => number = Math.random,
): Bubble[] {
  const prev = new Map(previous.map((b) => [b.id, b]));
  return rows.map((row, i) => {
    const r = radii[i] ?? 10;
    const old = prev.get(row.symbol);
    if (old) return { ...old, r };
    return { id: row.symbol, r, vx: 0, vy: 0, x: r + random() * Math.max(1, width - 2 * r), y: r + random() * Math.max(1, height - 2 * r) };
  });
}

/**
 * Un pas de simulation : légère attraction vers le centre, séparation des chevauchements,
 * rebond sur les bords, amortissement. Modifie les bulles en place.
 */
export function stepBubbles(bubbles: Bubble[], width: number, height: number, opts: { gravity?: number; damping?: number } = {}): void {
  const gravity = opts.gravity ?? 0.0006;
  const damping = opts.damping ?? 0.86;
  const cx = width / 2, cy = height / 2;
  for (const b of bubbles) {
    b.vx += (cx - b.x) * gravity;
    b.vy += (cy - b.y) * gravity;
  }
  for (let i = 0; i < bubbles.length; i++) {
    const a = bubbles[i]!;
    for (let j = i + 1; j < bubbles.length; j++) {
      const b = bubbles[j]!;
      let dx = b.x - a.x, dy = b.y - a.y;
      let d = Math.hypot(dx, dy);
      const min = a.r + b.r;
      if (d >= min) continue;
      if (d < 1e-6) { dx = 1; dy = 0; d = 1; }
      const push = (min - d) / 2;
      const ux = dx / d, uy = dy / d;
      a.x -= ux * push; a.y -= uy * push;
      b.x += ux * push; b.y += uy * push;
      a.vx -= ux * push * 0.05; a.vy -= uy * push * 0.05;
      b.vx += ux * push * 0.05; b.vy += uy * push * 0.05;
    }
  }
  for (const b of bubbles) {
    b.vx *= damping; b.vy *= damping;
    b.x += b.vx; b.y += b.vy;
    if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * 0.5; }
    if (b.x > width - b.r) { b.x = width - b.r; b.vx = -Math.abs(b.vx) * 0.5; }
    if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy) * 0.5; }
    if (b.y > height - b.r) { b.y = height - b.r; b.vy = -Math.abs(b.vy) * 0.5; }
  }
}
