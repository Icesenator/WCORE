// READ-ONLY X live search scan for market-cap research conversations.
const { existsSync, readdirSync } = require("node:fs");
const path = require("node:path");

function loadChromium() {
  try {
    return require("playwright").chromium;
  } catch (_e) {
    const pnpmRoot = path.resolve(__dirname, "../../node_modules/.pnpm");
    const packageDir = readdirSync(pnpmRoot).find((entry) => {
      const candidate = path.join(pnpmRoot, entry, "node_modules/playwright");
      return entry.startsWith("playwright@") && existsSync(candidate);
    });
    if (!packageDir) throw _e;
    return require(path.join(pnpmRoot, packageDir, "node_modules/playwright")).chromium;
  }
}

const chromium = loadChromium();
const CDP_URL = "http://127.0.0.1:9224";
const QUERIES = [
  "compare crypto market cap stocks",
  "crypto market cap ranking tools",
  "track crypto and stocks one dashboard",
  "too many crypto research tools",
  "how to compare crypto projects by market cap",
];

(async () => {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  if (!context) throw new Error("Chrome has no available context");

  const existingPage = context.pages().find((candidate) => candidate.url().includes("x.com"));
  const page = existingPage || (await context.newPage());
  const createdPage = !existingPage;

  for (const query of QUERIES) {
    console.log(`\n========== QUERY: ${query} ==========`);
    await page.goto(`https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query&f=live`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(5000);

    const posts = await page.evaluate(() =>
      Array.from(document.querySelectorAll('article[data-testid="tweet"]'))
        .slice(0, 8)
        .map((article) => {
          const statusPath = Array.from(article.querySelectorAll('a[href*="/status/"]'))
            .map((anchor) => anchor.getAttribute("href") || "")
            .find((href) => /^\/[A-Za-z0-9_]+\/status\/\d+/.test(href));
          const match = statusPath?.match(/^\/([A-Za-z0-9_]+)\/status\/(\d+)/);
          const author = article.querySelector('[data-testid="User-Name"]')?.innerText.replace(/\n/g, " ") || "?";
          const timestamp = article.querySelector("time")?.getAttribute("datetime") || "";
          const text = article.querySelector('[data-testid="tweetText"]')?.innerText || "";
          const engagement = article.querySelector('[role="group"]')?.getAttribute("aria-label") || "";
          return {
            author,
            timestamp,
            url: match ? `https://x.com/${match[1]}/status/${match[2]}` : null,
            text: text.slice(0, 600),
            engagement,
          };
        }),
    );

    posts.forEach((post, index) => {
      console.log(`[${index + 1}] ${post.author} | ${post.timestamp}`);
      console.log(`    ${post.url || "(no canonical status URL)"}`);
      console.log(`    ${post.text.replace(/\n/g, " / ")}`);
      if (post.engagement) console.log(`    engagement: ${post.engagement}`);
    });
  }

  if (createdPage) await page.close();
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
