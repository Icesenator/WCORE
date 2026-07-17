// Generates the Market Cap Crypto + Stock post visual (1200x675, WCORE DA v12).
// Output: apps/web/public/wcore-post-market-cap.svg + .png

const { closeSync, existsSync, openSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } = require("node:fs");
const { resolve } = require("node:path");

const ROOT = resolve(__dirname, "..");

function loadChromium() {
  try {
    return require("playwright").chromium;
  } catch (directError) {
    const pnpmDir = resolve(ROOT, "node_modules/.pnpm");
    if (existsSync(pnpmDir)) {
      const candidates = readdirSync(pnpmDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name.startsWith("playwright@"))
        .map((entry) => resolve(pnpmDir, entry.name, "node_modules/playwright"))
        .filter(existsSync)
        .sort();
      for (const candidate of candidates) {
        try {
          return require(candidate).chromium;
        } catch (_e) {
          // Try the next pnpm candidate before reporting both resolution paths.
        }
      }
    }
    throw new Error(`Unable to resolve Playwright directly or from ${pnpmDir}`, { cause: directError });
  }
}

const chromium = loadChromium();
const W = 1200;
const H = 675;
const CAPTURE_W = 760;
const CAPTURE_H = 278;
const PANEL_W = 560;
const PANEL_H = 205;
const HEADLINE = "Two markets. One clean ranking.";
const SITE = (process.env.WCORE_SITE_URL || process.env.SITE_URL || "https://wcore.xyz").replace(/\/$/, "");
const PUBLIC_DIR = resolve(ROOT, "apps/web/public");
const NAME = "wcore-post-market-cap";
const SVG_PATH = resolve(PUBLIC_DIR, `${NAME}.svg`);
const PNG_PATH = resolve(PUBLIC_DIR, `${NAME}.png`);
const RUN_ID = `${process.pid}.${Date.now()}`;
const TMP_SVG = resolve(PUBLIC_DIR, `.${NAME}.${RUN_ID}.tmp.svg`);
const TMP_PNG = resolve(PUBLIC_DIR, `.${NAME}.${RUN_ID}.tmp.png`);
const LOCK_PATH = resolve(PUBLIC_DIR, `.${NAME}.lock`);
const STALE_LOCK_PATH = resolve(PUBLIC_DIR, `.${NAME}.${RUN_ID}.stale.lock`);
const LOCK_STALE_MS = 10 * 60 * 1000;
const fontStack = 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

function removeIfPresent(path) {
  try {
    unlinkSync(path);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function pngDataUri(buffer) {
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

function readLockMetadata() {
  let modifiedAt = 0;
  try {
    modifiedAt = statSync(LOCK_PATH).mtimeMs;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  try {
    const parsed = JSON.parse(readFileSync(LOCK_PATH, "utf8"));
    return {
      pid: Number.isInteger(parsed.pid) && parsed.pid > 0 ? parsed.pid : null,
      timestamp: Number.isFinite(parsed.timestamp) ? parsed.timestamp : modifiedAt,
      runId: typeof parsed.runId === "string" ? parsed.runId : null,
    };
  } catch (_e) {
    return { pid: null, timestamp: modifiedAt, runId: null };
  }
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    if (error.code === "EPERM") return true;
    return true;
  }
}

function acquireLock() {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const fd = openSync(LOCK_PATH, "wx");
      try {
        writeFileSync(fd, JSON.stringify({ pid: process.pid, timestamp: Date.now(), runId: RUN_ID }));
      } catch (error) {
        closeSync(fd);
        removeIfPresent(LOCK_PATH);
        throw error;
      }
      console.log(`Lock acquired: pid=${process.pid}, run=${RUN_ID}`);
      return fd;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const metadata = readLockMetadata();
      if (!metadata) continue;
      const ageMs = Math.max(0, Date.now() - metadata.timestamp);
      const alive = isProcessAlive(metadata.pid);
      const reclaimable = alive === false || ageMs > LOCK_STALE_MS;
      if (!reclaimable) {
        throw new Error(`Another market cap post generation is active: pid=${metadata.pid ?? "unknown"}, age=${Math.round(ageMs / 1000)}s`);
      }
      try {
        renameSync(LOCK_PATH, STALE_LOCK_PATH);
        console.log(`Reclaiming stale lock: pid=${metadata.pid ?? "unknown"}, alive=${alive}, age=${Math.round(ageMs / 1000)}s`);
        removeIfPresent(STALE_LOCK_PATH);
      } catch (reclaimError) {
        if (reclaimError.code !== "ENOENT") throw reclaimError;
      }
    }
  }
  throw new Error(`Unable to acquire market cap generation lock: ${LOCK_PATH}`);
}

function releaseLock(fd) {
  try {
    closeSync(fd);
  } finally {
    const metadata = readLockMetadata();
    if (metadata?.runId === RUN_ID) removeIfPresent(LOCK_PATH);
  }
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

async function waitForMarketRows(page, route, expectedIdentity) {
  const deadline = Date.now() + 60000;
  let latest = null;
  while (Date.now() < deadline) {
    latest = await page.evaluate((expected) => {
      const main = document.querySelector("main");
      const status = main?.querySelector('section[aria-label="Market snapshot summary"] [role="status"]');
      const row = main?.querySelector('table tbody tr:not([aria-hidden="true"])');
      const cells = row ? Array.from(row.querySelectorAll("td")) : [];
      const statusText = status?.textContent?.replace(/\s+/g, " ").trim() || "";
      const rowText = row?.textContent?.replace(/\s+/g, " ").trim() || "";
      const identity = cells[1]?.textContent?.replace(/\s+/g, " ").trim() || "";
      const rank = cells[0]?.textContent?.trim() || "";
      const marketCap = cells.at(-1)?.textContent?.trim() || "";
      const expectedFound = expected.every((value) => identity.toLowerCase().includes(value.toLowerCase()));
      return {
        statusText,
        rowText,
        ready: Boolean(statusText)
          && !/loading|waiting for data/i.test(statusText)
          && /^\d+$/.test(rank)
          && identity.length >= 3
          && marketCap.length > 1
          && expectedFound,
      };
    }, expectedIdentity);

    if (/unavailable|no snapshot available/i.test(latest.statusText)) {
      throw new Error(`Market snapshot unavailable for ${route}: ${latest.statusText}`);
    }
    if (latest.ready) return latest;
    await new Promise((resolveWait) => setTimeout(resolveWait, 200));
  }
  throw new Error(`Timed out waiting for populated market rows on ${route}. Last state: ${JSON.stringify(latest)}`);
}

async function waitForMarketLogos(page, route, count = 2) {
  const deadline = Date.now() + 60000;
  let latest = [];
  while (Date.now() < deadline) {
    latest = await page.evaluate(async (expectedCount) => {
      const rows = Array.from(document.querySelectorAll('main table tbody tr:not([aria-hidden="true"])')).slice(0, expectedCount);
      return Promise.all(rows.map(async (row) => {
        const logo = row.querySelector("td:nth-child(2) > div > span");
        const image = logo?.querySelector("img");
        const fallback = logo?.querySelector(":scope > span");
        if (image) {
          if (!image.complete || image.naturalWidth <= 0) return { ready: false, kind: "pending-image" };
          try {
            await image.decode();
          } catch (_e) {
            return { ready: false, kind: "decode-failed" };
          }
          const visible = Number.parseFloat(getComputedStyle(image).opacity) > 0.5;
          return { ready: visible, kind: visible ? "decoded-image" : "pending-react-state", source: image.currentSrc || image.src };
        }
        if (fallback) {
          const style = getComputedStyle(fallback);
          const rect = fallback.getBoundingClientRect();
          const visible = style.visibility !== "hidden" && style.display !== "none" && Number.parseFloat(style.opacity) > 0.5 && rect.width > 0 && rect.height > 0;
          return { ready: visible && Boolean(fallback.textContent?.trim()), kind: "text-fallback", text: fallback.textContent?.trim() || "" };
        }
        return { ready: false, kind: "missing-logo" };
      }));
    }, count);
    if (latest.length === count && latest.every((item) => item.ready)) return latest;
    await new Promise((resolveWait) => setTimeout(resolveWait, 200));
  }
  throw new Error(`Timed out waiting for visible market logos on ${route}. Last state: ${JSON.stringify(latest)}`);
}

async function captureMain(browser, route, heading, expectedIdentity = [], hideCountry = false) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
  const url = `${SITE}${route}`;
  try {
    console.log(`Capturing ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.getByRole("heading", { name: heading, exact: true }).waitFor({ state: "visible", timeout: 60000 });
    await page.locator("main table").first().waitFor({ state: "visible", timeout: 60000 });
    const readiness = await waitForMarketRows(page, route, expectedIdentity);

    await page.addStyleTag({ content: `
      main { width: ${CAPTURE_W}px !important; max-width: ${CAPTURE_W}px !important; padding: 10px 12px !important; }
      main header { margin-bottom: 8px !important; padding-bottom: 8px !important; }
      main header > div { gap: 0 !important; }
      main header > div > div:last-child { display: none !important; }
      main header p { margin-bottom: 2px !important; }
      main header h1 { font-size: 22px !important; line-height: 1.15 !important; }
      main header h1 + p { display: none !important; }
      main section[aria-label="Market snapshot summary"] { margin-bottom: 8px !important; gap: 8px !important; }
      main section[aria-label="Market snapshot summary"] > div { padding: 8px 10px !important; }
      main section[aria-label="Market snapshot summary"] p { margin-top: 2px !important; line-height: 1.15 !important; }
      main table { min-width: 0 !important; width: 100% !important; table-layout: fixed !important; }
      main table th, main table td { padding: 5px 8px !important; }
      main table tbody td, main table tbody td p { font-size: 14px !important; line-height: 16px !important; }
      main table td:nth-child(2) > div > span > span { color: #f4f4f5 !important; font-size: 12px !important; font-weight: 900 !important; }
      main table th:first-child, main table td:first-child { width: 54px !important; }
      main table th:nth-last-child(2), main table td:nth-last-child(2) { width: 142px !important; }
      main table th:last-child, main table td:last-child { width: 150px !important; }
      ${hideCountry ? "main table th:nth-child(3), main table td:nth-child(3) { display: none !important; }" : ""}
    ` });
    await page.evaluate(() => new Promise((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(resolveFrame))));
    const logos = await waitForMarketLogos(page, route);

    const main = page.locator("main").first();
    const box = await main.boundingBox();
    if (!box) throw new Error(`Visible main content not found for ${route}`);
    const x = Math.max(0, box.x);
    const y = Math.max(0, box.y);
    const width = Math.min(1440 - x, box.width, CAPTURE_W);
    const height = Math.min(1000 - y, box.height, CAPTURE_H);
    if (width <= 0 || height <= 0) throw new Error(`Invalid main capture bounds for ${route}`);

    const capture = await page.screenshot({ type: "png", clip: { x, y, width, height } });
    console.log(`Captured ${route}: ${capture.readUInt32BE(16)}x${capture.readUInt32BE(20)} px from ${Math.round(width)}x${Math.round(height)} CSS, ${capture.length} bytes; logos=${logos.map((logo) => logo.kind).join(",")}; ${readiness.statusText}; first row: ${readiness.rowText}`);
    return capture;
  } finally {
    await page.close();
  }
}

function buildSvg(cryptoImage, stockImage) {
  const [headlineTop, headlineBottom] = HEADLINE.split(". ");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675" width="${W}" height="${H}">
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
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#84cc16" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#84cc16" stop-opacity="0"/>
    </radialGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#000" flood-opacity="0.58"/>
    </filter>
    <clipPath id="cryptoClip"><rect x="0" y="0" width="${PANEL_W}" height="${PANEL_H}" rx="24"/></clipPath>
    <clipPath id="stockClip"><rect x="0" y="0" width="${PANEL_W}" height="${PANEL_H}" rx="24"/></clipPath>
    <style>
      .font { font-family: ${fontStack}; }
      .white { fill: #f7f7f8; }
      .muted { fill: #a1a1aa; }
      .soft { fill: #d4d4d8; }
      .lime { fill: #a3e635; }
    </style>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="178" cy="94" r="365" fill="url(#glow)"/>
  <circle cx="1010" cy="566" r="350" fill="url(#glow)" opacity="0.74"/>
  <g opacity="0.04" stroke="#84cc16">
    <path d="M0 112H1200M0 225H1200M0 338H1200M0 451H1200M0 564H1200"/>
    <path d="M150 0V675M300 0V675M450 0V675M600 0V675M750 0V675M900 0V675M1050 0V675"/>
  </g>
  <path d="M-80 122C122 30 326 78 532 142C720 200 852 130 1014 76C1112 44 1194 56 1280 112" fill="none" stroke="#84cc16" stroke-opacity="0.12" stroke-width="2"/>
  <path d="M-80 558C128 470 306 518 492 574C680 630 842 590 1010 504C1100 458 1186 464 1280 524" fill="none" stroke="#22c55e" stroke-opacity="0.08" stroke-width="2"/>

  ${wcoreBadge(72, 48)}

  <g transform="translate(72 154)">
    <text x="0" y="0" class="font lime" font-size="13" font-weight="950" letter-spacing="2">MARKET CAP DIRECTORY</text>
    <text x="0" y="62" class="font white" font-size="53" font-weight="950" letter-spacing="-2.1">${headlineTop}.</text>
    <text x="0" y="119" class="font white" font-size="53" font-weight="950" letter-spacing="-2.1">${headlineBottom}</text>
    <text x="2" y="165" class="font muted" font-size="18" font-weight="730">Search and compare broad market directories</text>
    <text x="2" y="192" class="font muted" font-size="18" font-weight="730">without jumping between separate tools.</text>
  </g>

  <g transform="translate(72 390)">
    <rect x="0" y="0" width="460" height="72" rx="22" fill="#101915" stroke="#34551f"/>
    <text x="24" y="29" class="font muted" font-size="11" font-weight="950" letter-spacing="1.25">CRYPTO DIRECTORY</text>
    <text x="436" y="49" text-anchor="end" class="font lime" font-size="23" font-weight="950">5,000 crypto assets</text>
    <rect x="0" y="88" width="460" height="72" rx="22" fill="#0d1620" stroke="#28445b"/>
    <text x="24" y="117" class="font muted" font-size="11" font-weight="950" letter-spacing="1.25">STOCK DIRECTORY</text>
    <text x="436" y="137" text-anchor="end" class="font white" font-size="22" font-weight="950">5,000 public companies</text>
  </g>

  <g transform="translate(568 52)" filter="url(#shadow)">
    <rect x="0" y="42" width="${PANEL_W}" height="${PANEL_H}" rx="26" fill="#0b1117" stroke="#34551f" stroke-width="2"/>
    <g clip-path="url(#cryptoClip)" transform="translate(0 42)">
      <image href="${cryptoImage}" x="0" y="0" width="${PANEL_W}" height="${PANEL_H}" preserveAspectRatio="xMidYMid meet"/>
    </g>
    <rect x="18" y="0" width="154" height="34" rx="17" fill="#111b14" stroke="#84cc16" stroke-opacity="0.72"/>
    <circle cx="37" cy="17" r="5" fill="#84cc16"/>
    <text x="51" y="22" class="font white" font-size="13" font-weight="950" letter-spacing="0.8">CRYPTO RANKING</text>
  </g>

  <g transform="translate(568 328)" filter="url(#shadow)">
    <rect x="0" y="42" width="${PANEL_W}" height="${PANEL_H}" rx="26" fill="#0b1117" stroke="#28445b" stroke-width="2"/>
    <g clip-path="url(#stockClip)" transform="translate(0 42)">
      <image href="${stockImage}" x="0" y="0" width="${PANEL_W}" height="${PANEL_H}" preserveAspectRatio="xMidYMid meet"/>
    </g>
    <rect x="18" y="0" width="146" height="34" rx="17" fill="#0d1620" stroke="#60a5fa" stroke-opacity="0.72"/>
    <circle cx="37" cy="17" r="5" fill="#60a5fa"/>
    <text x="51" y="22" class="font white" font-size="13" font-weight="950" letter-spacing="0.8">STOCK RANKING</text>
  </g>

  <g transform="translate(72 630)">
    <text x="0" y="0" class="font soft" font-size="18" font-weight="850">Search. Compare. Stay informed.</text>
    <text x="1056" y="0" text-anchor="end" class="font" font-size="28" font-weight="950" fill="url(#lime)">wcore.xyz</text>
  </g>
  <rect x="0" y="671" width="1200" height="4" fill="url(#lime)" opacity="0.72"/>
  </svg>`;
}

(async () => {
  let browser;
  let lockFd;
  try {
    lockFd = acquireLock();

    browser = await chromium.launch({ headless: true });
    const cryptoCapture = await captureMain(browser, "/cmc/crypto", "Market Cap Crypto", ["Bitcoin", "BTC"]);
    const stockCapture = await captureMain(browser, "/cmc/stocks", "Market Cap Stock", [], true);

    const svg = buildSvg(pngDataUri(cryptoCapture), pngDataUri(stockCapture));

    const html = `<!doctype html><html><head><style>*{margin:0;padding:0;box-sizing:border-box}body{width:${W}px;height:${H}px;overflow:hidden;background:#050607}svg{display:block;width:${W}px;height:${H}px}</style></head><body>${svg}</body></html>`;
    const renderPage = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    let png;
    try {
      await renderPage.setContent(html, { waitUntil: "load" });
      await renderPage.evaluate(async () => Promise.all(Array.from(document.images, (image) => image.decode())));
      png = await renderPage.screenshot({ type: "png", omitBackground: false });
    } finally {
      await renderPage.close();
    }

    writeFileSync(TMP_SVG, svg);
    writeFileSync(TMP_PNG, png);
    renameSync(TMP_SVG, SVG_PATH);
    renameSync(TMP_PNG, PNG_PATH);
    console.log(`SVG written atomically: ${SVG_PATH} (${Buffer.byteLength(svg)} bytes, ${W}x${H})`);
    console.log(`PNG written atomically: ${PNG_PATH} (${png.length} bytes, ${W}x${H})`);
  } finally {
    try {
      if (browser) await browser.close();
    } finally {
      removeIfPresent(TMP_SVG);
      removeIfPresent(TMP_PNG);
      removeIfPresent(STALE_LOCK_PATH);
      if (lockFd !== undefined) releaseLock(lockFd);
    }
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
