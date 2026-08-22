// Build "wcore-post-forgotten-wallets" concept post (1200x675, DA v12)
// Angle: abandoned wallets still hold value; WCORE rescans everything into one clean total.
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
    <text x="572" y="74" text-anchor="middle" class="font white" font-size="54" font-weight="950" letter-spacing="-2">That old wallet? Still yours.</text>
    <text x="572" y="104" text-anchor="middle" class="font muted" font-size="20" font-weight="500" letter-spacing="-0.2">Forgotten addresses hold real value. WCORE finds every one.</text>
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

  // ===== LEFT: three dormant wallet cards =====
  const CARDS = [
    { addr: "0x8f3a...c21d", name: "MetaMask", meta: "last active March 2023", gain: "+$142", dy: 176 },
    { addr: "0xd41e...77aa", name: "Old burner wallet", meta: "dormant for 14 months", gain: "+$58", dy: 268 },
    { addr: "Exchange account", name: "CEX - 2021 era", meta: "never checked since signup", gain: "+$310", dy: 360 },
  ];
  const lx = 70; const lw = 470;
  CARDS.forEach((c) => {
    const cy = c.dy;
    parts.push(`<rect x="${lx}" y="${cy}" width="${lw}" height="80" rx="12" fill="#0d1117" stroke="#232c38"/>`);
    // avatar circle with lock/sleep icon
    const acy = cy + 40;
    parts.push(`<circle cx="${lx + 44}" cy="${acy}" r="17" fill="#141a22" stroke="#2a3442"/>`);
    parts.push(`<rect x="${lx + 37}" y="${cy + 33}" width="14" height="11" rx="2.5" fill="none" stroke="#a1a1aa" stroke-width="1.5"/>`);
    parts.push(`<path d="M${lx + 39.5} ${cy + 33} v-3 a4.5 4.5 0 0 1 9 0 v3" fill="none" stroke="#a1a1aa" stroke-width="1.5"/>`);
    parts.push(`<text x="${lx + 74}" y="${cy + 30}" class="font soft" font-size="15" font-weight="800">${c.addr}</text>`);
    parts.push(`<text x="${lx + 74}" y="${cy + 50}" class="font label" font-size="12" font-weight="500">${c.name} - ${c.meta}</text>`);
    // gain pill right
    parts.push(`<g transform="translate(${lx + lw - 92} ${cy + 24})">
      <rect x="0" y="0" width="72" height="30" rx="15" fill="#132117" stroke="#3f6212"/>
      <text x="36" y="20" text-anchor="middle" class="font" font-size="13.5" font-weight="900" fill="url(#lime)">${c.gain}</text>
    </g>`);
  });
  parts.push(`<text x="${lx + lw / 2}" y="480" text-anchor="middle" class="font label" font-size="13" font-weight="700" letter-spacing="1.6">DORMANT WALLETS YOU FORGOT</text>`);

  // connector arrow to right card
  parts.push(`<path d="M556 350 C 576 350 578 350 596 350" fill="none" stroke="#84cc16" stroke-opacity="0.5" stroke-width="2" stroke-linecap="round"/>`);
  parts.push(`<path d="M588 342 L598 350 L588 358" fill="none" stroke="#84cc16" stroke-opacity="0.5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`);

  // ===== RIGHT: WCORE hero card =====
  const px = 610; const pw = 500; const py = 156; const ph = 424;
  parts.push(`<rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="16" fill="#0d1117" stroke="#3f6212" stroke-width="1.5"/>`);
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

  // Big recovered total
  parts.push(`<text x="${px + 28}" y="${py + 118}" class="font" font-size="52" font-weight="950" fill="url(#lime)" letter-spacing="-2">$510</text>`);
  parts.push(`<text x="${px + 190}" y="${py + 100}" class="font white" font-size="17" font-weight="800">rediscovered</text>`);
  parts.push(`<text x="${px + 190}" y="${py + 122}" class="font muted" font-size="12.5" font-weight="500">across every address you own</text>`);

  parts.push(`<line x1="${px + 28}" y1="${py + 146}" x2="${px + pw - 28}" y2="${py + 146}" stroke="#1f2937" stroke-width="1"/>`);

  const ROWS = [
    { main: "Every address scanned", sub: "Add all your wallets, past and present", icon: "check" },
    { main: "183 chains covered", sub: "EVM, Solana, Cosmos, TON", icon: "check" },
    { main: "CEX balances folded in", sub: "7 exchanges, read-only keys", icon: "check" },
    { main: "Scam tokens excluded", sub: "Dust never reaches your total", icon: "shield" },
  ];
  let ry = py + 164;
  ROWS.forEach((r) => {
    parts.push(`<rect x="${px + 20}" y="${ry}" width="${pw - 40}" height="50" rx="10" fill="#0f141b"/>`);
    const icx = px + 48; const icy = ry + 25;
    if (r.icon === "check") {
      parts.push(`<circle cx="${icx}" cy="${icy}" r="10" fill="#132117" stroke="#84cc16" stroke-width="1.5"/>`);
      parts.push(`<path d="M${icx - 4.5} ${icy} l 3 3.5 l 7 -8" fill="none" stroke="#a3e635" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>`);
    } else {
      parts.push(`<path d="M${icx} ${icy - 10} L${icx + 8.7} ${icy - 6.2} V${icy + 1.4} C${icx + 8.7} ${icy + 6.8} ${icx} ${icy + 10} ${icx} ${icy + 10} C${icx} ${icy + 10} ${icx - 8.7} ${icy + 6.8} ${icx - 8.7} ${icy + 1.4} V${icy - 6.2} Z" fill="#132117" stroke="#84cc16" stroke-width="1.4"/>`);
      parts.push(`<path d="M${icx - 4} ${icy} l 2.8 3.2 l 6 -7" fill="none" stroke="#a3e635" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>`);
    }
    parts.push(`<text x="${px + 76}" y="${ry + 21}" class="font white" font-size="14.5" font-weight="800">${r.main}</text>`);
    parts.push(`<text x="${px + 76}" y="${ry + 41}" class="font muted" font-size="11.5" font-weight="500">${r.sub}</text>`);
    ry += 54;
  });

  parts.push(`<g transform="translate(${px + pw / 2 - 108} ${py + ph - 40})">
    <rect x="0" y="0" width="216" height="30" rx="15" fill="#132117" stroke="#3f6212"/>
    <text x="108" y="20" text-anchor="middle" class="font" font-size="13" font-weight="900" letter-spacing="1" fill="url(#lime)">ONE CLEAN TOTAL</text>
  </g>`);
  parts.push(`<text x="${px + pw / 2}" y="${py + ph + 26}" text-anchor="middle" class="font lime" font-size="13" font-weight="700" letter-spacing="1.6">FOUND BY WCORE</text>`);

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
  const name = "wcore-post-forgotten-wallets";
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
  } catch { /* default launch */ }

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