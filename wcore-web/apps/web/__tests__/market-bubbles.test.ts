import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { parseMarketCapResponse, type MarketCapRow } from "../app/cmc/market-cap";
import {
  bubbleColor, bubbleKey, bubbleMetric, bubblesSettled, computeRadii, createBubbles, formatChange, frameDue, selectBubbleRows, stepBubbles,
  type Bubble, type BubblePeriod,
} from "../lib/market-bubbles";

const row = (rank: number, cap: number | null, changes?: MarketCapRow["changes"]): MarketCapRow =>
  ({ rank, symbol: `S${rank}`, name: `Asset ${rank}`, priceEur: 1, marketCapEur: cap, ...(changes !== undefined ? { changes } : {}) });

describe("parseMarketCapResponse accepte les variations", () => {
  const base = { ok: true, generatedAt: "2026-11-10T08:00:00.000Z", rows: [] as unknown[] };
  test("lignes avec variations, nulles ou absentes", () => {
    const res = parseMarketCapResponse({ ...base, rows: [
      { rank: 1, symbol: "BTC", name: "Bitcoin", priceEur: 1, marketCapEur: 2, changes: { h1: 0.1, d1: -2, w1: null, m1: 5 } },
      { rank: 2, symbol: "ETH", name: "Ether", priceEur: 1, marketCapEur: 2, changes: null },
      { rank: 3, symbol: "SOL", name: "Solana", priceEur: 1, marketCapEur: 2 },
    ] });
    assert.equal(res.rows.length, 3);
  });
  test("refuse une variation non numérique", () => {
    assert.throws(() => parseMarketCapResponse({ ...base, rows: [{ rank: 1, symbol: "BTC", name: "Bitcoin", priceEur: 1, marketCapEur: 2, changes: { h1: "x", d1: null, w1: null, m1: null } }] }));
  });
});

describe("sélection et mesure", () => {
  test("garde les N premiers rangs ayant une capitalisation positive", () => {
    const rows = [row(3, 10), row(1, 50), row(2, null), row(4, 0), row(5, 5)];
    assert.deepEqual(selectBubbleRows(rows, 2).map((r) => r.rank), [1, 3]);
  });
  test("mode variation : valeur absolue de la période, null si inconnue", () => {
    const r = row(1, 100, { h1: -3, d1: 2, w1: null, m1: 8 });
    assert.equal(bubbleMetric(r, "change", "h1"), 3);
    assert.equal(bubbleMetric(r, "change", "w1"), null);
    assert.equal(bubbleMetric(row(2, 100), "change", "d1"), null);
  });
  test("mode capitalisation", () => {
    assert.equal(bubbleMetric(row(1, 100), "marketcap", "d1"), 100);
  });
});

describe("tailles et couleurs", () => {
  test("les rayons croissent avec la valeur et remplissent une part bornée de la surface", () => {
    const radii = computeRadii([1, 4, 16, null], 1000, 600, { fill: 0.5, minRadius: 8 });
    assert.ok(radii[0]! < radii[1]! && radii[1]! < radii[2]!);
    assert.equal(radii[3], 8, "une valeur inconnue prend le rayon minimal");
    const area = radii.reduce((s, r) => s + Math.PI * r * r, 0);
    assert.ok(area <= 1000 * 600 * 0.55, `surface ${area}`);
  });
  test("rayon maximal borné pour qu'une bulle géante ne remplisse pas l'écran", () => {
    const radii = computeRadii([1e12, 1, 1], 1000, 600, { fill: 0.5, minRadius: 8, maxRadiusRatio: 0.2 });
    assert.ok(radii[0]! <= 600 * 0.2 + 1e-9);
  });
  test("vert en hausse, rouge en baisse, gris inconnu ; intensité croissante", () => {
    assert.match(bubbleColor(5), /^rgba\(22, 163, 74,/);
    assert.match(bubbleColor(-5), /^rgba\(220, 38, 38,/);
    assert.match(bubbleColor(null), /^rgba\(113, 113, 122,/);
    const alpha = (c: string) => Number(c.match(/,\s*([0-9.]+)\)$/)![1]);
    assert.ok(alpha(bubbleColor(20)) > alpha(bubbleColor(1)));
  });
  test("formatChange : signe et unité, tiret si inconnu", () => {
    assert.equal(formatChange(3.456), "+3.5%");
    assert.equal(formatChange(-0.04), "-0.0%");
    assert.equal(formatChange(null), "—");
  });
});

describe("simulation", () => {
  const two = (): Bubble[] => [
    { id: "a", x: 100, y: 100, vx: 0, vy: 0, r: 30 },
    { id: "b", x: 110, y: 100, vx: 0, vy: 0, r: 30 },
  ];
  test("deux bulles qui se chevauchent s'écartent", () => {
    const b = two();
    for (let i = 0; i < 60; i++) stepBubbles(b, 400, 300);
    const d = Math.hypot(b[0]!.x - b[1]!.x, b[0]!.y - b[1]!.y);
    assert.ok(d >= 59, `distance ${d}`);
  });
  test("sans dérive, 100 bulles serrées finissent immobiles : l'animation peut s'arrêter", () => {
    const radii = computeRadii(Array.from({ length: 100 }, (_, i) => 100 - i), 900, 600, { fill: 0.64, minRadius: 10 });
    const rows = Array.from({ length: 100 }, (_, i) => row(i + 1, 1000 - i));
    let seed = 1;
    const b = createBubbles(rows, radii, 900, 600, [], () => ((seed = (seed * 16807) % 2147483647) / 2147483647));
    for (let i = 0; i < 240; i++) stepBubbles(b, 900, 600, { time: i * 33 });
    assert.equal(bubblesSettled(b), false, "pendant la dérive les bulles bougent");
    let steps = 0;
    while (!bubblesSettled(b) && steps < 600) { stepBubbles(b, 900, 600); steps++; }
    assert.ok(bubblesSettled(b), `immobiles après ${steps} pas`);
    assert.ok(steps < 600);
  });
  test("cadence plafonnée à 30 images/s", () => {
    assert.equal(frameDue(1000, 1000 - 16.7, 30), false);
    assert.equal(frameDue(1000, 1000 - 33.3, 30), true);
    let drawn = 0, last = -Infinity;
    for (let t = 0; t < 1000; t += 1000 / 144) if (frameDue(t, last, 30)) { drawn++; last = t; }
    assert.ok(drawn <= 31 && drawn >= 25, `${drawn} images en 1 s sur un écran 144 Hz`);
  });
  test("les bulles restent dans le cadre", () => {
    const b: Bubble[] = [{ id: "a", x: -50, y: 900, vx: -40, vy: 40, r: 20 }];
    for (let i = 0; i < 30; i++) stepBubbles(b, 400, 300);
    assert.ok(b[0]!.x >= 20 && b[0]!.x <= 380 && b[0]!.y >= 20 && b[0]!.y <= 280);
  });
  test("createBubbles conserve la position d'une bulle déjà présente (pas de saut au rafraîchissement)", () => {
    const prev: Bubble[] = [{ id: bubbleKey(row(1, 100)), x: 42, y: 24, vx: 0, vy: 0, r: 10 }];
    const next = createBubbles([row(1, 100), row(2, 50)], [30, 20], 400, 300, prev, () => 0.5);
    assert.equal(next[0]!.x, 42);
    assert.equal(next[0]!.r, 30);
    assert.equal(next.length, 2);
  });
  test("périodes acceptées", () => {
    const periods: BubblePeriod[] = ["h1", "d1", "w1", "m1"];
    assert.equal(periods.length, 4);
  });
});

test("isStablecoinRow hides pegged stablecoins only", async () => {
  const { isStablecoinRow } = await import("../lib/market-bubbles");
  const row = (symbol: string, priceEur: number | null) => ({ rank: 1, symbol, name: symbol, priceEur, marketCapEur: 1 }) as never;
  assert.equal(isStablecoinRow(row("USDT", 0.86)), true);
  assert.equal(isStablecoinRow(row("eurc", 1)), true);
  assert.equal(isStablecoinRow(row("USDC", 0.0013)), false, "un homonyme loin de la parité reste visible");
  assert.equal(isStablecoinRow(row("XAUT", 3500)), false);
  assert.equal(isStablecoinRow(row("BTC", 60000)), false);
});

test("sharpLogoUrl asks for a larger logo only when the bubble needs it", async () => {
  const { sharpLogoUrl } = await import("../lib/market-bubbles");
  const cmc = "https://s2.coinmarketcap.com/static/img/coins/64x64/1.png";
  const stock = "https://companiesmarketcap.com/img/company-logos/64/AAPL.png";
  assert.equal(sharpLogoUrl(cmc, 40), cmc);
  assert.equal(sharpLogoUrl(cmc, 100), "https://s2.coinmarketcap.com/static/img/coins/128x128/1.png");
  assert.equal(sharpLogoUrl(cmc, 180), "https://s2.coinmarketcap.com/static/img/coins/200x200/1.png");
  assert.equal(sharpLogoUrl(stock, 100), "https://companiesmarketcap.com/img/company-logos/128/AAPL.png");
  assert.equal(sharpLogoUrl(stock, 300), "https://companiesmarketcap.com/img/company-logos/256/AAPL.png");
  assert.equal(sharpLogoUrl("https://example.org/logo.png", 300), "https://example.org/logo.png");
});

test("two assets sharing a symbol get distinct bubbles", async () => {
  const { bubbleKey, createBubbles } = await import("../lib/market-bubbles");
  const btc = { rank: 1, symbol: "BTC", name: "Bitcoin", priceEur: 60000, marketCapEur: 1e12, logoUrl: "https://s2.coinmarketcap.com/static/img/coins/64x64/1.png" } as never;
  const fake = { rank: 900, symbol: "BTC", name: "Bitcoin", priceEur: 0.01, marketCapEur: 1e6, logoUrl: "https://s2.coinmarketcap.com/static/img/coins/64x64/31337.png" } as never;
  const noLogo = { rank: 901, symbol: "BTC", name: "BTC Clone", priceEur: 1, marketCapEur: 1e5 } as never;
  const keys = [btc, fake, noLogo].map(bubbleKey);
  assert.equal(new Set(keys).size, 3);
  const bubbles = createBubbles([btc, fake, noLogo], [10, 10, 10], 400, 300, [], () => 0.5);
  assert.deepEqual(bubbles.map((b) => b.id), keys);
  // Une bulle deja affichee garde sa place au rafraichissement.
  bubbles[0]!.x = 123;
  assert.equal(createBubbles([btc], [10], 400, 300, bubbles)[0]!.x, 123);
});

test("freshnessNote gives a full date and reports a stale snapshot even after a successful reload", async () => {
  const { freshnessNote } = await import("../lib/market-bubbles");
  const fresh = freshnessNote("2026-11-10T21:18:00.000Z", false, false);
  assert.match(fresh.when, /Nov/, "the day is always shown, not just the time");
  assert.deepEqual(fresh.warnings, []);
  assert.deepEqual(freshnessNote("2026-11-10T21:18:00.000Z", true, false).warnings, ["stale data"]);
  assert.deepEqual(freshnessNote("2026-11-10T21:18:00.000Z", true, true).warnings, ["stale data", "reload failed"]);
  assert.equal(freshnessNote("not a date", false, false).when, "unknown time");
});
