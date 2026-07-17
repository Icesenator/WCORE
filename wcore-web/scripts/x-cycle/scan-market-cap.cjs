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

async function waitForSearchState(page, query) {
  try {
    const handle = await page.waitForFunction(
      () => {
        const visible = (element) => element && element.getClientRects().length > 0;
        const describe = (element, fallback) => element?.textContent?.trim().slice(0, 240) || fallback;
        const mask = document.querySelector('[data-testid="mask"]');
        const login = document.querySelector(
          'input[autocomplete="username"], [data-testid="loginButton"], form[action*="/login"]',
        );
        const challenge = document.querySelector(
          'iframe[src*="captcha"], [data-testid*="challenge"], input[name*="challenge"]',
        );
        const error = document.querySelector('[data-testid="error-detail"], [role="alert"]');
        const empty = document.querySelector(
          '[data-testid="empty_state_header_text"], [data-testid="empty_state_body_text"]',
        );

        if (visible(mask)) return { kind: "blocked", detail: "automation mask is visible" };
        if (visible(login)) return { kind: "blocked", detail: "login is required" };
        if (visible(challenge)) return { kind: "blocked", detail: "account challenge is visible" };
        if (visible(error)) return { kind: "error", detail: describe(error, "X returned an error state") };
        if (visible(empty)) return { kind: "empty", detail: describe(empty, "X returned an empty state") };

        const articleCount = document.querySelectorAll('article[data-testid="tweet"]').length;
        return articleCount > 0 ? { kind: "articles", articleCount } : null;
      },
      null,
      { timeout: 15000 },
    );
    const state = await handle.jsonValue();
    await handle.dispose();
    return state;
  } catch (error) {
    if (error?.name === "TimeoutError") {
      return { kind: "timeout", detail: `timed out waiting for articles or an explicit X state for "${query}"` };
    }
    throw error;
  }
}

(async () => {
  let browser = null;
  let page = null;
  const failures = [];

  try {
    browser = await chromium.connectOverCDP(CDP_URL);
    const context = browser.contexts()[0];
    if (!context) throw new Error("Chrome has no available context");
    page = await context.newPage();

    for (const query of QUERIES) {
      console.log(`\n========== QUERY: ${query} ==========`);
      await page.goto(`https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query&f=live`, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      const state = await waitForSearchState(page, query);
      if (state.kind === "blocked") {
        throw new Error(`Unsafe X state for "${query}": ${state.detail}. Scan aborted without interaction.`);
      }
      if (state.kind !== "articles") {
        const diagnostic = `${state.kind}: ${state.detail}`;
        console.error(`QUERY FAILED: ${query}: ${diagnostic}`);
        failures.push(`${query} (${diagnostic})`);
        continue;
      }

      const posts = await page.evaluate(() =>
        Array.from(document.querySelectorAll('article[data-testid="tweet"]'))
          .slice(0, 8)
          .map((article) => {
            const time = article.querySelector('[data-testid="User-Name"] time');
            const anchor = time?.closest("a");
            const href = anchor?.getAttribute("href") || "";
            let url = null;
            try {
              const parsed = new URL(href, location.origin);
              const match = parsed.pathname.match(/^\/([A-Za-z0-9_]+)\/status\/(\d+)\/?$/);
              if (match && parsed.origin === location.origin) {
                url = `${location.origin}/${match[1]}/status/${match[2]}`;
              }
            } catch (_e) {
              url = null;
            }

            const author = article.querySelector('[data-testid="User-Name"]')?.innerText.replace(/\n/g, " ") || "?";
            const timestamp = time?.getAttribute("datetime") || "";
            const text = article.querySelector('[data-testid="tweetText"]')?.innerText || "";
            const engagement = article.querySelector('[role="group"]')?.getAttribute("aria-label") || "";
            return { author, timestamp, url, text: text.slice(0, 600), engagement };
          }),
      );

      if (posts.length === 0) {
        const diagnostic = "no articles remained when results were read";
        console.error(`QUERY FAILED: ${query}: ${diagnostic}`);
        failures.push(`${query} (${diagnostic})`);
        continue;
      }

      posts.forEach((post, index) => {
        console.log(`[${index + 1}] ${post.author} | ${post.timestamp}`);
        console.log(`    ${post.url || "(no canonical status URL)"}`);
        console.log(`    ${post.text.replace(/\n/g, " / ")}`);
        if (post.engagement) console.log(`    engagement: ${post.engagement}`);
      });
    }

    if (failures.length > 0) throw new Error(`Scan incomplete: ${failures.join("; ")}`);
  } finally {
    try {
      if (page) await page.close();
    } finally {
      if (browser) await browser.close();
    }
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
