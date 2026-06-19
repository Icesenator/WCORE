// Build "wcore-post-scam-flags" concept post (1200x675, DA v12)
// Angle: scam tokens inflate portfolio totals, WCORE flags them out of the clean total.
const { writeFileSync, unlinkSync, readFileSync } = require("node:fs");
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

function logoDataUri(name) {
  const p = resolve(__dirname, "x-cycle/assets", `${name}.png`);
  return `data:image/png;base64,${readFileSync(p).toString("base64")}`;
}

const SIGNALS = [
  { num: "01", title: "FAKE PRICE", desc: "Dust balances priced to look real.", icon: "price" },
  { num: "02", title: "ABSURD SUPPLY", desc: "Millions of tokens you never bought.", icon: "supply" },
  { num: "03", title: "AIRDROPPED JUNK", desc: "Assets that appear out of nowhere.", icon: "drop" },
  { num: "04", title: "FLAGGED, NOT COUNTED", desc: "Suspicious value stays out of your total.", icon: "flag" },
];

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
    <text x="600" y="74" text-anchor="middle" class="font white" font-size="56" font-weight="950" letter-spacing="-2.2">Your total is lying.</text>
    <text x="600" y="104" text-anchor="middle" class="font muted" font-size="20" font-weight="500" letter-spacing="-0.2">Scam tokens inflate portfolio values. WCORE keeps them out.</text>
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

  // ===== LEFT: portfolio mock card (x=70, w=470, y=156-580) =====
  const px = 70;
  const pw = 470;
  const py = 156;
  parts.push(`<rect x="${px}" y="${py}" width="${pw}" height="424" rx="16" fill="#0d1117" stroke="#1a2332"/>`);
  parts.push(`<text x="${px + 28}" y="${py + 40}" class="font label" font-size="13" font-weight="800" letter-spacing="2">PORTFOLIO SCAN</text>`);

  // Inflated total (struck through, red)
  parts.push(`<text x="${px + 28}" y="${py + 86}" class="font" font-size="34" font-weight="900" fill="#52525b" text-decoration="line-through">$498,231</text>`);
  parts.push(`<g transform="translate(${px + 220} ${py + 64})">
    <rect x="0" y="0" width="118" height="28" rx="14" fill="#2a1214" stroke="#7f1d1d"/>
    <text x="59" y="19" text-anchor="middle" class="font red" font-size="13" font-weight="800">INFLATED</text>
  </g>`);

  // Clean total (lime, big)
  parts.push(`<text x="${px + 28}" y="${py + 148}" class="font" font-size="46" font-weight="950" fill="url(#lime)" letter-spacing="-1.5">$1,204</text>`);
  parts.push(`<g transform="translate(${px + 220} ${py + 118})">
    <rect x="0" y="0" width="146" height="28" rx="14" fill="#132117" stroke="#3f6212"/>
    <text x="73" y="19" text-anchor="middle" class="font lime" font-size="13" font-weight="800">CLEAN TOTAL</text>
  </g>`);

  parts.push(`<line x1="${px + 28}" y1="${py + 176}" x2="${px + pw - 28}" y2="${py + 176}" stroke="#1a2332" stroke-width="1"/>`);

  // Token rows (real logos for legit tokens, anonymous red circle for the scam)
  const rows = [
    { sym: "ETH", name: "Ethereum", val: "$842.10", ok: true, logo: "eth" },
    { sym: "USDC", name: "USD Coin", val: "$310.55", ok: true, logo: "usdc" },
    { sym: "OP", name: "Optimism", val: "$51.62", ok: true, logo: "op" },
    { sym: "ETHG", name: "2,000,000 tokens airdropped", val: "$497,027", ok: false, logo: null },
  ];
  let ry = py + 196;
  let clipIdx = 0;
  rows.forEach((r) => {
    const rh = 52;
    if (!r.ok) {
      parts.push(`<rect x="${px + 16}" y="${ry}" width="${pw - 32}" height="${rh}" rx="10" fill="#1c0e10" stroke="#7f1d1d"/>`);
    } else {
      parts.push(`<rect x="${px + 16}" y="${ry}" width="${pw - 32}" height="${rh}" rx="10" fill="#0f141b"/>`);
    }
    // token logo or anonymous circle
    const cx = px + 44;
    const cyc = ry + rh / 2;
    if (r.logo) {
      const clipId = `tokenClip${clipIdx++}`;
      parts.push(`<clipPath id="${clipId}"><circle cx="${cx}" cy="${cyc}" r="14"/></clipPath>`);
      parts.push(`<circle cx="${cx}" cy="${cyc}" r="15" fill="#ffffff"/>`);
      parts.push(`<image href="${logoDataUri(r.logo)}" x="${cx - 14}" y="${cyc - 14}" width="28" height="28" clip-path="url(#${clipId})"/>`);
    } else {
      parts.push(`<circle cx="${cx}" cy="${cyc}" r="14" fill="#450a0a"/>`);
      parts.push(`<text x="${cx}" y="${cyc + 4}" text-anchor="middle" class="font" font-size="9" font-weight="900" fill="#f87171">${r.sym.substring(0, 4)}</text>`);
    }
    // name
    parts.push(`<text x="${px + 70}" y="${ry + 22}" class="font ${r.ok ? "white" : "red"}" font-size="15" font-weight="800">${r.sym}</text>`);
    parts.push(`<text x="${px + 70}" y="${ry + 40}" class="font ${r.ok ? "muted" : "red"}" font-size="11" font-weight="500" ${r.ok ? "" : 'opacity="0.8"'}>${r.name}</text>`);
    // value
    if (r.ok) {
      parts.push(`<text x="${px + pw - 40}" y="${ry + 32}" text-anchor="end" class="font soft" font-size="15" font-weight="700">${r.val}</text>`);
    } else {
      parts.push(`<text x="${px + pw - 110}" y="${ry + 32}" text-anchor="end" class="font" font-size="15" font-weight="700" fill="#52525b" text-decoration="line-through">${r.val}</text>`);
      // flag pill
      parts.push(`<g transform="translate(${px + pw - 98} ${ry + 13})">
        <rect x="0" y="0" width="70" height="26" rx="13" fill="#450a0a" stroke="#b91c1c"/>
        <path d="M14 7 v12 M14 7 h10 l-2.5 3 2.5 3 h-10" fill="none" stroke="#f87171" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        <text x="32" y="17" class="font red" font-size="11" font-weight="900">SCAM</text>
      </g>`);
    }
    ry += rh + 8;
  });

  // ===== RIGHT: 4 signal cards (x=600, w=540) =====
  const cardX = 600;
  const cardW = 540;
  const cardH = 92;
  const cardGap = 12;
  let cardY = 162;
  SIGNALS.forEach((card) => {
    parts.push(`<rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="12" fill="#0d1117" stroke="#1a2332"/>`);
    parts.push(`<text x="${cardX + 28}" y="${cardY + 56}" class="font" font-size="26" font-weight="950" fill="url(#lime)">${card.num}</text>`);
    parts.push(`<line x1="${cardX + 84}" y1="${cardY + 18}" x2="${cardX + 84}" y2="${cardY + cardH - 18}" stroke="#1f2937" stroke-width="1"/>`);
    parts.push(`<text x="${cardX + 106}" y="${cardY + 40}" class="font white" font-size="17" font-weight="900" letter-spacing="1.4">${card.title}</text>`);
    parts.push(`<text x="${cardX + 106}" y="${cardY + 64}" class="font muted" font-size="13.5" font-weight="500">${card.desc}</text>`);
    // icon right
    const iconCx = cardX + cardW - 44;
    const iconCy = cardY + cardH / 2;
    if (card.icon === "price") {
      parts.push(`<circle cx="${iconCx}" cy="${iconCy}" r="15" fill="none" stroke="#f87171" stroke-width="1.5"/>`);
      parts.push(`<text x="${iconCx}" y="${iconCy + 5}" text-anchor="middle" class="font red" font-size="15" font-weight="900">$</text>`);
      parts.push(`<line x1="${iconCx - 11}" y1="${iconCy + 11}" x2="${iconCx + 11}" y2="${iconCy - 11}" stroke="#f87171" stroke-width="2" stroke-linecap="round"/>`);
    } else if (card.icon === "supply") {
      for (let i = 0; i < 3; i++) {
        parts.push(`<ellipse cx="${iconCx}" cy="${iconCy + 7 - i * 7}" rx="13" ry="4.5" fill="none" stroke="#f87171" stroke-width="1.5" opacity="${0.5 + i * 0.25}"/>`);
      }
    } else if (card.icon === "drop") {
      parts.push(`<path d="M${iconCx} ${iconCy - 13} C ${iconCx + 9} ${iconCy - 2} ${iconCx + 9} ${iconCy + 5} ${iconCx} ${iconCy + 11} C ${iconCx - 9} ${iconCy + 5} ${iconCx - 9} ${iconCy - 2} ${iconCx} ${iconCy - 13} Z" fill="none" stroke="#f87171" stroke-width="1.6" transform="rotate(180 ${iconCx} ${iconCy})"/>`);
      parts.push(`<text x="${iconCx}" y="${iconCy + 4}" text-anchor="middle" class="font red" font-size="12" font-weight="900">?</text>`);
    } else if (card.icon === "flag") {
      parts.push(`<circle cx="${iconCx}" cy="${iconCy}" r="15" fill="#132117" stroke="#84cc16" stroke-width="1.5"/>`);
      parts.push(`<path d="M${iconCx - 7} ${iconCy} l 4.5 5 l 10 -11" fill="none" stroke="#84cc16" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`);
    }
    cardY += cardH + cardGap;
  });

  // Footer
  parts.push(`<line x1="100" y1="600" x2="1100" y2="600" stroke="#1a2332" stroke-width="1"/>`);
  parts.push(`<g>
    <text x="100" y="638" class="font soft" font-size="18" font-weight="900" letter-spacing="-0.4">Clean totals. Nothing fake counted.</text>
    <text x="1100" y="638" text-anchor="end" class="font" font-size="20" font-weight="950" letter-spacing="2.4" fill="url(#lime)">wcore.xyz</text>
  </g>`);
  parts.push(`<rect x="0" y="671" width="1200" height="4" fill="url(#lime)" opacity="0.72"/>`);

  parts.push(`</svg>`);
  return parts.join("\n");
}

(async () => {
  const svg = buildSvg();
  const name = "wcore-post-scam-flags";
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

  const browser = await chromium.launch({ headless: true });
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
