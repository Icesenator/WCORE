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
  const target = fill * width * height;
  const maxRoot = Math.max(...roots);
  const kFill = Math.sqrt(target / (Math.PI * sumSq));
  if (kFill > maxR / maxRoot) {
    // Quelques géants plafonnés au rayon maximal laisseraient le cadre presque vide (ex. BTC face
    // au reste en capitalisation). On resserre alors les écarts : rayon = maxR * (root/max)^p, avec
    // p cherché entre 0 et 1 pour atteindre la surface visée. L'ordre des tailles est conservé.
    const at = (p: number) => roots.map((r) => (r > 0 ? Math.max(minR, maxR * (r / maxRoot) ** p) : minR));
    const area = (list: number[]) => list.reduce((sum, r) => sum + Math.PI * r * r, 0);
    let lo = 0.02, hi = 1;
    if (area(at(lo)) <= target) return at(lo);
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (area(at(mid)) > target) lo = mid; else hi = mid;
    }
    return at(hi);
  }
  let k = kFill;
  const radii = () => roots.map((r) => (r > 0 ? Math.min(maxR, Math.max(minR, k * r)) : minR));
  // Les bornes changent la surface réelle : on réduit l'échelle jusqu'à rester sous la cible.
  for (let i = 0; i < 20; i++) {
    const area = radii().reduce((s, r) => s + Math.PI * r * r, 0);
    if (area <= target) break;
    k *= 0.95;
  }
  return radii();
}

// Stablecoins indexés sur le dollar ou l'euro. L'or tokenisé (XAUT, PAXG) n'en fait pas partie.
const STABLECOIN_SYMBOLS = new Set([
  "USDT", "USDC", "DAI", "USDE", "USDS", "USD1", "FDUSD", "PYUSD", "TUSD", "USDD", "FRAX", "BUSD", "USDG", "RLUSD",
  "USD0", "GUSD", "USDP", "LUSD", "CRVUSD", "GHO", "USDB", "BFUSD", "USDTB", "USDF", "USDX", "USDY", "USDA", "DOLA",
  "SUSD", "EURC", "EURS", "EURT", "EURCV", "AEUR",
]);

/**
 * Vrai pour un stablecoin connu dont le prix est bien proche de la parité (0,7 à 1,3 EUR) :
 * un homonyme qui vaut autre chose n'est pas masqué.
 */
export function isStablecoinRow(row: MarketCapRow): boolean {
  if (!STABLECOIN_SYMBOLS.has(row.symbol.toUpperCase())) return false;
  return row.priceEur === null || (row.priceEur > 0.7 && row.priceEur < 1.3);
}

/** Vert en hausse, rouge en baisse, gris si inconnu ; l'opacité croît avec l'ampleur. */
export function bubbleColor(change: number | null): string {
  if (change === null) return "rgba(113, 113, 122, 0.55)";
  const strength = Math.min(1, Math.abs(change) / 15);
  const alpha = (0.35 + 0.6 * strength).toFixed(3);
  return change >= 0 ? `rgba(22, 163, 74, ${alpha})` : `rgba(220, 38, 38, ${alpha})`;
}

/**
 * Teintes d'une bulle en relief : reflet clair en haut à gauche, couleur pleine, bord plus sombre.
 * L'intensité croît avec l'ampleur de la variation ; gris si elle est inconnue.
 */
export function bubbleShade(change: number | null): { light: string; base: string; dark: string; rim: string } {
  if (change === null) {
    return { light: "rgba(161, 161, 170, 0.60)", base: "rgba(82, 82, 91, 0.60)", dark: "rgba(39, 39, 42, 0.75)", rim: "rgba(161, 161, 170, 0.85)" };
  }
  const s = Math.min(1, Math.abs(change) / 12);
  const a = (v: number) => (0.45 + v * s).toFixed(3);
  return change >= 0
    ? { light: `rgba(74, 222, 128, ${a(0.5)})`, base: `rgba(22, 163, 74, ${a(0.5)})`, dark: `rgba(5, 70, 35, ${a(0.45)})`, rim: "rgba(74, 222, 128, 0.95)" }
    : { light: `rgba(248, 113, 113, ${a(0.5)})`, base: `rgba(220, 38, 38, ${a(0.5)})`, dark: `rgba(95, 12, 12, ${a(0.45)})`, rim: "rgba(248, 113, 113, 0.95)" };
}

/**
 * Les classements fournissent des logos de 64 px, flous une fois agrandis dans une bulle.
 * Les deux sources connues servent aussi des tailles supérieures : on choisit la plus petite
 * qui couvre `pixels` (taille réelle à l'écran). Une adresse inconnue est rendue telle quelle.
 */
export function sharpLogoUrl(url: string, pixels: number): string {
  if (pixels <= 64) return url;
  const big = pixels > 128;
  return url
    .replace(/(coinmarketcap\.com\/static\/img\/coins\/)64x64\//, `$1${big ? "200x200" : "128x128"}/`)
    .replace(/(companiesmarketcap\.com\/img\/company-logos\/)64\//, `$1${big ? "256" : "128"}/`);
}

export function formatChange(change: number | null): string {
  if (change === null) return "—";
  const v = Math.round(change * 10) / 10;
  return `${change >= 0 ? "+" : "-"}${Math.abs(v).toFixed(1)}%`;
}

/**
 * Identité d'une bulle. Le symbole ne suffit pas : 308 symboles sont partagés par plusieurs
 * actifs dans les 5 000 cryptos (5 « BTC »). L'adresse du logo contient l'identifiant de
 * l'actif chez la source (CoinMarketCap, CompaniesMarketCap) ; à défaut, symbole + nom + rang.
 */
export function bubbleKey(row: MarketCapRow): string {
  return row.logoUrl || `${row.symbol}|${row.name}|${row.rank}`;
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
    const id = bubbleKey(row);
    const old = prev.get(id);
    if (old) return { ...old, r };
    return { id, r, vx: 0, vy: 0, x: r + random() * Math.max(1, width - 2 * r), y: r + random() * Math.max(1, height - 2 * r) };
  });
}

/**
 * Un pas de simulation : séparation des chevauchements, rebond sur les bords, amortissement.
 * Sans attraction par défaut : les bulles occupent tout le cadre au lieu de s'agglutiner au centre.
 * `time` (ms) ajoute une dérive très lente, propre à chaque bulle. Modifie les bulles en place.
 */
export function stepBubbles(
  bubbles: Bubble[], width: number, height: number,
  opts: { gravity?: number; damping?: number; time?: number; passes?: number } = {},
): void {
  const gravity = opts.gravity ?? 0;
  const damping = opts.damping ?? 0.86;
  const cx = width / 2, cy = height / 2;
  for (let i = 0; i < bubbles.length; i++) {
    const b = bubbles[i]!;
    b.vx += (cx - b.x) * gravity;
    b.vy += (cy - b.y) * gravity;
    if (opts.time !== undefined) {
      const phase = i * 2.399963;
      b.vx += Math.cos(opts.time * 0.00031 + phase) * 0.012;
      b.vy += Math.sin(opts.time * 0.00027 + phase * 1.7) * 0.012;
    }
  }
  const passes = opts.passes ?? 3;
  for (let pass = 0; pass < passes; pass++) separate(bubbles, pass === 0 ? 0.05 : 0);
  for (const b of bubbles) {
    b.vx *= damping; b.vy *= damping;
    b.x += b.vx; b.y += b.vy;
  }
  // Une dernière séparation puis les bords : aucune bulle ne finit le pas hors du cadre.
  separate(bubbles, 0);
  for (const b of bubbles) {
    if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * 0.5; }
    if (b.x > width - b.r) { b.x = width - b.r; b.vx = -Math.abs(b.vx) * 0.5; }
    if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy) * 0.5; }
    if (b.y > height - b.r) { b.y = height - b.r; b.vy = -Math.abs(b.vy) * 0.5; }
  }
}

function separate(bubbles: Bubble[], impulse: number): void {
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
      a.vx -= ux * push * impulse; a.vy -= uy * push * impulse;
      b.vx += ux * push * impulse; b.vy += uy * push * impulse;
    }
  }
}

/**
 * Etat de fraicheur affiche avec les bulles. La date est toujours complete (jour et heure) : une
 * heure seule ne dit pas si l'instantane date d'hier. Avertissements : instantane perime (reponse
 * reussie mais source indisponible) et echec de la derniere relecture.
 */
export function freshnessNote(generatedAt: string, stale: boolean, reloadFailed: boolean): { when: string; warnings: string[] } {
  const date = new Date(generatedAt);
  const when = Number.isFinite(date.getTime())
    ? date.toLocaleString("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : "unknown time";
  const warnings: string[] = [];
  if (stale) warnings.push("stale data");
  if (reloadFailed) warnings.push("reload failed");
  return { when, warnings };
}
