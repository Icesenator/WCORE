// Clean prepare: fresh composer, text THEN image, same foreground composer.
const { resolve } = require("node:path");
const ROOT = resolve(__dirname, "../..");
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (_e) {
  ({ chromium } = require(resolve(ROOT, "node_modules/.pnpm/playwright@1.59.1/node_modules/playwright")));
}

const CDP_URL = "http://127.0.0.1:9224";
const IMAGE = resolve(ROOT, "apps/web/public/wcore-post-bitfinex.png");
const TEXT = [
  "Today's WCORE update.",
  "",
  "Bitfinex is now live.",
  "",
  "Link your own read-only key. Your spot wallet sits next to Binance, Bitpanda and your on-chain wallets. Same totals, same export, read only.",
  "",
  "Direct API, no relay. Provider-first pricing.",
  "",
  "Bybit, Coinbase and OKX are next.",
  "",
  "wcore.xyz",
];

// Safety: refuse forbidden typography (matches post-replies.cjs convention).
const FORBIDDEN = [
  { re: /\u2014/, name: "em-dash" },
  { re: /\u2013/, name: "en-dash" },
  { re: /\u00A0/, name: "non-breaking space" },
  { re: /\.\.\./, name: "ellipsis" },
];
{
  const joined = TEXT.join("\n");
  const issues = FORBIDDEN.filter((f) => f.re.test(joined)).map((f) => f.name);
  if (issues.length > 0) {
    console.error("!! REFUSED: forbidden patterns in text:", issues.join(", "));
    process.exit(1);
  }
}

(async () => {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const page = context.pages().find((p) => p.url().includes("x.com")) || (await context.newPage());

  // Start from a clean home, then open a single fresh composer.
  await page.goto("https://x.com/home", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2500);
  // Dismiss any leftover composer via Escape (discard if prompted).
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  const discard = await page.$('[data-testid="confirmationSheetConfirm"]');
  if (discard) { await discard.click(); await page.waitForTimeout(800); }

  await page.goto("https://x.com/compose/post", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(3500);

  // There must be exactly one composer textarea now. Use the FIRST one
  // (the foreground modal composer), not the last.
  const count = await page.evaluate(() =>
    document.querySelectorAll('[data-testid="tweetTextarea_0"]').length);
  console.log("composer textareas:", count);

  const focused = await page.evaluate(() => {
    const tas = document.querySelectorAll('[data-testid="tweetTextarea_0"]');
    if (tas.length === 0) return false;
    const el = tas[0];
    el.scrollIntoView();
    el.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
    return true;
  });
  if (!focused) { console.log("!! textarea not found"); await browser.close(); process.exit(1); }

  // Type the text FIRST (image attaches to the same composer afterward).
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Delete");
  await page.waitForTimeout(300);
  for (let i = 0; i < TEXT.length; i++) {
    if (TEXT[i].length > 0) await page.keyboard.type(TEXT[i], { delay: 22 });
    if (i < TEXT.length - 1) await page.keyboard.press("Shift+Enter");
  }
  await page.waitForTimeout(600);

  const draft = await page.evaluate(() => {
    const tas = document.querySelectorAll('[data-testid="tweetTextarea_0"]');
    return tas.length ? tas[0].innerText : null;
  });
  console.log("Draft length:", (draft || "").length);

  // Now attach the image to THIS composer.
  const fileInput = await page.$('input[data-testid="fileInput"]') || await page.$('input[type="file"]');
  if (!fileInput) { console.log("!! file input not found"); await browser.close(); process.exit(1); }
  await fileInput.setInputFiles(IMAGE);
  await page.waitForTimeout(4500);

  const finalState = await page.evaluate(() => {
    const tas = document.querySelectorAll('[data-testid="tweetTextarea_0"]');
    const text = tas.length ? tas[0].innerText : "";
    const img = !!document.querySelector('[data-testid="attachments"] img, [data-testid="media"] img');
    return { textLen: text.length, hasImage: img };
  });
  console.log("Final text length:", finalState.textLen, "| image attached:", finalState.hasImage);
  console.log("\n=== TEXT + IMAGE in the same composer. Review and click Post. ===");
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
