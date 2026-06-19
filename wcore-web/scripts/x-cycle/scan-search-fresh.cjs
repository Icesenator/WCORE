// X cycle phase 2b: READ-ONLY search scan with fresh multichain queries
const path = require("path");
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (_e) {
  ({ chromium } = require(path.resolve(__dirname, "../../node_modules/.pnpm/playwright@1.59.1/node_modules/playwright")));
}

const CDP_URL = "http://127.0.0.1:9224";

const QUERIES = [
  "lost track of my crypto across chains",
  "how much crypto do i actually have",
  "airdropped tokens fake price portfolio",
  "wallet tracker without connecting",
  "checking wallet balance multiple chains annoying",
];

(async () => {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const pages = context.pages();
  const page = pages.find((p) => p.url().includes("x.com")) || (await context.newPage());

  for (const q of QUERIES) {
    const url = `https://x.com/search?q=${encodeURIComponent(q)}&src=typed_query&f=live`;
    console.log(`\n========== QUERY: ${q} ==========`);
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(4500);
      await page.evaluate(() => window.scrollBy(0, 1800));
      await page.waitForTimeout(2000);

      const posts = await page.evaluate(() => {
        const out = [];
        const articles = document.querySelectorAll('article[data-testid="tweet"]');
        for (const a of articles) {
          const linkEl = a.querySelector('a[href*="/status/"]');
          const href = linkEl ? linkEl.getAttribute("href") : null;
          const userEl = a.querySelector('[data-testid="User-Name"]');
          const user = userEl ? userEl.innerText.replace(/\n/g, " ") : "?";
          const timeEl = a.querySelector("time");
          const dt = timeEl ? timeEl.getAttribute("datetime") : "";
          const textEl = a.querySelector('[data-testid="tweetText"]');
          const text = textEl ? textEl.innerText : "";
          const stats = a.querySelector('[role="group"]');
          const statsText = stats ? stats.getAttribute("aria-label") || "" : "";
          out.push({ href, user, dt, text: text.substring(0, 320), stats: statsText });
          if (out.length >= 8) break;
        }
        return out;
      });

      posts.forEach((p, i) => {
        console.log(`\n[${i}] ${p.user}  (${p.dt})`);
        console.log(`    https://x.com${p.href}`);
        console.log(`    ${p.text.replace(/\n/g, " / ")}`);
        console.log(`    stats: ${p.stats}`);
      });
    } catch (e) {
      console.log("  query error:", e.message);
    }
  }

  await browser.close();
})();
