const { resolve } = require("node:path");
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (_e) {
  ({ chromium } = require(resolve(__dirname, "../../node_modules/.pnpm/playwright@1.59.1/node_modules/playwright")));
}

(async () => {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9224");
  const context = browser.contexts()[0];
  const page = context.pages().find((p) => p.url().includes("x.com")) || (await context.newPage());
  await page.goto("https://x.com/blockscout/status/2066420024093692294", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(4500);
  const data = await page.evaluate(() => {
    const articles = [...document.querySelectorAll('article[data-testid="tweet"]')].slice(0, 10).map((a, i) => ({
      i,
      user: a.querySelector('[data-testid="User-Name"]')?.innerText || "",
      text: a.querySelector('[data-testid="tweetText"]')?.innerText || "",
      hasWcore: (a.innerText || "").includes("WCORExyz") || (a.innerText || "").includes("@WCORExyz"),
    }));
    return { url: location.href, articles };
  });
  console.log(JSON.stringify(data, null, 2));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
