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
 * Rendu lisible : interieur sombre (le texte blanc y contraste toujours), couleur portee par un
 * bord lumineux dont l'intensite croit avec l'ampleur de la variation. glow = flou du halo en px.
 */
export function bubbleGlow(change: number | null): { core: string; edge: string; rim: string; glow: number; glowColor: string } {
  if (change === null) {
    return { core: "rgba(24, 24, 27, 0.92)", edge: "rgba(82, 82, 91, 0.55)", rim: "rgba(161, 161, 170, 0.75)", glow: 3, glowColor: "rgba(161, 161, 170, 0.35)" };
  }
  const s = Math.min(1, Math.abs(change) / 12);
  const up = change >= 0;
  const [r, g, b] = up ? [34, 197, 94] : [239, 68, 68];
  const core = up ? "rgba(6, 22, 12, 0.94)" : "rgba(26, 7, 7, 0.94)";
  return {
    core,
    edge: `rgba(${r}, ${g}, ${b}, ${(0.28 + 0.42 * s).toFixed(3)})`,
    rim: `rgba(${r}, ${g}, ${b}, ${(0.6 + 0.4 * s).toFixed(3)})`,
    glow: Math.round(4 + 12 * s),
    glowColor: `rgba(${r}, ${g}, ${b}, ${(0.35 + 0.5 * s).toFixed(3)})`,
  };
}

/**
 * Taille du symbole dans une bulle de rayon r : proportionnelle, sans plafond bas, pour que les
 * grandes bulles restent lisibles de loin (l'ajustement a la largeur se fait au dessin).
 */
export function bubbleSymbolSize(r: number): number {
  return Math.max(9, Math.min(72, r * 0.44));
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

/**
 * Vrai quand plus aucune bulle ne bouge de facon visible : l'animation peut s'arreter et l'image
 * rester figee (aucun calcul ni dessin tant que rien ne change).
 */
export function bubblesSettled(bubbles: readonly Bubble[], maxSpeed = 0.03): boolean {
  for (const b of bubbles) if (Math.abs(b.vx) > maxSpeed || Math.abs(b.vy) > maxSpeed) return false;
  return true;
}

/**
 * L'animation s'arrete hors glisser une fois la derive finie et les bulles immobiles, ou au plus
 * tard a `settleBy` : dans une fenetre trop petite pour toutes les bulles, les collisions
 * entretiennent un leger mouvement qui ne s'eteindrait jamais.
 */
export function animationDone(s: { now: number; driftUntil: number; settleBy: number; dragging: boolean; settled: boolean }): boolean {
  if (s.dragging || s.now < s.driftUntil) return false;
  return s.settled || s.now >= s.settleBy;
}

/** Cadence plafonnee : vrai si assez de temps s'est ecoule depuis la derniere image dessinee. */
export function frameDue(now: number, last: number, fps = 30): boolean {
  return now - last >= 1000 / fps - 1;
}

function pushApart(a: Bubble, b: Bubble, impulse: number): void {
  let dx = b.x - a.x, dy = b.y - a.y;
  let d = Math.hypot(dx, dy);
  const min = a.r + b.r;
  if (d >= min) return;
  if (d < 1e-6) { dx = 1; dy = 0; d = 1; }
  const push = (min - d) / 2;
  const ux = dx / d, uy = dy / d;
  a.x -= ux * push; a.y -= uy * push;
  b.x += ux * push; b.y += uy * push;
  a.vx -= ux * push * impulse; a.vy -= uy * push * impulse;
  b.vx += ux * push * impulse; b.vy += uy * push * impulse;
}

// Au-dela de GRID_FROM bulles, comparer toutes les paires (n²) a chaque pas coute trop cher : une
// grille de cases de la taille du plus grand diametre ne compare chaque bulle qu'a ses voisines.
// Deux bulles qui se chevauchent sont toujours dans la meme case ou dans deux cases voisines.
const GRID_FROM = 150;

function separate(bubbles: Bubble[], impulse: number): void {
  const n = bubbles.length;
  if (n < GRID_FROM) {
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) pushApart(bubbles[i]!, bubbles[j]!, impulse);
    return;
  }
  let maxR = 0;
  for (const b of bubbles) if (b.r > maxR) maxR = b.r;
  const cell = Math.max(1, maxR * 2);
  const cells = new Map<number, number[]>();
  const keyOf = (x: number, y: number) => x * 100003 + y;
  const cx = new Int32Array(n), cy = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    cx[i] = Math.floor(bubbles[i]!.x / cell); cy[i] = Math.floor(bubbles[i]!.y / cell);
    const k = keyOf(cx[i]!, cy[i]!);
    const list = cells.get(k);
    if (list) list.push(i); else cells.set(k, [i]);
  }
  for (let i = 0; i < n; i++) {
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      const list = cells.get(keyOf(cx[i]! + ox, cy[i]! + oy));
      if (!list) continue;
      for (const j of list) if (j > i) pushApart(bubbles[i]!, bubbles[j]!, impulse);
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
