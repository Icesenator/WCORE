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
      <stop offset="0" stop-color="#040506"/>
      <stop offset="1" stop-color="#101f0c"/>
    </linearGradient>
    <linearGradient id="lime" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#d9f99d"/>
      <stop offset="1" stop-color="#65a30d"/>
    </linearGradient>
    <style>
      .font { font-family: ${fontStack}; }
      .white { fill: #f8fafc; }
      .muted { fill: #a1a1aa; }
      .lime { fill: #a3e635; }
    </style>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="180" cy="80" r="280" fill="#84cc16" fill-opacity="0.12"/>
  <circle cx="1020" cy="620" r="260" fill="#22c55e" fill-opacity="0.10"/>
  <text x="80" y="92" class="font lime" font-size="18" font-weight="900" letter-spacing="3">ONE PORTFOLIO</text>
  <text x="80" y="168" class="font white" font-size="58" font-weight="950">162 chains.</text>
  <text x="80" y="236" class="font white" font-size="58" font-weight="950">7 CEX.</text>
  <text x="80" y="304" class="font lime" font-size="58" font-weight="950">One view.</text>
  <text x="80" y="360" class="font muted" font-size="22">Public wallets and read-only exchange keys, together.</text>
  <g>
    <rect x="80" y="410" width="220" height="92" rx="16" fill="#111827" stroke="#3f6212"/>
    <text x="190" y="448" text-anchor="middle" class="font lime" font-size="28" font-weight="950">162</text>
    <text x="190" y="478" text-anchor="middle" class="font muted" font-size="14" font-weight="800">CHAINS</text>
    <rect x="316" y="410" width="220" height="92" rx="16" fill="#111827" stroke="#3f6212"/>
    <text x="426" y="448" text-anchor="middle" class="font lime" font-size="28" font-weight="950">7</text>
    <text x="426" y="478" text-anchor="middle" class="font muted" font-size="14" font-weight="800">CEX</text>
    <rect x="552" y="410" width="220" height="92" rx="16" fill="#111827" stroke="#3f6212"/>
    <text x="662" y="448" text-anchor="middle" class="font lime" font-size="28" font-weight="950">1</text>
    <text x="662" y="478" text-anchor="middle" class="font muted" font-size="14" font-weight="800">PORTFOLIO</text>
  </g>
  <text x="80" y="560" class="font white" font-size="22" font-weight="800">No wallet connection. No seed phrase.</text>
  <text x="80" y="620" class="font muted" font-size="18">Read first. Act later.</text>
  <text x="1120" y="620" text-anchor="end" class="font lime" font-size="22" font-weight="950">wcore.xyz</text>
</svg>`;
}

(async () => {
  const svg = buildSvg();
  const name = "wcore-post-one-portfolio-v2";
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
