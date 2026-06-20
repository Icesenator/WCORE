// Generates the chain sunset calendar post visual (1200x675, WCORE DA v12).
// Output: apps/web/public/wcore-post-chain-sunset-calendar.svg + .png

const { unlinkSync, writeFileSync } = require("node:fs");
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
const OUT_NAME = "wcore-post-chain-sunset-calendar";
const W = 1200;
const H = 675;

const DEADLINES = [
  { date: "JUN 23", chain: "Swell Chain", action: "Bridge before deadline", accent: "#facc15" },
  { date: "JUN 30", chain: "Corn", action: "Network stops", accent: "#fb923c" },
  { date: "JUL 01", chain: "Polygon zkEVM", action: "Sequencer sunset", accent: "#c084fc" },
  { date: "JUL 09", chain: "Botanix", action: "Withdraw assets", accent: "#38bdf8" },
  { date: "JUL 31", chain: "ZERO Network", action: "Bridge out", accent: "#84cc16" },
  { date: "OCT 20", chain: "Mint", action: "Gateway closes", accent: "#34d399" },
  { date: "JUN 03 2027", chain: "Cronos zkEVM", action: "Shutdown", accent: "#f87171" },
];

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

function deadlineCard(item, index) {
  const x = index < 4 ? 72 + index * 258 : 203 + (index - 4) * 258;
  const y = index < 4 ? 392 : 520;
  const width = index === 6 ? 254 : 238;
  return `
    <g transform="translate(${x} ${y})" filter="url(#softShadow)">
      <rect x="0" y="0" width="${width}" height="100" rx="24" fill="#0d1219" stroke="#263244"/>
      <rect x="16" y="16" width="86" height="30" rx="15" fill="#111827" stroke="${item.accent}" stroke-opacity="0.7"/>
      <text x="59" y="36" text-anchor="middle" class="font" font-size="12" font-weight="950" fill="${item.accent}" letter-spacing="0.8">${item.date}</text>
      <text x="18" y="67" class="font white" font-size="19" font-weight="950">${item.chain}</text>
      <text x="18" y="88" class="font muted" font-size="12.5" font-weight="760">${item.action}</text>
    </g>`;
}

function buildSvg() {
  const cards = DEADLINES.map(deadlineCard).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#050607"/>
      <stop offset="0.52" stop-color="#080f14"/>
      <stop offset="1" stop-color="#16200d"/>
    </linearGradient>
    <linearGradient id="lime" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#bef264"/>
      <stop offset="1" stop-color="#84cc16"/>
    </linearGradient>
    <linearGradient id="warn" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f97316"/>
      <stop offset="1" stop-color="#facc15"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#84cc16" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#84cc16" stop-opacity="0"/>
    </radialGradient>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="18" stdDeviation="20" flood-color="#000" flood-opacity="0.42"/>
    </filter>
    <filter id="heroShadow" x="-15%" y="-15%" width="130%" height="140%">
      <feDropShadow dx="0" dy="26" stdDeviation="28" flood-color="#000" flood-opacity="0.62"/>
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
  <circle cx="160" cy="86" r="350" fill="url(#glow)"/>
  <circle cx="1020" cy="565" r="380" fill="url(#glow)" opacity="0.78"/>
  <g opacity="0.045" stroke="#84cc16">
    <path d="M0 112H1200M0 225H1200M0 338H1200M0 451H1200M0 564H1200"/>
    <path d="M150 0V675M300 0V675M450 0V675M600 0V675M750 0V675M900 0V675M1050 0V675"/>
  </g>
  <path d="M-80 116C112 28 318 76 526 140C716 198 844 126 1010 72C1110 40 1190 54 1280 110" fill="none" stroke="#84cc16" stroke-opacity="0.12" stroke-width="2"/>
  <path d="M-80 558C128 470 306 518 492 574C680 630 842 590 1010 504C1100 458 1186 464 1280 524" fill="none" stroke="#22c55e" stroke-opacity="0.08" stroke-width="2"/>

  ${logoBadge(72, 48)}

  <g transform="translate(72 152)">
    <text x="0" y="0" class="font" font-size="13" font-weight="950" fill="#facc15" letter-spacing="1.9">CHAIN SHUTDOWN CALENDAR</text>
    <text x="0" y="72" class="font white" font-size="62" font-weight="950" letter-spacing="-2.2">Deadlines are</text>
    <text x="0" y="136" class="font white" font-size="62" font-weight="950" letter-spacing="-2.2">part of risk.</text>
    <text x="0" y="192" class="font muted" font-size="18" font-weight="760">When a chain winds down, visibility is not enough.</text>
    <text x="0" y="220" class="font muted" font-size="18" font-weight="760">Track what you hold. Check official links. Move before deadlines.</text>
  </g>

  <g transform="translate(742 132)" filter="url(#heroShadow)">
    <rect x="0" y="0" width="374" height="206" rx="34" fill="#0d1219" stroke="#facc15" stroke-opacity="0.64"/>
    <circle cx="68" cy="72" r="38" fill="#1b1408" stroke="#facc15" stroke-width="3"/>
    <path d="M68 47L94 91H42Z" fill="none" stroke="#facc15" stroke-width="5" stroke-linejoin="round"/>
    <path d="M68 61V75" stroke="#facc15" stroke-width="4" stroke-linecap="round"/>
    <circle cx="68" cy="83" r="3.4" fill="#facc15"/>
    <text x="128" y="62" class="font white" font-size="26" font-weight="950">Do not wait</text>
    <text x="128" y="94" class="font white" font-size="26" font-weight="950">for explorers</text>
    <text x="128" y="126" class="font white" font-size="26" font-weight="950">to go dark.</text>
    <rect x="28" y="152" width="318" height="30" rx="15" fill="#101a12" stroke="#84cc16" stroke-opacity="0.58"/>
    <text x="187" y="172" text-anchor="middle" class="font" font-size="12" font-weight="950" fill="#a3e635" letter-spacing="1.2">READ FIRST. ACT LATER.</text>
  </g>

  ${cards}

  <g transform="translate(72 646)">
    <text x="0" y="0" class="font soft" font-size="17" font-weight="850">WCORE keeps coverage active until public deadlines, then removes dead chains.</text>
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
  await page.waitForTimeout(500);
  await page.screenshot({ path: pngPath, type: "png", omitBackground: false });
  await page.close();
  await browser.close();
  unlinkSync(tmpHtml);
  console.log(`Generated ${svgPath}`);
  console.log(`Generated ${pngPath}`);
})();
