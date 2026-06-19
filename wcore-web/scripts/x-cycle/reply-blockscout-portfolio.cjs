const { resolve } = require("node:path");
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (_e) {
  ({ chromium } = require(resolve(__dirname, "../../node_modules/.pnpm/playwright@1.59.1/node_modules/playwright")));
}

const CDP_URL = "http://127.0.0.1:9224";
const TARGET_URL = "https://x.com/blockscout/status/2066420024093692294";
const TEXT = "Love this direction. WCORE covers Blockscout-supported chains, many other networks, and now CEX sources like Binance, Bitpanda, Bitfinex and Bybit. Same goal: one clean portfolio view before making any move.";

const FORBIDDEN = [
  { re: /\u2014/, name: "em-dash" },
  { re: /\u2013/, name: "en-dash" },
  { re: /\u00A0/, name: "non-breaking space" },
  { re: /\.\.\./, name: "ellipsis" },
];

function sanitize() {
  const issues = FORBIDDEN.filter((f) => f.re.test(TEXT)).map((f) => f.name);
  if (issues.length) {
    console.error("REFUSE: forbidden patterns:", issues.join(", "));
    process.exit(1);
  }
}

(async () => {
  sanitize();
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const page = context.pages().find((p) => p.url().includes("x.com")) || (await context.newPage());

  await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(4500);

  const pre = await page.evaluate(() => {
    const articles = [...document.querySelectorAll('article[data-testid="tweet"]')];
    const main = articles[0];
    return {
      user: main?.querySelector('[data-testid="User-Name"]')?.innerText || "",
      text: main?.querySelector('[data-testid="tweetText"]')?.innerText || "",
      anyWcore: articles.some((a) => (a.innerText || "").includes("WCORExyz") || (a.innerText || "").includes("@WCORExyz")),
    };
  });
  if (!pre.user.includes("@blockscout") || !pre.text.includes("Portfolio View")) {
    console.error("REFUSE: target tweet mismatch", pre);
    await browser.close();
    process.exit(1);
  }
  if (pre.anyWcore) {
    console.error("REFUSE: WCORE already appears in thread");
    await browser.close();
    process.exit(1);
  }

  const clicked = await page.evaluate(() => {
    const article = document.querySelector('article[data-testid="tweet"]');
    const button = article?.querySelector('[data-testid="reply"]');
    if (!button) return false;
    button.click();
    return true;
  });
  if (!clicked) {
    console.error("REFUSE: reply button not found");
    await browser.close();
    process.exit(1);
  }
  await page.waitForTimeout(1200);

  const focused = await page.evaluate(() => {
    const tas = document.querySelectorAll('[data-testid="tweetTextarea_0"]');
    if (!tas.length) return false;
    const el = tas[tas.length - 1];
    el.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
    return true;
  });
  if (!focused) {
    console.error("REFUSE: composer not found");
    await browser.close();
    process.exit(1);
  }
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Delete");
  await page.keyboard.type(TEXT, { delay: 22 });
  await page.waitForTimeout(700);

  const draft = await page.evaluate(() => {
    const tas = document.querySelectorAll('[data-testid="tweetTextarea_0"]');
    return tas.length ? tas[tas.length - 1].innerText : "";
  });
  if (draft !== TEXT) {
    console.error("REFUSE: draft mismatch");
    console.error("expected:", TEXT);
    console.error("actual  :", draft);
    await browser.close();
    process.exit(1);
  }
  console.log("Draft verified:", draft.length, "chars");

  const submitted = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('[data-testid="tweetButton"], [data-testid="tweetButtonInline"]')];
    const enabled = buttons.reverse().find((b) => b.getAttribute("aria-disabled") !== "true" && !b.disabled);
    if (!enabled) return false;
    enabled.click();
    return true;
  });
  if (!submitted) {
    console.error("REFUSE: submit button not enabled");
    await browser.close();
    process.exit(1);
  }
  await page.waitForTimeout(5000);

  await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(4500);
  const verified = await page.evaluate((text) => [...document.querySelectorAll('article[data-testid="tweet"]')].some((a) => (a.innerText || "").includes("WCORExyz") && (a.innerText || "").includes(text.slice(0, 80))), TEXT);
  console.log("Reply visible in thread:", verified);
  if (!verified) process.exitCode = 1;
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
