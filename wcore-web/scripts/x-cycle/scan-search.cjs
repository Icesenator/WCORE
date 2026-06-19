// X cycle phase 2: READ-ONLY search scan for authentic discussion targets
const path = require("path");
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (_e) {
  ({ chromium } = require(path.resolve(__dirname, "../../node_modules/.pnpm/playwright@1.59.1/node_modules/playwright")));
}

const CDP_URL = "http://127.0.0.1:9224";

const QUERIES = process.env.X_QUERIES
  ? process.env.X_QUERIES.split("|").map((q) => q.trim()).filter(Boolean)
  : [
      "recommend portfolio tracker wallet",
      "how do you track your bags",
    ];

(async () => {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const pages = context.pages();
  const page = pages.find((p) => p.url().includes("x.com")) || (await context.newPage());

  for (const q of QUERIES) {
    const url = `https://x.com/search?q=${encodeURIComponent(q)}&src=typed_query&f=live`;
    console.log(`\n========== QUERY: ${q} ==========`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(5000);
    // scroll a bit to load more
    await page.evaluate(() => window.scrollBy(0, 2000));
    await page.waitForTimeout(2500);

    const posts = await page.evaluate(() => {
      const out = [];
      const articles = document.querySelectorAll('article[data-testid="tweet"]');
      for (const a of articles) {
        const linkEl = a.querySelector('a[href*="/status/"]');
        const href = linkEl ? linkEl.getAttribute("href") : null;
        const userEl = a.querySelector('[data-testid="User-Name"]');
        const user = userEl ? userEl.innerText.replace(/\n/g, " ") : "?";
        const textEl = a.querySelector('[data-testid="tweetText"]');
        const text = textEl ? textEl.innerText : "";
        // engagement
        const stats = a.querySelector('[role="group"]');
        const statsText = stats ? stats.getAttribute("aria-label") || "" : "";
        out.push({ href, user, text: text.substring(0, 350), stats: statsText });
        if (out.length >= 10) break;
      }
      return out;
    });

    posts.forEach((p, i) => {
      console.log(`\n[${i}] ${p.user}`);
      console.log(`    https://x.com${p.href}`);
      console.log(`    ${p.text.replace(/\n/g, " / ")}`);
      console.log(`    stats: ${p.stats}`);
    });
  }

  await browser.close();
})();
