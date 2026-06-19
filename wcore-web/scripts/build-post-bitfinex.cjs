// Build script for the X post: "Bitfinex is now live."
// Output: apps/web/public/wcore-post-bitfinex.svg + .png

const { readFileSync, unlinkSync, writeFileSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { pathToFileURL } = require("node:url");

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = require(resolve(__dirname, "../node_modules/.pnpm/playwright@1.59.1/node_modules/playwright")));
}

const ROOT = resolve(__dirname, "..");
const PUBLIC_DIR = join(ROOT, "apps/web/public");
const OUT_NAME = "wcore-post-bitfinex";
const W = 1200;
const H = 675;

const binanceLogo = readFileSync(join(PUBLIC_DIR, "cex/binance.svg")).toString("base64");
const bitpandaLogo = readFileSync(join(PUBLIC_DIR, "cex/bitpanda-official.jpeg")).toString("base64");
const bitfinexLogo = readFileSync(join(PUBLIC_DIR, "cex/bitfinex-official.png")).toString("base64");

function pill(x, y, w, label, accent = "#84cc16") {
  return `
    <g transform="translate(${x} ${y})">
      <rect x="0" y="0" width="${w}" height="34" rx="17" fill="#0d131a" stroke="${accent}" stroke-opacity="0.45"/>
      <text x="${w / 2}" y="22" text-anchor="middle" class="font" font-size="12" font-weight="950" fill="${accent}" letter-spacing="0.75">${label}</text>
    </g>`;
}

function smallCexCard(x, y, logoHref, logoType, name, sub) {
  const logo = logoType === "bitpanda"
    ? `<circle cx="38" cy="38" r="24" fill="#27D17F"/>
       <image href="${logoHref}" x="14" y="14" width="48" height="48" preserveAspectRatio="xMidYMid slice" clip-path="url(#smallLogo)"/>`
    : `<circle cx="38" cy="38" r="24" fill="#0b1117" stroke="#1f2937"/>
       <image href="${logoHref}" x="26" y="26" width="24" height="24"/>`;
  return `
    <g transform="translate(${x} ${y})" filter="url(#softShadow)">
      <rect x="0" y="0" width="238" height="92" rx="24" fill="#0d1219" stroke="#253041"/>
      <rect x="1" y="1" width="236" height="90" rx="23" fill="none" stroke="#84cc16" stroke-opacity="0.08"/>
      ${logo}
      <text x="78" y="38" class="font white" font-size="18" font-weight="950">${name}</text>
      <text x="78" y="60" class="font muted" font-size="12" font-weight="750">${sub}</text>
      <text x="206" y="26" text-anchor="end" class="font lime" font-size="10" font-weight="950" letter-spacing="1.0">LIVE</text>
    </g>`;
}

function buildSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#050607"/>
      <stop offset="0.5" stop-color="#080f14"/>
      <stop offset="1" stop-color="#13200d"/>
    </linearGradient>
    <linearGradient id="lime" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#bef264"/>
      <stop offset="1" stop-color="#84cc16"/>
    </linearGradient>
    <linearGradient id="card" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#111923"/>
      <stop offset="1" stop-color="#0a1016"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#84cc16" stop-opacity="0.28"/>
      <stop offset="1" stop-color="#84cc16" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="smallLogo"><circle cx="38" cy="38" r="24"/></clipPath>
    <clipPath id="heroLogo"><circle cx="122" cy="122" r="74"/></clipPath>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="18" stdDeviation="20" flood-color="#000" flood-opacity="0.42"/>
    </filter>
    <filter id="heroShadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="26" stdDeviation="30" flood-color="#000" flood-opacity="0.58"/>
    </filter>
    <style>
      .font { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      .white { fill: #f7f7f8; }
      .muted { fill: #a1a1aa; }
      .soft { fill: #d4d4d8; }
      .lime { fill: #a3e635; }
    </style>
  </defs>

  <rect width="1200" height="675" fill="url(#bg)"/>
  <circle cx="185" cy="80" r="320" fill="url(#glow)"/>
  <circle cx="1000" cy="500" r="370" fill="url(#glow)" opacity="0.86"/>
  <g opacity="0.045" stroke="#84cc16">
    <path d="M0 112H1200M0 225H1200M0 338H1200M0 451H1200M0 564H1200"/>
    <path d="M150 0V675M300 0V675M450 0V675M600 0V675M750 0V675M900 0V675M1050 0V675"/>
  </g>
  <path d="M-80 116C112 28 318 76 526 140C716 198 844 126 1010 72C1110 40 1190 54 1280 110" fill="none" stroke="#84cc16" stroke-opacity="0.12" stroke-width="2"/>
  <path d="M-80 558C128 470 306 518 492 574C680 630 842 590 1010 504C1100 458 1186 464 1280 524" fill="none" stroke="#22c55e" stroke-opacity="0.08" stroke-width="2"/>

  <g transform="translate(72 48)">
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
  </g>

  <g transform="translate(72 162)">
    <text x="0" y="0" class="font lime" font-size="13" font-weight="950" letter-spacing="1.9">TODAY'S WCORE UPDATE</text>
    <text x="0" y="68" class="font white" font-size="58" font-weight="950" letter-spacing="-1.9">Bitfinex is</text>
    <text x="0" y="128" class="font white" font-size="58" font-weight="950" letter-spacing="-1.9">now live.</text>
    <text x="0" y="176" class="font muted" font-size="16" font-weight="750">Your read-only spot wallet now sits next to</text>
    <text x="0" y="200" class="font muted" font-size="16" font-weight="750">Binance, Bitpanda and every on-chain wallet.</text>
  </g>

  <g transform="translate(72 410)">
    ${pill(0, 0, 128, "Read-only")}
    ${pill(140, 0, 138, "Direct API")}
    ${pill(290, 0, 190, "Provider-first pricing")}
  </g>

  <g transform="translate(72 496)">
    <rect x="0" y="0" width="492" height="74" rx="24" fill="#0d1219" stroke="#253041"/>
    <text x="28" y="31" class="font lime" font-size="12" font-weight="950" letter-spacing="1.5">ONE PORTFOLIO</text>
    <text x="28" y="54" class="font soft" font-size="15" font-weight="800">Same totals. Same export. Same risk rules.</text>
  </g>

  ${smallCexCard(640, 118, `data:image/svg+xml;base64,${binanceLogo}`, "binance", "Binance", "Spot + Earn")}
  ${smallCexCard(900, 118, `data:image/jpeg;base64,${bitpandaLogo}`, "bitpanda", "Bitpanda", "Crypto, fiat, stocks")}

  <g transform="translate(640 236)" filter="url(#heroShadow)">
    <rect x="0" y="0" width="498" height="306" rx="34" fill="url(#card)" stroke="#84cc16" stroke-opacity="0.72" stroke-width="2.5"/>
    <rect x="1" y="1" width="496" height="304" rx="33" fill="none" stroke="#bef264" stroke-opacity="0.18"/>
    <circle cx="122" cy="122" r="91" fill="#050607"/>
    <circle cx="122" cy="122" r="82" fill="#f7f7f8" opacity="0.96"/>
    <image href="data:image/png;base64,${bitfinexLogo}" x="48" y="48" width="148" height="148" preserveAspectRatio="xMidYMid contain" clip-path="url(#heroLogo)"/>
    <circle cx="122" cy="122" r="91" fill="none" stroke="#84cc16" stroke-opacity="0.42" stroke-width="3"/>

    <g transform="translate(330 34)">
      <rect x="0" y="0" width="116" height="40" rx="20" fill="#142112" stroke="#84cc16" stroke-opacity="0.78"/>
      <text x="58" y="26" text-anchor="middle" class="font lime" font-size="14" font-weight="950" letter-spacing="1.2">NEW</text>
    </g>

    <text x="246" y="112" class="font white" font-size="36" font-weight="950" letter-spacing="-0.9">Bitfinex</text>
    <text x="246" y="146" class="font muted" font-size="15" font-weight="800">Exchange / spot wallet</text>
    <text x="246" y="186" class="font soft" font-size="14" font-weight="750">Direct server-side sync.</text>
    <text x="246" y="208" class="font soft" font-size="14" font-weight="750">No relay. No browser secrets.</text>

    <g transform="translate(36 244)">
      <rect x="0" y="0" width="426" height="36" rx="18" fill="#0b1117" stroke="#263241"/>
      <text x="20" y="24" class="font muted" font-size="12" font-weight="950" letter-spacing="1.15">NEXT</text>
      <text x="80" y="24" class="font white" font-size="13" font-weight="850">Bybit, Coinbase, OKX</text>
    </g>
  </g>

  <g transform="translate(72 642)">
    <text x="0" y="0" class="font soft" font-size="18" font-weight="850">Read first. Act later.</text>
    <text x="1056" y="0" text-anchor="end" class="font" font-size="28" font-weight="950" fill="url(#lime)">wcore.xyz</text>
  </g>
  <rect x="0" y="671" width="1200" height="4" fill="url(#lime)" opacity="0.72"/>
</svg>`;
}

(async () => {
  const svg = buildSvg();
  const svgPath = join(PUBLIC_DIR, `${OUT_NAME}.svg`);
  const pngPath = join(PUBLIC_DIR, `${OUT_NAME}.png`);
  const tmpHtml = join(PUBLIC_DIR, `.${OUT_NAME}.tmp.html`);
  writeFileSync(svgPath, svg);

  const html = `<!DOCTYPE html><html><head><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#0a0a0c;display:flex;align-items:center;justify-content:center;width:${W}px;height:${H}px;overflow:hidden}</style></head><body>${svg}</body></html>`;
  writeFileSync(tmpHtml, html);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: W, height: H });
  await page.goto(pathToFileURL(tmpHtml).href, { waitUntil: "load" });
  await page.waitForTimeout(800);
  await page.screenshot({ path: pngPath, type: "png", omitBackground: false });
  await page.close();
  await browser.close();
  unlinkSync(tmpHtml);
  console.log(`Generated ${svgPath}`);
  console.log(`Generated ${pngPath}`);
})();
