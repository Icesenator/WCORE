// Generates the Zapper shutdown continuity post visual (1200x675, WCORE DA v12).
// Output: apps/web/public/wcore-post-zapper-continuity.svg + .png

const { readFileSync, unlinkSync, writeFileSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { pathToFileURL } = require("node:url");

const ROOT = resolve(__dirname, "..");
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (_e) {
  ({ chromium } = require(resolve(ROOT, "node_modules/.pnpm/playwright@1.59.1/node_modules/playwright")));
}

const PUBLIC_DIR = join(ROOT, "apps/web/public");
const OUT_NAME = "wcore-post-zapper-continuity";
const W = 1200;
const H = 675;
const fontStack = 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

function assetDataUri(relativePath, mime) {
  return `data:${mime};base64,${readFileSync(join(PUBLIC_DIR, relativePath)).toString("base64")}`;
}

const logos = {
  eth: assetDataUri("chains/ETHEREUM.png", "image/png"),
  base: assetDataUri("chains/BASE.png", "image/png"),
  sol: assetDataUri("chains/SOLANA.png", "image/png"),
  cex: assetDataUri("cex/binance.svg", "image/svg+xml"),
  ibc: assetDataUri("chains/COSMOS_HUB.png", "image/png"),
};

function logoBadge(x, y) {
  return `
    <g transform="translate(${x} ${y})">
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
    </g>`;
}

function pill(x, y, label, color = "#84cc16", width = 150) {
  return `
    <g transform="translate(${x} ${y})">
      <rect x="0" y="0" width="${width}" height="34" rx="17" fill="#0c1218" stroke="${color}" stroke-opacity="0.62"/>
      <circle cx="20" cy="17" r="5" fill="${color}"/>
      <text x="34" y="22" class="font white" font-size="12" font-weight="950" letter-spacing="0.9">${label}</text>
    </g>`;
}

function continuityRow(y, icon, title, body, color = "#84cc16") {
  return `
    <g transform="translate(0 ${y})">
      <rect x="0" y="0" width="420" height="66" rx="20" fill="#101720" stroke="#253041"/>
      <rect x="18" y="14" width="38" height="38" rx="13" fill="#111b14" stroke="${color}" stroke-opacity="0.62"/>
      <text x="37" y="39" text-anchor="middle" class="font" fill="${color}" font-size="17" font-weight="950">${icon}</text>
      <text x="72" y="28" class="font white" font-size="17" font-weight="950">${title}</text>
      <text x="72" y="50" class="font muted" font-size="12.5" font-weight="720">${body}</text>
    </g>`;
}

function sourceLogo(x, y, id, label, href, color) {
  return `
    <g transform="translate(${x} ${y})">
      <circle cx="0" cy="0" r="22" fill="#050a10" stroke="#263344" stroke-width="1.6"/>
      <circle cx="0" cy="0" r="18" fill="#ffffff" stroke="${color}" stroke-width="2.6"/>
      <clipPath id="clip-${id}"><circle cx="0" cy="0" r="14.5"/></clipPath>
      <image x="-14.5" y="-14.5" width="29" height="29" href="${href}" preserveAspectRatio="xMidYMid meet" clip-path="url(#clip-${id})"/>
      <text x="0" y="33" text-anchor="middle" class="font muted" font-size="10" font-weight="950" letter-spacing="0.25">${label}</text>
    </g>`;
}

function buildSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#050607"/>
      <stop offset="0.52" stop-color="#080f14"/>
      <stop offset="1" stop-color="#14220f"/>
    </linearGradient>
    <linearGradient id="lime" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#bef264"/>
      <stop offset="1" stop-color="#84cc16"/>
    </linearGradient>
    <linearGradient id="amber" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f97316"/>
      <stop offset="1" stop-color="#facc15"/>
    </linearGradient>
    <linearGradient id="panel" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#111922"/>
      <stop offset="1" stop-color="#091014"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#84cc16" stop-opacity="0.24"/>
      <stop offset="1" stop-color="#84cc16" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="amberGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#facc15" stop-opacity="0.16"/>
      <stop offset="1" stop-color="#facc15" stop-opacity="0"/>
    </radialGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="22" stdDeviation="26" flood-color="#000" flood-opacity="0.56"/>
    </filter>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="#000" flood-opacity="0.38"/>
    </filter>
    <style>
      .font { font-family: ${fontStack}; }
      .white { fill: #f7f7f8; }
      .muted { fill: #a1a1aa; }
      .soft { fill: #d4d4d8; }
      .lime { fill: #a3e635; }
    </style>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="165" cy="95" r="390" fill="url(#glow)"/>
  <circle cx="1015" cy="585" r="350" fill="url(#glow)" opacity="0.78"/>
  <circle cx="905" cy="142" r="260" fill="url(#amberGlow)" opacity="0.88"/>
  <g opacity="0.045" stroke="#84cc16">
    <path d="M0 112H1200M0 225H1200M0 338H1200M0 451H1200M0 564H1200"/>
    <path d="M150 0V675M300 0V675M450 0V675M600 0V675M750 0V675M900 0V675M1050 0V675"/>
  </g>
  <path d="M-80 116C112 28 318 76 526 140C716 198 844 126 1010 72C1110 40 1190 54 1280 110" fill="none" stroke="#84cc16" stroke-opacity="0.12" stroke-width="2"/>
  <path d="M-80 558C128 470 306 518 492 574C680 630 842 590 1010 504C1100 458 1186 464 1280 524" fill="none" stroke="#22c55e" stroke-opacity="0.08" stroke-width="2"/>

  ${logoBadge(72, 52)}

  <g transform="translate(72 154)">
    <text x="0" y="0" class="font" font-size="13" font-weight="950" fill="#facc15" letter-spacing="2.1">TRACKER SHUTDOWN</text>
    <text x="0" y="62" class="font white" font-size="54" font-weight="950" letter-spacing="-2.1">Trackers shut down.</text>
    <text x="0" y="120" class="font white" font-size="54" font-weight="950" letter-spacing="-2.1">Portfolios shouldn't.</text>
    <text x="2" y="170" class="font muted" font-size="18" font-weight="720">Zapper is sunsetting its app on Aug 3.</text>
    <text x="2" y="198" class="font muted" font-size="18" font-weight="720">Your onchain footprint stays. Keep a second read-only view.</text>
  </g>

  <g transform="translate(72 408)">
    ${pill(0, 0, "READ-ONLY", "#84cc16", 146)}
    ${pill(160, 0, "180+ CHAINS", "#22d3ee", 158)}
    ${pill(334, 0, "CEX IMPORTS", "#a78bfa", 150)}
  </g>

  <g transform="translate(72 482)" filter="url(#softShadow)">
    <rect x="0" y="0" width="520" height="88" rx="26" fill="#0d1219" stroke="#34551f"/>
    <text x="30" y="36" class="font lime" font-size="13" font-weight="950" letter-spacing="1.7">PORTFOLIO CONTINUITY LAYER</text>
    <text x="30" y="64" class="font soft" font-size="17" font-weight="830">No seed phrase. No forced wallet connect. No fake total.</text>
  </g>

  <g transform="translate(640 92)" filter="url(#shadow)">
    <rect x="0" y="0" width="488" height="500" rx="36" fill="url(#panel)" stroke="#2f3b49"/>
    <rect x="1" y="1" width="486" height="498" rx="35" fill="none" stroke="#84cc16" stroke-opacity="0.12"/>

    <g transform="translate(34 32)">
      <rect x="0" y="0" width="420" height="86" rx="24" fill="#15100a" stroke="#facc15" stroke-opacity="0.64"/>
      <circle cx="47" cy="43" r="25" fill="#241707" stroke="#facc15" stroke-width="3"/>
      <rect x="33" y="29" width="28" height="25" rx="6" fill="#120d08" stroke="#facc15" stroke-width="3"/>
      <path d="M33 38H61" stroke="#facc15" stroke-width="3"/>
      <circle cx="39" cy="34" r="1.8" fill="#facc15"/>
      <circle cx="45" cy="34" r="1.8" fill="#facc15"/>
      <path d="M40 46L54 46M47 39V53" stroke="#facc15" stroke-width="3.2" stroke-linecap="round"/>
      <text x="86" y="36" class="font white" font-size="22" font-weight="950">Single tracker risk</text>
      <text x="86" y="62" class="font muted" font-size="13.5" font-weight="720">One UI disappearing should not erase visibility.</text>
    </g>

    <g transform="translate(34 138)">
      ${continuityRow(0, "1", "Export the view", "Addresses, chains and CEX stay portable.", "#facc15")}
      ${continuityRow(78, "2", "Read from public data", "Balances are visible without control.", "#22d3ee")}
      ${continuityRow(156, "3", "Keep a backup tracker", "WCORE gives your wallet map a second surface.", "#84cc16")}
    </g>

    <g transform="translate(34 396)">
      <rect x="0" y="0" width="420" height="76" rx="22" fill="#090f17" stroke="#253041" opacity="0.86"/>
      <path d="M54 36H366" stroke="#84cc16" stroke-width="2.4" stroke-linecap="round" opacity="0.28"/>
      ${sourceLogo(50, 36, "eth", "ETH", logos.eth, "#627eea")}
      ${sourceLogo(130, 36, "base", "BASE", logos.base, "#60a5fa")}
      ${sourceLogo(210, 36, "sol", "SOL", logos.sol, "#a78bfa")}
      ${sourceLogo(290, 36, "cex", "CEX", logos.cex, "#facc15")}
      ${sourceLogo(370, 36, "ibc", "IBC", logos.ibc, "#22d3ee")}
    </g>
  </g>

  <g transform="translate(72 630)">
    <text x="0" y="0" class="font soft" font-size="18" font-weight="850">Your tracker should never be a single point of failure.</text>
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

  const html = `<!DOCTYPE html><html><head><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#050607;width:${W}px;height:${H}px;overflow:hidden}svg{display:block;width:${W}px;height:${H}px}</style></head><body>${svg}</body></html>`;
  writeFileSync(tmpHtml, html);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 8 / 3 });
  await page.goto(pathToFileURL(tmpHtml).href, { waitUntil: "load" });
  await page.screenshot({ path: pngPath, type: "png" });
  await browser.close();
  unlinkSync(tmpHtml);

  console.log(`Generated ${svgPath}`);
  console.log(`Generated ${pngPath}`);
})();
