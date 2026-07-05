// Build script for the X post: "Kraken is now live." (7th CEX)
// Output: apps/web/public/wcore-post-kraken.svg + .png

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
const OUT_NAME = "wcore-post-kraken";
const W = 1200;
const H = 675;

function localDataUri(path, mime) {
  return `data:${mime};base64,${readFileSync(path).toString("base64")}`;
}

async function remoteDataUri(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Logo fetch failed ${res.status}: ${url}`);
  const contentType = res.headers.get("content-type") || "image/png";
  const buf = Buffer.from(await res.arrayBuffer());
  return `data:${contentType};base64,${buf.toString("base64")}`;
}

function pill(x, y, w, label, accent = "#84cc16") {
  return `
    <g transform="translate(${x} ${y})">
      <rect x="0" y="0" width="${w}" height="34" rx="17" fill="#0d131a" stroke="${accent}" stroke-opacity="0.45"/>
      <text x="${w / 2}" y="22" text-anchor="middle" class="font" font-size="12" font-weight="950" fill="${accent}" letter-spacing="0.75">${label}</text>
    </g>`;
}

function miniCexChip(x, y, id, logo, name, mode, mica) {
  let logoBase;
  if (mode === "fullbleed") {
    logoBase = `<circle cx="30" cy="30" r="17" fill="${mode === "fullbleed" ? "#0b1117" : "#f7f7f8"}"/>
       <image href="${logo}" x="13" y="13" width="34" height="34" preserveAspectRatio="xMidYMid slice" clip-path="url(#miniLogo-${id})"/>`;
  } else if (mode && mode.startsWith("#")) {
    logoBase = `<circle cx="30" cy="30" r="17" fill="${mode}"/>
       <image href="${logo}" x="13" y="13" width="34" height="34" preserveAspectRatio="xMidYMid slice" clip-path="url(#miniLogo-${id})"/>`;
  } else {
    logoBase = `<circle cx="30" cy="30" r="17" fill="#f7f7f8"/>
       <image href="${logo}" x="16" y="16" width="28" height="28" preserveAspectRatio="xMidYMid meet" clip-path="url(#miniLogo-${id})"/>`;
  }
  const micaTag = mica
    ? `<circle cx="87" cy="43" r="1.5" fill="#52525b"/>
       <text x="94" y="46" class="font" font-size="9" font-weight="950" fill="#60a5fa" letter-spacing="0.9">MiCA</text>`
    : "";
  return `
    <clipPath id="miniLogo-${id}"><circle cx="30" cy="30" r="17"/></clipPath>
    <g transform="translate(${x} ${y})" filter="url(#softShadow)">
      <rect x="0" y="0" width="158" height="60" rx="20" fill="#0d1219" stroke="#253041"/>
      ${logoBase}
      <text x="56" y="30" class="font white" font-size="15" font-weight="950">${name}</text>
      <text x="56" y="46" class="font lime" font-size="9" font-weight="950" letter-spacing="0.9">LIVE</text>
      ${micaTag}
    </g>`;
}

function buildSvg(logos) {
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
    <clipPath id="heroLogo"><circle cx="112" cy="112" r="66"/></clipPath>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#000" flood-opacity="0.4"/>
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
    <text x="0" y="68" class="font white" font-size="58" font-weight="950" letter-spacing="-1.9">Kraken is</text>
    <text x="0" y="128" class="font white" font-size="58" font-weight="950" letter-spacing="-1.9">now live.</text>
    <text x="0" y="176" class="font muted" font-size="16" font-weight="750">Seven exchanges now sync read-only,</text>
    <text x="0" y="200" class="font muted" font-size="16" font-weight="750">right next to your on-chain wallets.</text>
  </g>

  <g transform="translate(72 410)">
    ${pill(0, 0, 128, "Read-only")}
    ${pill(140, 0, 138, "Direct API")}
    ${pill(290, 0, 190, "Provider-first pricing")}
  </g>

  <g transform="translate(72 496)">
    <rect x="0" y="0" width="492" height="74" rx="24" fill="#0d1219" stroke="#253041"/>
    <text x="28" y="31" class="font lime" font-size="12" font-weight="950" letter-spacing="1.5">ONE PORTFOLIO</text>
    <text x="28" y="54" class="font soft" font-size="15" font-weight="800">7 CEX sources. 182 chains. One clean total.</text>
  </g>

  ${miniCexChip(640, 108, "binance", logos.binance, "Binance")}
  ${miniCexChip(810, 108, "bitpanda", logos.bitpanda, "Bitpanda", "#27D17F", true)}
  ${miniCexChip(980, 108, "bitfinex", logos.bitfinex, "Bitfinex", "fullbleed")}
  ${miniCexChip(640, 180, "bybit", logos.bybit, "Bybit", null, true)}
  ${miniCexChip(810, 180, "coinbase", logos.coinbase, "Coinbase", null, true)}
  ${miniCexChip(980, 180, "okx", logos.okx, "OKX", null, true)}

  <g transform="translate(640 276)" filter="url(#heroShadow)">
    <rect x="0" y="0" width="498" height="266" rx="34" fill="url(#card)" stroke="#84cc16" stroke-opacity="0.72" stroke-width="2.5"/>
    <rect x="1" y="1" width="496" height="264" rx="33" fill="none" stroke="#bef264" stroke-opacity="0.18"/>
    <circle cx="112" cy="112" r="82" fill="#050607"/>
    <circle cx="112" cy="112" r="73" fill="#f7f7f8" opacity="0.96"/>
    <image href="${logos.kraken}" x="46" y="46" width="132" height="132" preserveAspectRatio="xMidYMid contain" clip-path="url(#heroLogo)"/>
    <circle cx="112" cy="112" r="82" fill="none" stroke="#84cc16" stroke-opacity="0.42" stroke-width="3"/>

    <g transform="translate(340 30)">
      <rect x="0" y="0" width="116" height="40" rx="20" fill="#142112" stroke="#84cc16" stroke-opacity="0.78"/>
      <text x="58" y="26" text-anchor="middle" class="font lime" font-size="14" font-weight="950" letter-spacing="1.2">NEW</text>
    </g>

    <text x="226" y="106" class="font white" font-size="36" font-weight="950" letter-spacing="-0.9">Kraken</text>
    <g transform="translate(226 120)">
      <rect x="0" y="0" width="132" height="28" rx="14" fill="#0d1726" stroke="#60a5fa" stroke-opacity="0.65"/>
      <text x="66" y="19" text-anchor="middle" class="font" font-size="11" font-weight="950" fill="#60a5fa" letter-spacing="1.0">MiCA LICENSED</text>
    </g>
    <text x="226" y="172" class="font soft" font-size="14" font-weight="750">Spot balances. Direct sync.</text>
    <text x="226" y="194" class="font soft" font-size="14" font-weight="750">No relay. No browser secrets.</text>

    <g transform="translate(36 214)">
      <rect x="0" y="0" width="426" height="36" rx="18" fill="#0b1117" stroke="#263241"/>
      <text x="20" y="24" class="font muted" font-size="12" font-weight="950" letter-spacing="1.15">NOW</text>
      <text x="76" y="24" class="font white" font-size="13" font-weight="850">7 CEX + on-chain wallets in one place</text>
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
  const logos = {
    binance: localDataUri(join(PUBLIC_DIR, "cex/binance.svg"), "image/svg+xml"),
    bitpanda: localDataUri(join(PUBLIC_DIR, "cex/bitpanda-official.jpeg"), "image/jpeg"),
    bitfinex: await remoteDataUri("https://s2.coinmarketcap.com/static/img/exchanges/128x128/37.png"),
    bybit: await remoteDataUri("https://s2.coinmarketcap.com/static/img/exchanges/128x128/521.png"),
    coinbase: await remoteDataUri("https://s2.coinmarketcap.com/static/img/exchanges/128x128/89.png"),
    okx: await remoteDataUri("https://s2.coinmarketcap.com/static/img/exchanges/128x128/294.png"),
    kraken: await remoteDataUri("https://s2.coinmarketcap.com/static/img/exchanges/128x128/24.png"),
  };
  const svg = buildSvg(logos);
  const svgPath = join(PUBLIC_DIR, `${OUT_NAME}.svg`);
  const pngPath = join(PUBLIC_DIR, `${OUT_NAME}.png`);
  const tmpHtml = join(PUBLIC_DIR, `.${OUT_NAME}.tmp.html`);
  writeFileSync(svgPath, svg);
  writeFileSync(tmpHtml, `<!DOCTYPE html><html><head><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#050607;width:${W}px;height:${H}px;overflow:hidden}</style></head><body>${svg}</body></html>`);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: W, height: H });
  await page.goto(pathToFileURL(tmpHtml).href, { waitUntil: "load" });
  await page.waitForTimeout(800);
  await page.screenshot({ path: pngPath, type: "png", omitBackground: false });
  await browser.close();
  unlinkSync(tmpHtml);
  console.log(`Generated ${svgPath}`);
  console.log(`Generated ${pngPath}`);
})();
