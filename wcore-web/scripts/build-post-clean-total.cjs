const { writeFileSync, unlinkSync, existsSync, readdirSync } = require("node:fs");
const { pathToFileURL } = require("node:url");
const { resolve } = require("node:path");

const ROOT = resolve(__dirname, "..");
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (_e) {
  ({ chromium } = require("K:/ProjetIA/WCORE/node_modules/playwright"));
}

const W = 1200;
const H = 675;
const fontStack = 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

function buildSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0a0405"/>
      <stop offset="1" stop-color="#1f100c"/>
    </linearGradient>
    <linearGradient id="amber" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fde68a"/>
      <stop offset="1" stop-color="#d97706"/>
    </linearGradient>
    <style>
      .font { font-family: ${fontStack}; }
      .white { fill: #f8fafc; }
      .muted { fill: #a1a1aa; }
      .amber { fill: #fbbf24; }
      .scam { fill: #f87171; text-decoration: line-through; }
    </style>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="200" cy="90" r="270" fill="#f97316" fill-opacity="0.10"/>
  <circle cx="1010" cy="600" r="250" fill="#ef4444" fill-opacity="0.08"/>
  <text x="80" y="92" class="font amber" font-size="18" font-weight="900" letter-spacing="3">CLEAN TOTAL</text>
  <text x="80" y="168" class="font white" font-size="58" font-weight="950">Your total</text>
  <text x="80" y="236" class="font white" font-size="58" font-weight="950">is lying.</text>
  <text x="80" y="292" class="font muted" font-size="22">Scam airdrops and dust inflate your portfolio. WCORE flags them.</text>
  <g>
    <rect x="80" y="340" width="500" height="52" rx="12" fill="#111827" stroke="#27303f"/>
    <text x="104" y="373" class="font white" font-size="20" font-weight="800">USDC</text>
    <text x="556" y="373" text-anchor="end" class="font white" font-size="20" font-weight="800">$4,210.00</text>
    <rect x="80" y="402" width="500" height="52" rx="12" fill="#181013" stroke="#7f1d1d"/>
    <text x="104" y="435" class="font scam" font-size="20" font-weight="800">JUGGERNAUT</text>
    <text x="330" y="435" class="font amber" font-size="14" font-weight="900">SCAM FLAG</text>
    <text x="556" y="435" text-anchor="end" class="font scam" font-size="20" font-weight="800">$38,000.00</text>
    <rect x="80" y="464" width="500" height="52" rx="12" fill="#111827" stroke="#27303f"/>
    <text x="104" y="497" class="font white" font-size="20" font-weight="800">ETH</text>
    <text x="556" y="497" text-anchor="end" class="font white" font-size="20" font-weight="800">$1,845.50</text>
  </g>
  <g>
    <rect x="660" y="380" width="460" height="96" rx="16" fill="#111827" stroke="#b45309"/>
    <text x="890" y="420" text-anchor="middle" class="font muted" font-size="15" font-weight="800">SHOWN TOTAL</text>
    <text x="890" y="456" text-anchor="middle" class="font scam" font-size="26" font-weight="950">$44,055.50</text>
    <rect x="660" y="492" width="460" height="96" rx="16" fill="#111827" stroke="#16a34a"/>
    <text x="890" y="532" text-anchor="middle" class="font muted" font-size="15" font-weight="800">CLEAN TOTAL</text>
    <text x="890" y="568" text-anchor="middle" class="amber" style="fill:#a3e635" font-size="26" font-weight="950">$6,055.50</text>
  </g>
  <text x="80" y="576" class="font white" font-size="22" font-weight="800">Read-only. No wallet connection.</text>
  <text x="80" y="620" class="font muted" font-size="18">Know what you actually hold.</text>
  <text x="1120" y="620" text-anchor="end" class="font amber" font-size="22" font-weight="950">wcore.xyz</text>
</svg>`;
}

(async () => {
  const svg = buildSvg();
  const name = "wcore-post-clean-total";
  const pub = resolve(ROOT, "apps/web/public");
  const svgPath = resolve(pub, `${name}.svg`);
  const pngPath = resolve(pub, `${name}.png`);
  const tmpHtml = resolve(pub, `.${name}.tmp.html`);
  writeFileSync(svgPath, svg);
  writeFileSync(tmpHtml, `<!DOCTYPE html><html><body style="margin:0;width:1200px;height:675px;overflow:hidden">${svg}</body></html>`);
  let executablePath;
  try {
    const pwRoot = resolve(process.env.LOCALAPPDATA ?? "", "ms-playwright");
    const candidates = readdirSync(pwRoot).filter((dir) => dir.startsWith("chromium_headless_shell")).sort().reverse();
    for (const dir of candidates) {
      const candidate = resolve(pwRoot, dir, "chrome-headless-shell-win64/chrome-headless-shell.exe");
      if (existsSync(candidate)) { executablePath = candidate; break; }
    }
  } catch (_error) {}
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    await page.goto(pathToFileURL(tmpHtml).href, { waitUntil: "load" });
    await page.screenshot({ path: pngPath, type: "png" });
  } finally {
    await browser.close();
    unlinkSync(tmpHtml);
  }
  console.log(pngPath);
})().catch((error) => { console.error(error); process.exit(1); });
