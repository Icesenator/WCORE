// Build script for the X post: "8 more GM chains."
// Celebrates the 8 new GM factory chains activated in this session:
// Core, Flare, X Layer, Shibarium, Degen, Beam, Ronin, opBNB.
// 64 GM chains live now (was 56 before this session).
// Output: apps/web/public/wcore-post-gm-8-new-chains.svg + .png

const { existsSync, readFileSync, unlinkSync, writeFileSync } = require("node:fs");
const { extname, join, resolve } = require("node:path");
const { pathToFileURL } = require("node:url");
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = require(resolve(__dirname, "../node_modules/.pnpm/playwright@1.59.1/node_modules/playwright")));
}

const ROOT = resolve(__dirname, "..");
const PUBLIC_DIR = join(ROOT, "apps/web/public");
const CHAINS_DIR = join(PUBLIC_DIR, "chains");
const OUT_NAME = "wcore-post-gm-8-new-chains";
const W = 1200;
const H = 675;
const fontStack = 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

const NEW_CHAINS = [
  { key: "core", label: "Core" },
  { key: "flare", label: "Flare" },
  { key: "x_layer", label: "X Layer" },
  { key: "shibarium", label: "Shibarium" },
  { key: "degen", label: "Degen" },
  { key: "beam", label: "Beam" },
  { key: "ronin", label: "Ronin" },
  { key: "opbnb", label: "opBNB" },
];

const TOTAL_LIVE = 64;
const ADDED = 8;

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function logoPathFor(key) {
  const base = key.toUpperCase();
  const candidates = [
    `${base}.png`, `${base}.webp`, `${base}.jpg`, `${base}.jpeg`, `${base}.svg`, `${base}.ico`,
  ];
  for (const file of candidates) {
    const p = join(CHAINS_DIR, file);
    if (existsSync(p)) return p;
  }
  return null;
}

function dataUri(filePath) {
  if (!filePath) return null;
  const ext = extname(filePath).toLowerCase();
  const mime =
    ext === ".svg" ? "image/svg+xml" :
    ext === ".webp" ? "image/webp" :
    ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" :
    ext === ".ico" ? "image/x-icon" : "image/png";
  return `data:${mime};base64,${readFileSync(filePath).toString("base64")}`;
}

function cell(chain, i, x, y, w, h) {
  const logo = dataUri(logoPathFor(chain.key));
  const clipId = `chainLogo${i}`;
  const iconCx = x + 56;
  const iconCy = y + h / 2;
  const labelX = x + 114;
  const labelY = y + h / 2 + 7;
  const icon = logo
    ? `<clipPath id="${clipId}"><circle cx="${iconCx}" cy="${iconCy}" r="36"/></clipPath>
       <circle cx="${iconCx}" cy="${iconCy}" r="42" fill="#050607"/>
       <circle cx="${iconCx}" cy="${iconCy}" r="38" fill="#f7f7f8"/>
       <circle cx="${iconCx}" cy="${iconCy}" r="42" fill="none" stroke="#84cc16" stroke-opacity="0.32" stroke-width="2"/>
       <image href="${logo}" x="${iconCx - 36}" y="${iconCy - 36}" width="72" height="72" preserveAspectRatio="xMidYMid meet" clip-path="url(#${clipId})"/>`
    : `<circle cx="${iconCx}" cy="${iconCy}" r="38" fill="#0a1018" stroke="#2a3442" stroke-width="2"/>
       <text x="${iconCx}" y="${iconCy + 6}" text-anchor="middle" class="font white" font-size="18" font-weight="950">${escapeXml(chain.label.slice(0, 3).toUpperCase())}</text>`;
  return `
    <g>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="20" fill="#0d1117" stroke="#1a2332"/>
      <rect x="${x + 1}" y="${y + 1}" width="${w - 2}" height="${h - 2}" rx="19" fill="none" stroke="#84cc16" stroke-opacity="0.12"/>
      ${icon}
      <text x="${labelX}" y="${labelY}" class="font white" font-size="22" font-weight="900">${escapeXml(chain.label)}</text>
    </g>`;
}

function buildSvg() {
  const cols = 4;
  const rows = 2;
  const cellW = 256;
  const cellH = 116;
  const gapX = 14;
  const gapY = 16;
  const totalGridW = cols * cellW + (cols - 1) * gapX;
  const gridX = (W - totalGridW) / 2;
  const gridY = 286;

  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`);
  parts.push(`<defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#050607"/>
      <stop offset="0.55" stop-color="#0b1117"/>
      <stop offset="1" stop-color="#15210d"/>
    </linearGradient>
    <linearGradient id="lime" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#bef264"/>
      <stop offset="1" stop-color="#84cc16"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#84cc16" stop-opacity="0.26"/>
      <stop offset="1" stop-color="#84cc16" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowA" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#a3e635" stop-opacity="0.34"/>
      <stop offset="1" stop-color="#a3e635" stop-opacity="0"/>
    </radialGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="20" stdDeviation="22" flood-color="#000" flood-opacity="0.5"/>
    </filter>
    <style>
      .font { font-family: ${fontStack}; }
      .white { fill: #f5f5f6; }
      .muted { fill: #9ca3af; }
      .soft { fill: #d4d4d8; }
      .lime { fill: #a3e635; }
    </style>
  </defs>`);

  parts.push(`<rect width="1200" height="675" fill="url(#bg)"/>`);
  parts.push(`<circle cx="180" cy="100" r="370" fill="url(#glowA)"/>`);
  parts.push(`<circle cx="1020" cy="600" r="320" fill="url(#glow)" opacity="0.85"/>`);

  parts.push(`<g opacity="0.05" stroke="#84cc16">
    <path d="M0 112H1200M0 225H1200M0 338H1200M0 451H1200M0 564H1200"/>
    <path d="M150 0V675M300 0V675M450 0V675M600 0V675M750 0V675M900 0V675M1050 0V675"/>
  </g>`);

  parts.push(`<path d="M-70 132C82 54 246 74 402 124C570 178 690 158 828 88C970 16 1088 52 1260 118" fill="none" stroke="#84cc16" stroke-opacity="0.14" stroke-width="2"/>`);
  parts.push(`<path d="M-60 540C120 470 246 500 402 552C556 604 718 598 856 520C998 446 1080 468 1240 548" fill="none" stroke="#22c55e" stroke-opacity="0.10" stroke-width="2"/>`);

  // WCORE badge top-left
  parts.push(`<g transform="translate(72 52)">
    <rect x="0" y="0" width="162" height="52" rx="26" fill="#12151b" stroke="#2c333f"/>
    <g transform="translate(12 9) scale(0.53125)" fill="none" stroke-linecap="round" stroke-linejoin="round">
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
    <text x="60" y="33" class="font white" font-size="18" font-weight="900" letter-spacing="0.8">WCORE</text>
  </g>`);

  // Right pill: counter
  parts.push(`<g transform="translate(862 52)">
    <rect x="0" y="0" width="266" height="52" rx="26" fill="#12151b" stroke="#2c333f"/>
    <text x="22" y="33" class="font white" font-size="18" font-weight="950" letter-spacing="0.5">${TOTAL_LIVE} GM CHAINS LIVE</text>
    <circle cx="240" cy="26" r="5" fill="#84cc16"/>
  </g>`);

  // Title
  parts.push(`<text x="72" y="220" class="font white" font-size="58" font-weight="950" letter-spacing="-2.6">8 more GM chains.</text>`);
  parts.push(`<text x="74" y="254" class="font muted" font-size="19" font-weight="650">Personal contracts. Creator fees. Chain streaks.</text>`);

  // Pills row (moved below the badges, above the title)
  const pillY = 124;
  parts.push(`<g transform="translate(72 ${pillY})">
    <rect x="0" y="0" width="138" height="32" rx="16" fill="#0c1218" stroke="#34551f"/>
    <text x="69" y="21" text-anchor="middle" class="font lime" font-size="13" font-weight="950" letter-spacing="1.1">${ADDED} NEW TODAY</text>
    <rect x="150" y="0" width="142" height="32" rx="16" fill="#0c1218" stroke="#2b3340"/>
    <text x="221" y="21" text-anchor="middle" class="font white" font-size="13" font-weight="800" letter-spacing="1.0">Shanghai build</text>
    <rect x="304" y="0" width="142" height="32" rx="16" fill="#0c1218" stroke="#2b3340"/>
    <text x="375" y="21" text-anchor="middle" class="font white" font-size="13" font-weight="800" letter-spacing="1.0">London EIP-1559</text>
  </g>`);

  // 4x2 chain grid
  parts.push(`<g filter="url(#shadow)">`);
  NEW_CHAINS.forEach((chain, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = gridX + col * (cellW + gapX);
    const cyy = gridY + row * (cellH + gapY);
    parts.push(cell(chain, i, cx, cyy, cellW, cellH));
  });
  parts.push(`</g>`);

  // Bottom strip
  parts.push(`<g transform="translate(72 600)">
    <text x="0" y="0" class="font muted" font-size="18" font-weight="700">One personal GM contract per chain. On-chain. Your keys.</text>
    <text x="1056" y="0" text-anchor="end" class="font" font-size="28" font-weight="950" fill="url(#lime)">wcore.xyz</text>
  </g>`);

  parts.push(`<rect x="0" y="671" width="1200" height="4" fill="url(#lime)" opacity="0.72"/>`);
  parts.push(`</svg>`);
  return parts.join("\n");
}

(async () => {
  const svg = buildSvg();
  const svgPath = join(PUBLIC_DIR, `${OUT_NAME}.svg`);
  const pngPath = join(PUBLIC_DIR, `${OUT_NAME}.png`);
  const tmpHtml = join(PUBLIC_DIR, `.${OUT_NAME}.tmp.html`);
  writeFileSync(svgPath, svg);

  const html = `<!DOCTYPE html><html><head><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#0a0a0c;display:flex;align-items:center;justify-content:center;width:1200px;height:675px;overflow:hidden}</style></head><body>${svg}</body></html>`;
  writeFileSync(tmpHtml, html);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1200, height: 675 });
  await page.goto(pathToFileURL(tmpHtml).href, { waitUntil: "load" });
  await page.waitForTimeout(800);
  await page.screenshot({ path: pngPath, type: "png", omitBackground: false });
  await page.close();
  await browser.close();
  unlinkSync(tmpHtml);
  console.log(`Generated ${svgPath}`);
  console.log(`Generated ${pngPath}`);
})();
