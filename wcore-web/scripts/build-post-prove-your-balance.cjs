const { writeFileSync, unlinkSync, existsSync, readdirSync } = require("node:fs");
const { pathToFileURL } = require("node:url");
const { resolve } = require("node:path");

const ROOT = resolve(__dirname, "..");
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (_e) {
  try {
    ({ chromium } = require(resolve(ROOT, "node_modules/.pnpm/playwright@1.59.1/node_modules/playwright")));
  } catch (_localError) {
    ({ chromium } = require("K:/ProjetIA/WCORE/wcore-web/node_modules/.pnpm/playwright@1.59.1/node_modules/playwright"));
  }
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
      <stop offset="0" stop-color="#84cc16" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#84cc16" stop-opacity="0"/>
    </radialGradient>
    <filter id="shadow"><feDropShadow dx="0" dy="10" stdDeviation="16" flood-color="#000" flood-opacity="0.45"/></filter>
    <style>
      .font { font-family: ${fontStack}; }
      .white { fill: #f7f7f8; }
      .muted { fill: #a1a1aa; }
      .soft { fill: #d4d4d8; }
      .lime { fill: #a3e635; }
      .red { fill: #f87171; }
      .amber { fill: #fbbf24; }
      .label { fill: #71717a; }
    </style>
  </defs>`);

  parts.push(`<rect width="${W}" height="${H}" fill="url(#bg)"/>`);
  parts.push(`<circle cx="160" cy="100" r="390" fill="url(#glow)"/>`);
  parts.push(`<circle cx="1050" cy="585" r="360" fill="url(#glow)" opacity="0.78"/>`);
  parts.push(`<g opacity="0.045" stroke="#84cc16">
    <path d="M0 112H1200M0 225H1200M0 338H1200M0 451H1200M0 564H1200"/>
    <path d="M150 0V675M300 0V675M450 0V675M600 0V675M750 0V675M900 0V675M1050 0V675"/>
  </g>`);

  parts.push(`<text x="560" y="74" text-anchor="middle" class="font white" font-size="52" font-weight="950" letter-spacing="-2">Your balance is a claim. Prove it.</text>`);
  parts.push(`<text x="560" y="104" text-anchor="middle" class="font muted" font-size="19" font-weight="500">One wallet. Three RPC answers. One result worth trusting.</text>`);

  parts.push(`<g transform="translate(964 50)">
    <rect width="164" height="52" rx="26" fill="#111722" stroke="#2a3442"/>
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
  parts.push(`<line x1="70" y1="130" x2="1130" y2="130" stroke="#1a2332"/>`);

  const rpcRows = [
    { name: "RPC 01", value: "4.280 ETH", state: "FRESH", color: "#a3e635", y: 174 },
    { name: "RPC 02", value: "4.180 ETH", state: "LAGGING", color: "#fbbf24", y: 278 },
    { name: "RPC 03", value: "0.000 ETH", state: "STALE", color: "#f87171", y: 382 },
  ];
  rpcRows.forEach((row) => {
    parts.push(`<g filter="url(#shadow)">
      <rect x="70" y="${row.y}" width="330" height="82" rx="13" fill="#0d1117" stroke="#273140"/>
      <circle cx="104" cy="${row.y + 41}" r="17" fill="#121923" stroke="${row.color}" stroke-opacity="0.7"/>
      <path d="M96 ${row.y + 41}h16M104 ${row.y + 33}v16" stroke="${row.color}" stroke-width="1.6" opacity="0.8"/>
      <text x="134" y="${row.y + 31}" class="font muted" font-size="12" font-weight="800" letter-spacing="1.4">${row.name}</text>
      <text x="134" y="${row.y + 58}" class="font white" font-size="22" font-weight="900">${row.value}</text>
      <rect x="302" y="${row.y + 26}" width="78" height="28" rx="14" fill="#111722" stroke="${row.color}" stroke-opacity="0.65"/>
      <text x="341" y="${row.y + 45}" text-anchor="middle" class="font" fill="${row.color}" font-size="10" font-weight="900" letter-spacing="0.7">${row.state}</text>
    </g>`);
  });
  parts.push(`<text x="235" y="500" text-anchor="middle" class="font label" font-size="12" font-weight="800" letter-spacing="1.8">SAME WALLET, DIFFERENT ANSWERS</text>`);

  parts.push(`<path d="M410 215 C455 215 458 280 494 298M410 319H494M410 423C455 423 458 358 494 340" fill="none" stroke="#84cc16" stroke-opacity="0.38" stroke-width="2"/>`);
  parts.push(`<g transform="translate(494 244)" filter="url(#shadow)">
    <path d="M0 0H126L103 74H23Z" fill="#101720" stroke="#3f6212" stroke-width="1.5"/>
    <path d="M23 74H103L82 126H44Z" fill="#132117" stroke="#3f6212" stroke-width="1.5"/>
    <circle cx="63" cy="96" r="14" fill="#1d2d17" stroke="#84cc16"/>
    <path d="M56 96l5 5 10-12" fill="none" stroke="#a3e635" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="63" y="30" text-anchor="middle" class="font white" font-size="13" font-weight="900" letter-spacing="1">RPC</text>
    <text x="63" y="50" text-anchor="middle" class="font lime" font-size="13" font-weight="900" letter-spacing="1">CONSENSUS</text>
  </g>`);
  parts.push(`<path d="M620 319H654" stroke="#84cc16" stroke-opacity="0.6" stroke-width="2"/><path d="M646 311l10 8-10 8" fill="none" stroke="#84cc16" stroke-width="2"/>`);

  const cardX = 665;
  const cardY = 158;
  const cardW = 465;
  const cardH = 422;
  parts.push(`<g filter="url(#shadow)">
    <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="17" fill="#0d1117" stroke="#4d7c0f" stroke-width="1.5"/>
    <rect x="${cardX}" y="${cardY}" width="${cardW}" height="60" rx="17" fill="#132117"/>
    <rect x="${cardX}" y="${cardY + 43}" width="${cardW}" height="17" fill="#132117"/>
  </g>`);
  parts.push(`<text x="${cardX + 28}" y="${cardY + 38}" class="font white" font-size="19" font-weight="950">WCORE RESULT</text>`);
  parts.push(`<g transform="translate(${cardX + cardW - 132} ${cardY + 16})"><rect width="104" height="28" rx="14" fill="#1d2d17" stroke="#84cc16"/><text x="52" y="19" text-anchor="middle" class="font lime" font-size="11" font-weight="950" letter-spacing="1">VERIFIED</text></g>`);

  parts.push(`<text x="${cardX + 28}" y="${cardY + 126}" class="font" font-size="52" font-weight="950" fill="url(#lime)" letter-spacing="-2">4.280 ETH</text>`);
  parts.push(`<text x="${cardX + 30}" y="${cardY + 153}" class="font muted" font-size="13">confirmed from the strongest live signal</text>`);
  parts.push(`<line x1="${cardX + 28}" y1="${cardY + 176}" x2="${cardX + cardW - 28}" y2="${cardY + 176}" stroke="#1f2937"/>`);

  const signals = [
    ["RPC CONSENSUS", "Cross-check live endpoints"],
    ["PRICE CASCADE", "Verify value across sources"],
    ["STALE DATA GUARD", "Do not turn old data into certainty"],
    ["READ ONLY", "No wallet connection. No signing."],
  ];
  signals.forEach(([title, sub], index) => {
    const y = cardY + 194 + index * 48;
    parts.push(`<rect x="${cardX + 22}" y="${y}" width="${cardW - 44}" height="42" rx="9" fill="#0f141b"/>
      <circle cx="${cardX + 48}" cy="${y + 21}" r="10" fill="#132117" stroke="#84cc16"/>
      <path d="M${cardX + 44} ${y + 21}l3 3.5 6-7" fill="none" stroke="#a3e635" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="${cardX + 70}" y="${y + 18}" class="font white" font-size="13" font-weight="900" letter-spacing="0.5">${title}</text>
      <text x="${cardX + 70}" y="${y + 34}" class="font muted" font-size="10.5">${sub}</text>`);
  });
  parts.push(`<text x="${cardX + cardW / 2}" y="${cardY + cardH - 18}" text-anchor="middle" class="font lime" font-size="12" font-weight="900" letter-spacing="1.5">ONE RESULT WORTH TRUSTING</text>`);

  parts.push(`<line x1="70" y1="616" x2="1130" y2="616" stroke="#1a2332"/>`);
  parts.push(`<text x="70" y="650" class="font soft" font-size="17" font-weight="900">Read first. Act later.</text>`);
  parts.push(`<text x="1130" y="650" text-anchor="end" class="font lime" font-size="19" font-weight="950" letter-spacing="2.4">wcore.xyz</text>`);
  parts.push(`<rect x="0" y="671" width="1200" height="4" fill="url(#lime)" opacity="0.72"/>`);
  parts.push(`</svg>`);
  return parts.join("\n");
}

(async () => {
  const svg = buildSvg();
  const name = "wcore-post-prove-your-balance";
  const pub = resolve(ROOT, "apps/web/public");
  const svgPath = resolve(pub, `${name}.svg`);
  const pngPath = resolve(pub, `${name}.png`);
  const tmpHtml = resolve(pub, `.${name}.tmp.html`);

  writeFileSync(svgPath, svg);
  const html = `<!DOCTYPE html><html><head><style>*{margin:0;padding:0;box-sizing:border-box}body{width:1200px;height:675px;overflow:hidden}</style></head><body>${svg}</body></html>`;
  writeFileSync(tmpHtml, html);

  let executablePath;
  try {
    const pwRoot = resolve(process.env.LOCALAPPDATA ?? "", "ms-playwright");
    const candidates = readdirSync(pwRoot).filter((dir) => dir.startsWith("chromium")).sort().reverse();
    for (const dir of candidates) {
      for (const sub of ["chrome-headless-shell-win64/chrome-headless-shell.exe", "chrome-win/chrome.exe", "chrome-win64/chrome.exe"]) {
        const candidate = resolve(pwRoot, dir, sub);
        if (existsSync(candidate)) {
          executablePath = candidate;
          break;
        }
      }
      if (executablePath) break;
    }
  } catch (_error) {}

  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(tmpHtml).href, { waitUntil: "load" });
    await page.screenshot({ path: pngPath, type: "png" });
  } finally {
    await browser.close();
    unlinkSync(tmpHtml);
  }

  console.log(`SVG written: ${svgPath}`);
  console.log(`PNG written: ${pngPath}`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
