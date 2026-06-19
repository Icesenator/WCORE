// READ-ONLY X search scan for current CEX/portfolio reply candidates.
const path = require("node:path");

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (_e) {
  ({ chromium } = require(path.resolve(__dirname, "../../node_modules/.pnpm/playwright@1.59.1/node_modules/playwright")));
}

const CDP_URL = "http://127.0.0.1:9224";
const QUERIES = [
  "scam token air dropped",
  "crypto wallet tracker without connecting",
  "consolidate crypto exchange balances",
  "too many wallets crypto portfolio",
  "how much crypto do i have across wallets",
];

(async () => {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const page = await context.newPage();

  for (const query of QUERIES) {
    console.log(`\n========== QUERY: ${query} ==========`);
    await page.goto(`https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query&f=live`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(4500);

    const posts = await page.evaluate(() =>
      Array.from(document.querySelectorAll('article[data-testid="tweet"]'))
        .slice(0, 8)
        .map((article) => {
          const href = article.querySelector('a[href*="/status/"]')?.getAttribute("href") || null;
          const user = article.querySelector('[data-testid="User-Name"]')?.innerText.replace(/\n/g, " ") || "?";
          const dt = article.querySelector("time")?.getAttribute("datetime") || "";
          const text = article.querySelector('[data-testid="tweetText"]')?.innerText || "";
          const stats = article.querySelector('[role="group"]')?.getAttribute("aria-label") || "";
          return { href: href ? `https://x.com${href}` : null, user, dt, text: text.slice(0, 360), stats };
        }),
    );

    posts.forEach((post, index) => {
      console.log(`[${index}] ${post.user} · ${post.dt}`);
      console.log(`    ${post.href}`);
      console.log(`    ${post.text.replace(/\n/g, " / ")}`);
      if (post.stats) console.log(`    stats: ${post.stats}`);
    });
  }

  await page.close();
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
