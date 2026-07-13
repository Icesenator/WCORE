// Build "one clean view" concept post (WCORE DA v12, 3200x1800 PNG).
// Angle: crypto has too much data; WCORE turns it into a clean read-only portfolio view.
const { writeFileSync, unlinkSync } = require("node:fs");
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
const NAME = "wcore-post-one-clean-view";
const PUBLIC_DIR = resolve(ROOT, "apps/web/public");
const SVG_PATH = resolve(PUBLIC_DIR, `${NAME}.svg`);
const PNG_PATH = resolve(PUBLIC_DIR, `${NAME}.png`);
const TMP_HTML = resolve(PUBLIC_DIR, `.${NAME}.tmp.html`);
const fontStack = 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

function esc(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function wcoreBadge(x, y) {
  return `<g transform="translate(${x} ${y})">
    <rect x="0" y="0" width="164" height="52" rx="26" fill="#111722" stroke="#2a3442"/>
    <g transform="translate(16 12) scale(0.45)" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path d="M32 8L54 20.5V45.5L32 58L10 45.5V20.5L32 8Z" stroke="#84cc16" stroke-width="4"/>
      <circle cx="32" cy="33" r="5" fill="#84cc16" stroke="none"/>
      <path d="M32 33L32 20M32 33L21 40M32 33L43 40" stroke="#84cc16" stroke-width="3"/>
      <circle cx="32" cy="20" r="3.5" fill="#84cc16" stroke="none"/>
      <circle cx="21" cy="40" r="3.5" fill="#84cc16" stroke="none"/>
      <circle cx="43" cy="40" r="3.5" fill="#84cc16" stroke="none"/>
      <path d="M32 20L32 8M21 40L10 46M43 40L54 46" stroke="#84cc16" stroke-opacity="0.6" stroke-width="2"/>
      <circle cx="32" cy="8" r="2.5" fill="#84cc16" fill-opacity="0.5" stroke="none"/>
      <circle cx="10" cy="46" r="2.5" fill="#84cc16" fill-opacity="0.5" stroke="none"/>
      <circle cx="54" cy="46" r="2.5" fill="#84cc16" fill-opacity="0.5" stroke="none"/>
    </g>
    <text x="60" y="33" class="font white" font-size="18" font-weight="950" letter-spacing="0.8">WCORE</text>
  </g>`;
}

function chip(x, y, label, value, tone = "lime") {
  const stroke = tone === "red" ? "#7f1d1d" : tone === "blue" ? "#1d4ed8" : "#34551f";
  const fill = tone === "red" ? "#170d10" : tone === "blue" ? "#0d1624" : "#101915";
  const text = tone === "red" ? "#f87171" : tone === "blue" ? "#60a5fa" : "#a3e635";
  return `<g transform="translate(${x} ${y})">
    <rect x="0" y="0" width="176" height="74" rx="22" fill="${fill}" stroke="${stroke}"/>
    <text x="22" y="28" class="font muted" font-size="11" font-weight="950" letter-spacing="1.25">${esc(label).toUpperCase()}</text>
    <text x="22" y="56" class="font" font-size="25" font-weight="950" fill="${text}" letter-spacing="-0.6">${esc(value)}</text>
  </g>`;
}

function tokenRow(y, symbol, label, value, state = "ok") {
  const scam = state === "scam";
  return `<g transform="translate(0 ${y})">
    <rect x="0" y="0" width="368" height="52" rx="17" fill="${scam ? "#1a0f11" : "#101720"}" stroke="${scam ? "#7f1d1d" : "#243142"}"/>
    <circle cx="31" cy="26" r="14" fill="${scam ? "#450a0a" : "#172015"}" stroke="${scam ? "#b91c1c" : "#34551f"}"/>
    <text x="31" y="31" text-anchor="middle" class="font" font-size="9.5" font-weight="950" fill="${scam ? "#f87171" : "#a3e635"}">${esc(symbol.slice(0, 4))}</text>
    <text x="62" y="23" class="font ${scam ? "redText" : "white"}" font-size="15" font-weight="950">${esc(symbol)}</text>
    <text x="62" y="42" class="font muted" font-size="11.5" font-weight="720">${esc(label)}</text>
    <text x="342" y="33" text-anchor="end" class="font" font-size="14.5" font-weight="900" fill="${scam ? "#52525b" : "#d4d4d8"}" ${scam ? 'text-decoration="line-through"' : ""}>${esc(value)}</text>
  </g>`;
}

function buildSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#050607"/>
      <stop offset="0.52" stop-color="#081014"/>
      <stop offset="1" stop-color="#14220f"/>
    </linearGradient>
    <linearGradient id="lime" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#bef264"/>
      <stop offset="1" stop-color="#84cc16"/>
    </linearGradient>
    <linearGradient id="panel" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#111922"/>
      <stop offset="1" stop-color="#090f14"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#84cc16" stop-opacity="0.24"/>
      <stop offset="1" stop-color="#84cc16" stop-opacity="0"/>
    </radialGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="22" stdDeviation="28" flood-color="#000" flood-opacity="0.52"/>
    </filter>
    <style>
      .font { font-family: ${fontStack}; }
      .white { fill: #f7f7f8; }
      .muted { fill: #a1a1aa; }
      .soft { fill: #d4d4d8; }
      .lime { fill: #a3e635; }
      .redText { fill: #f87171; }
    </style>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="210" cy="116" r="360" fill="url(#glow)"/>
  <circle cx="980" cy="565" r="330" fill="url(#glow)" opacity="0.72"/>
  <g opacity="0.04" stroke="#84cc16">
    <path d="M0 112H1200M0 225H1200M0 338H1200M0 451H1200M0 564H1200"/>
    <path d="M150 0V675M300 0V675M450 0V675M600 0V675M750 0V675M900 0V675M1050 0V675"/>
  </g>
  <path d="M-90 140C150 32 355 82 570 148C765 207 900 126 1050 78C1130 52 1200 68 1290 126" fill="none" stroke="#84cc16" stroke-opacity="0.12" stroke-width="2"/>
  <path d="M-80 560C126 472 330 520 520 570C718 622 865 588 1025 505C1110 460 1190 468 1282 528" fill="none" stroke="#22c55e" stroke-opacity="0.08" stroke-width="2"/>

  ${wcoreBadge(72, 52)}
  <g transform="translate(874 52)">
    <rect x="0" y="0" width="254" height="52" rx="26" fill="#12151b" stroke="#2c333f"/>
    <text x="22" y="33" class="font white" font-size="18" font-weight="950" letter-spacing="0.3">ONE CLEAN VIEW</text>
    <circle cx="230" cy="26" r="5" fill="#84cc16"/>
  </g>

  <g transform="translate(72 162)">
    <text x="0" y="0" class="font lime" font-size="13" font-weight="950" letter-spacing="2.1">CRYPTO PORTFOLIO NOISE</text>
    <text x="0" y="66" class="font white" font-size="60" font-weight="950" letter-spacing="-2.5">Too much data.</text>
    <text x="0" y="128" class="font white" font-size="60" font-weight="950" letter-spacing="-2.5">One clean view.</text>
    <text x="2" y="180" class="font muted" font-size="20" font-weight="700">Wallets, networks, CEX balances, old positions</text>
    <text x="2" y="210" class="font muted" font-size="20" font-weight="700">and scam airdrops should not become one fake total.</text>
  </g>

  <g transform="translate(72 432)">
    ${chip(0, 0, "Wallets", "12", "lime")}
    ${chip(194, 0, "Networks", "182", "lime")}
    ${chip(388, 0, "Filtered", "junk", "red")}
  </g>

  <g filter="url(#shadow)">
    <rect x="690" y="136" width="438" height="430" rx="36" fill="url(#panel)" stroke="#2f3b49"/>
    <rect x="691" y="137" width="436" height="428" rx="35" fill="none" stroke="#84cc16" stroke-opacity="0.14"/>
    <text x="728" y="186" class="font muted" font-size="12" font-weight="950" letter-spacing="1.5">PORTFOLIO SUMMARY</text>

    <g transform="translate(728 206)">
      <text x="0" y="45" class="font" font-size="38" font-weight="950" fill="#52525b" text-decoration="line-through">$18,742</text>
      <rect x="196" y="15" width="114" height="30" rx="15" fill="#2a1214" stroke="#7f1d1d"/>
      <text x="253" y="35" text-anchor="middle" class="font redText" font-size="12" font-weight="950">RAW NOISE</text>

      <text x="0" y="120" class="font" font-size="64" font-weight="950" fill="url(#lime)" letter-spacing="-2.2">$7,418</text>
      <rect x="236" y="77" width="92" height="30" rx="15" fill="#132117" stroke="#3f6212"/>
      <text x="282" y="97" text-anchor="middle" class="font lime" font-size="12" font-weight="950">CLEAN</text>
    </g>

    <line x1="728" y1="350" x2="1090" y2="350" stroke="#1a2332"/>
    <g transform="translate(728 368)">
      ${tokenRow(0, "ETH", "wallet balance", "$4,120")}
      ${tokenRow(62, "CEX", "exchange balances", "$2,836")}
      ${tokenRow(124, "JUNK", "fake airdrop price", "$11,324", "scam")}
    </g>
  </g>

  <g transform="translate(72 596)">
    <text x="0" y="0" class="font soft" font-size="17" font-weight="850">Read-only clarity before any wallet action.</text>
    <text x="1056" y="0" text-anchor="end" class="font" font-size="28" font-weight="950" fill="url(#lime)">wcore.xyz</text>
  </g>
  <g transform="translate(72 622)">
    <rect x="0" y="0" width="132" height="28" rx="14" fill="#0c1218" stroke="#34551f"/>
    <text x="66" y="19" text-anchor="middle" class="font lime" font-size="12" font-weight="950" letter-spacing="1">NO SEED</text>
    <rect x="146" y="0" width="140" height="28" rx="14" fill="#0c1218" stroke="#2b3340"/>
    <text x="216" y="19" text-anchor="middle" class="font white" font-size="12" font-weight="850" letter-spacing="1">READ ONLY</text>
    <rect x="300" y="0" width="156" height="28" rx="14" fill="#0c1218" stroke="#2b3340"/>
    <text x="378" y="19" text-anchor="middle" class="font white" font-size="12" font-weight="850" letter-spacing="1">CLEAN TOTAL</text>
  </g>
  <rect x="0" y="671" width="1200" height="4" fill="url(#lime)" opacity="0.72"/>
</svg>`;
}

(async () => {
  const svg = buildSvg();
  writeFileSync(SVG_PATH, svg);
  console.log(`SVG written: ${SVG_PATH} (${svg.length} bytes)`);

  const html = `<!DOCTYPE html><html><head><style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#050607;width:${W}px;height:${H}px;overflow:hidden}
    svg{display:block;width:${W}px;height:${H}px}
  </style></head><body>${svg}</body></html>`;
  writeFileSync(TMP_HTML, html);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 8 / 3 });
  await page.goto(`file://${TMP_HTML.replace(/\\/g, "/")}`);
  await page.screenshot({ path: PNG_PATH, type: "png" });
  await browser.close();

  unlinkSync(TMP_HTML);
  console.log(`PNG written: ${PNG_PATH}`);
})();
