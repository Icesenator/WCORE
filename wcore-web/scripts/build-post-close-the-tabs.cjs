// Build "wcore-post-close-the-tabs" concept post (1200x675, DA v12)
// Angle: portfolio chaos across five tools vs one clean read-only view.
const { writeFileSync, unlinkSync, existsSync, readdirSync } = require("node:fs");
const { pathToFileURL } = require("node:url");
const { resolve } = require("node:path");

const ROOT = resolve(__dirname, "..");
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (_e) {
  ({ chromium } = require(resolve(ROOT, "node_modules/.pnpm/playwright@1.59.1/node_modules/playwright")));
}

const W = 1200;
const H = 675;
const fontStack = 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

function buildSvg() {
  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`);
  parts.push(`<defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#050607"/>
      <stop offset="0.52" stop-color="#080f14"/>
      <stop offset="1" stop-color="#14220f"/>
    </linearGradient>
    <linearGradient id="lime" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#bef264"/>
      <stop offset="1" stop-color="#84cc16"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#84cc16" stop-opacity="0.24"/>
      <stop offset="1" stop-color="#84cc16" stop-opacity="0"/>
    </radialGradient>
    <style>
      .font { font-family: ${fontStack}; }
      .white { fill: #f7f7f8; }
      .muted { fill: #a1a1aa; }
      .soft { fill: #d4d4d8; }
      .lime { fill: #a3e635; }
      .red { fill: #f87171; }
      .label { fill: #71717a; }
    </style>
  </defs>`);

  parts.push(`<rect width="${W}" height="${H}" fill="url(#bg)"/>`);
  parts.push(`<circle cx="165" cy="95" r="390" fill="url(#glow)"/>`);
  parts.push(`<circle cx="1010" cy="595" r="340" fill="url(#glow)" opacity="0.8"/>`);
  parts.push(`<g opacity="0.045" stroke="#84cc16">
    <path d="M0 112H1200M0 225H1200M0 338H1200M0 451H1200M0 564H1200"/>
    <path d="M150 0V675M300 0V675M450 0V675M600 0V675M750 0V675M900 0V675M1050 0V675"/>
  </g>`);
  parts.push(`<path d="M-80 116C112 28 318 76 526 140C716 198 844 126 1010 72C1110 40 1190 54 1280 110" fill="none" stroke="#84cc16" stroke-opacity="0.12" stroke-width="2"/>`);
  parts.push(`<path d="M-80 558C128 470 306 518 492 574C680 630 842 590 1010 504C1100 458 1186 464 1280 524" fill="none" stroke="#22c55e" stroke-opacity="0.08" stroke-width="2"/>`);

  // Title
  parts.push(`<g>
    <text x="572" y="74" text-anchor="middle" class="font white" font-size="56" font-weight="950" letter-spacing="-2.2">Close the tabs.</text>
    <text x="572" y="104" text-anchor="middle" class="font muted" font-size="20" font-weight="500" letter-spacing="-0.2">Your portfolio is not five browser windows.</text>
  </g>`);

  // WCORE badge top right
  parts.push(`<g transform="translate(964 50)">
    <rect x="0" y="0" width="164" height="52" rx="26" fill="#111722" stroke="#2a3442"/>
    <g transform="translate(16 12) scale(0.45)" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path d="M32 8L54 20.5V45.5L32 58L10 45.5V20.5L32 8Z" stroke="#84cc16" stroke-width="4"/>
      <circle cx="32" cy="33" r="5" fill="#84cc16" stroke="none"/>
      <path d="M32 33L32 20M32 33L21 40M32 33L43 40" stroke="#84cc16" stroke-width="3"/>
      <circle cx="32" cy="20" r="3.5" fill="#84cc16" stroke="none"/>
      <circle cx="21" cy="40" r="3.5" fill="#84cc16" stroke="none"/>
      <circle cx="43" cy="40" r="3.5" fill="#84cc16" stroke="none"/>
    </g>
    <text x="60" y="33" class="font white" font-size="18" font-weight="950" letter-spacing="0.8">WCORE</text>
  </g>`);

  parts.push(`<line x1="100" y1="130" x2="1100" y2="130" stroke="#1a2332" stroke-width="1"/>`);

  // ===== LEFT: chaotic stacked tabs (x=70..520) =====
  const TABS = [
    { label: "BLOCK EXPLORER", sub: "chain 1 only", rot: -4, x: 96,  y: 208 },
    { label: "DEX SCREENER",   sub: "prices lagging", rot: -1.5, x: 116, y: 292 },
    { label: "CEX DASHBOARD",  sub: "spot balance", rot: 2, x: 106, y: 376 },
    { label: "SPREADSHEET.CSV", sub: "updated in March", rot: -2.5, x: 128, y: 462 },
  ];
  TABS.forEach((t) => {
    const tw = 360;
    const th = 64;
    parts.push(`<g transform="translate(${t.x} ${t.y}) rotate(${t.rot})">
      <rect x="0" y="0" width="${tw}" height="${th}" rx="10" fill="#0d1117" stroke="#232c38"/>
      <line x1="0" y1="22" x2="${tw}" y2="22" stroke="#232c38" stroke-width="1"/>
      <circle cx="16" cy="11" r="3.5" fill="#3f3f46"/>
      <circle cx="28" cy="11" r="3.5" fill="#3f3f46"/>
      <circle cx="40" cy="11" r="3.5" fill="#3f3f46"/>
      <text x="18" y="44" class="font muted" font-size="15" font-weight="800" letter-spacing="1">${t.label}</text>
      <text x="18" y="58" class="font label" font-size="10.5" font-weight="500">${t.sub}</text>
    </g>`);
  });
  // red strike-through over the top tab + red X badge
  parts.push(`<line x1="118" y1="230" x2="470" y2="216" stroke="#f87171" stroke-width="2.5" opacity="0.85"/>`);
  parts.push(`<g transform="translate(430 190)">
    <circle cx="0" cy="0" r="16" fill="#450a0a" stroke="#b91c1c" stroke-width="1.5"/>
    <path d="M-6 -6 L6 6 M6 -6 L-6 6" stroke="#f87171" stroke-width="2.4" stroke-linecap="round"/>
  </g>`);
  // left column caption
  parts.push(`<text x="250" y="580" text-anchor="middle" class="font label" font-size="13" font-weight="700" letter-spacing="1.6">THE OLD WAY</text>`);

  // ===== RIGHT: WCORE hero card (x=600, w=500, y=156-580) =====
  const px = 610; const pw = 500; const py = 156; const ph = 424;
  parts.push(`<rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="16" fill="#0d1117" stroke="#3f6212" stroke-width="1.5"/>`);
  // card header
  parts.push(`<rect x="${px}" y="${py}" width="${pw}" height="56" rx="16" fill="#132117"/>`);
  parts.push(`<rect x="${px}" y="${py + 40}" width="${pw}" height="16" fill="#132117"/>`);
  parts.push(`<g transform="translate(${px + 22} ${py + 14}) scale(0.32)" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M32 8L54 20.5V45.5L32 58L10 45.5V20.5L32 8Z" stroke="#a3e635" stroke-width="4"/>
    <circle cx="32" cy="33" r="5" fill="#a3e635" stroke="none"/>
    <path d="M32 33L32 20M32 33L21 40M32 33L43 40" stroke="#a3e635" stroke-width="3"/>
    <circle cx="32" cy="20" r="3.5" fill="#a3e635" stroke="none"/>
    <circle cx="21" cy="40" r="3.5" fill="#a3e635" stroke="none"/>
    <circle cx="43" cy="40" r="3.5" fill="#a3e635" stroke="none"/>
  </g>`);
  parts.push(`<text x="${px + 62}" y="${py + 35}" class="font white" font-size="19" font-weight="950" letter-spacing="1">WCORE</text>`);
  parts.push(`<g transform="translate(${px + pw - 148} ${py + 14})">
    <rect x="0" y="0" width="126" height="28" rx="14" fill="#132117" stroke="#3f6212"/>
    <text x="63" y="19" text-anchor="middle" class="font lime" font-size="12" font-weight="900" letter-spacing="1">READ ONLY</text>
  </g>`);

  // feature rows
  const ROWS = [
    { main: "180+ chains scanned", sub: "EVM, Solana, Cosmos, TON", icon: "check" },
    { main: "7 CEX folded in", sub: "Binance, Bybit, Kraken, Coinbase...", icon: "check" },
    { main: "Scam tokens flagged", sub: "Dust never reaches your total", icon: "shield" },
    { main: "No wallet connect", sub: "Public data only. No seed phrase.", icon: "lock" },
  ];
  let ry = py + 84;
  ROWS.forEach((r) => {
    parts.push(`<rect x="${px + 20}" y="${ry}" width="${pw - 40}" height="66" rx="10" fill="#0f141b"/>`);
    const icx = px + 52; const icy = ry + 33;
    if (r.icon === "check") {
      parts.push(`<circle cx="${icx}" cy="${icy}" r="13" fill="#132117" stroke="#84cc16" stroke-width="1.5"/>`);
      parts.push(`<path d="M${icx - 6} ${icy} l 4 4.5 l 9 -10" fill="none" stroke="#a3e635" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`);
    } else if (r.icon === "shield") {
      parts.push(`<path d="M${icx} ${icy - 13} L${icx + 11} ${icy - 8} V${icy + 2} C${icx + 11} ${icy + 9} ${icx} ${icy + 13} ${icx} ${icy + 13} C${icx} ${icy + 13} ${icx - 11} ${icy + 9} ${icx - 11} ${icy + 2} V${icy - 8} Z" fill="#132117" stroke="#84cc16" stroke-width="1.5"/>`);
      parts.push(`<path d="M${icx - 5} ${icy} l 3.5 4 l 7 -8" fill="none" stroke="#a3e635" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`);
    } else {
      parts.push(`<rect x="${icx - 10}" y="${icy - 7}" width="20" height="15" rx="3" fill="#132117" stroke="#84cc16" stroke-width="1.5"/>`);
      parts.push(`<path d="M${icx - 5} ${icy - 7} v-3 a5 5 0 0 1 10 0 v3" fill="none" stroke="#84cc16" stroke-width="1.5"/>`);
    }
    parts.push(`<text x="${px + 82}" y="${ry + 27}" class="font white" font-size="15.5" font-weight="800">${r.main}</text>`);
    parts.push(`<text x="${px + 82}" y="${ry + 48}" class="font muted" font-size="12" font-weight="500">${r.sub}</text>`);
    ry += 74;
  });
  // bottom pill inside card
  parts.push(`<g transform="translate(${px + pw / 2 - 92} ${py + ph - 48})">
    <rect x="0" y="0" width="184" height="30" rx="15" fill="#132117" stroke="#3f6212"/>
    <text x="92" y="20" text-anchor="middle" class="font" font-size="13" font-weight="900" letter-spacing="1.2" fill="url(#lime)">ONE CLEAN VIEW</text>
  </g>`);
  parts.push(`<text x="${px + pw / 2}" y="${py + ph + 26}" text-anchor="middle" class="font lime" font-size="13" font-weight="700" letter-spacing="1.6">THE WCORE WAY</text>`);

  // Footer
  parts.push(`<line x1="100" y1="618" x2="1100" y2="618" stroke="#1a2332" stroke-width="1"/>`);
  parts.push(`<g>
    <text x="100" y="652" class="font soft" font-size="17" font-weight="900" letter-spacing="-0.4">Read first. Act later.</text>
    <text x="1100" y="652" text-anchor="end" class="font" font-size="19" font-weight="950" letter-spacing="2.4" fill="url(#lime)">wcore.xyz</text>
  </g>`);
  parts.push(`<rect x="0" y="671" width="1200" height="4" fill="url(#lime)" opacity="0.72"/>`);

  parts.push(`</svg>`);
  return parts.join("\n");
}

(async () => {
  const svg = buildSvg();
  const name = "wcore-post-close-the-tabs";
  const pub = resolve(ROOT, "apps/web/public");
  const svgPath = resolve(pub, `${name}.svg`);
  const pngPath = resolve(pub, `${name}.png`);
  const tmpHtml = resolve(pub, `.${name}.tmp.html`);

  writeFileSync(svgPath, svg);
  console.log(`SVG written: ${svgPath} (${svg.length} bytes)`);

  const html = `<!DOCTYPE html><html><head><style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#0a0a0c;display:flex;align-items:center;justify-content:center;width:1200px;height:675px;overflow:hidden}
  </style></head><body>${svg}</body></html>`;
  writeFileSync(tmpHtml, html);

  // Fall back to any installed chromium build if the pinned one is missing.
  let executablePath;
  try {
    const pwRoot = resolve(process.env.LOCALAPPDATA ?? "", "ms-playwright");
    const candidates = readdirSync(pwRoot).filter((d) => d.startsWith("chromium")).sort().reverse();
    for (const dir of candidates) {
      for (const sub of ["chrome-headless-shell-win64/chrome-headless-shell.exe", "chrome-win/chrome.exe", "chrome-win64/chrome.exe"]) {
        const p = resolve(pwRoot, dir, sub);
        if (existsSync(p)) { executablePath = p; break; }
      }
      if (executablePath) break;
    }
  } catch { /* default launch below */ }

  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1200, height: 675 });
  await page.goto(pathToFileURL(tmpHtml).href, { waitUntil: "load" });
  await page.waitForTimeout(800);
  await page.screenshot({ path: pngPath, type: "png", omitBackground: false });
  await page.close();
  await browser.close();
  unlinkSync(tmpHtml);
  console.log(`PNG written: ${pngPath}`);
})().catch((e) => { console.error(e); process.exit(1); });
