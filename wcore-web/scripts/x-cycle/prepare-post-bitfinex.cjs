// Draft-only: fresh composer, stable focus, full text + image, NO publish.
// Reads back via DraftJS blocks to verify the whole text landed.
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

const FORBIDDEN = [
  { re: /\u2014/, name: "em-dash" },
  { re: /\u2013/, name: "en-dash" },
  { re: /\u00A0/, name: "non-breaking space" },
  { re: /\.\.\./, name: "ellipsis" },
];

(async () => {
  const joined = TEXT.join("\n");
  const issues = FORBIDDEN.filter((f) => f.re.test(joined)).map((f) => f.name);
  if (issues.length > 0) {
    console.error("!! REFUSED: forbidden patterns:", issues.join(", "));
    process.exit(1);
  }

  const browser = await chromium.connectOverCDP(CDP_URL);
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => p.url().includes("x.com")) || (await ctx.newPage());

  // Fresh composer.
  await page.goto("https://x.com/home", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  const disc = await page.$('[data-testid="confirmationSheetConfirm"]');
  if (disc) { await disc.click(); await page.waitForTimeout(700); }

  await page.goto("https://x.com/compose/post", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(3500);

  // Physical click for stable focus, then clear.
  const ta = await page.$('[data-testid="tweetTextarea_0"]');
  if (!ta) { console.error("!! textarea not found"); await browser.close(); process.exit(1); }
  await ta.click();
  await page.waitForTimeout(400);
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Delete");
  await page.waitForTimeout(300);

  // Type line by line; each long line typed in one go (no mid-line splitting).
  for (let i = 0; i < TEXT.length; i++) {
    if (TEXT[i].length > 0) await page.keyboard.type(TEXT[i], { delay: 18 });
    if (i < TEXT.length - 1) await page.keyboard.press("Shift+Enter");
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(700);

  // Attach image to THIS composer.
  const fileInput = (await page.$('input[data-testid="fileInput"]')) || (await page.$('input[type="file"]'));
  if (!fileInput) { console.error("!! file input not found"); await browser.close(); process.exit(1); }
  await fileInput.setInputFiles(IMAGE);
  await page.waitForTimeout(4500);

  const st = await page.evaluate(() => {
    const t = document.querySelector('[data-testid="tweetTextarea_0"]');
    const blocks = t ? [...t.querySelectorAll('[data-block="true"]')].map((x) => x.innerText) : [];
    return {
      n: blocks.length,
      joined: blocks.join("\n"),
      media: !!document.querySelector('[data-testid="attachments"] img, [data-testid="media"] img'),
      post: !!document.querySelector('[data-testid="tweetButton"]:not([aria-disabled="true"]), [data-testid="tweetButtonInline"]:not([aria-disabled="true"])'),
    };
  });

  console.log("BLOCKS:", st.n, "| MEDIA:", st.media, "| POST_ENABLED:", st.post);
  console.log("--- DRAFT ---");
  console.log(st.joined);

  // Verify the last expected line made it in.
  const ok = st.media && st.joined.includes("wcore.xyz") && st.joined.includes("Bybit, Coinbase and OKX");
  console.log(ok ? "\n=== READY. Review and click Post. ===" : "\n!! INCOMPLETE DRAFT - do not post, re-run.");
  await browser.close();
  if (!ok) process.exit(1);
})().catch((e) => { console.error(e.message); process.exit(1); });
