// X cycle scan with targeted queries for CEX wallets post
const path = require("path");
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (_e) {
  ({ chromium } = require(path.resolve(__dirname, "../../node_modules/.pnpm/playwright@1.59.1/node_modules/playwright")));
}
const CDP_URL = "http://127.0.0.1:9224";
const QUERIES = [
  "track all my crypto wallets",
  "binance bitpanda same app",
  "consolidate crypto exchange balances",
  "no wallet connect to read",
  "scam token air dropped",
];
(async () => {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const pages = context.pages();
  const page = pages.find((p) => p.url().includes("x.com")) || (await context.newPage());
  for (const q of QUERIES) {
    console.log(`\n========== QUERY: ${q} ==========`);
    const url = `https://x.com/search?q=${encodeURIComponent(q)}&src=typed_query&f=live`;
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(5000);
      const results = await page.evaluate(() => {
        const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
        return articles.slice(0, 6).map((a, i) => {
          const t = a.querySelector('[data-testid="tweetText"]');
          const u = a.querySelector('[data-testid="User-Name"]');
          const time = a.querySelector("time");
          return {
            i,
            user: u ? u.innerText.split("\n")[0] : "?",
            time: time ? time.getAttribute("datetime") : "?",
            text: t ? t.innerText.substring(0, 300) : "(no text)",
          };
        });
      });
      results.forEach((r) => {
        console.log(`[${r.i}] ${r.user} · ${r.time}`);
        console.log("    " + r.text.replace(/\n/g, " / "));
      });
    } catch (e) {
      console.log("ERROR:", e.message);
    }
  }
  await browser.close();
})();
