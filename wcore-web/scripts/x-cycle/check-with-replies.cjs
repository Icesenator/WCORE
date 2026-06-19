// READ-ONLY: check latest replies on the WCORE profile
const path = require("path");
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (_e) {
  ({ chromium } = require(path.resolve(__dirname, "../../node_modules/.pnpm/playwright@1.59.1/node_modules/playwright")));
}

(async () => {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9224");
  const context = browser.contexts()[0];
  const page = context.pages().find((p) => p.url().includes("x.com")) || (await context.newPage());
  await page.goto("https://x.com/WCORExyz/with_replies", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(5000);
  const rows = await page.evaluate(() => {
    const arts = Array.from(document.querySelectorAll('article[data-testid="tweet"]')).slice(0, 6);
    return arts.map((a) => {
      const link = a.querySelector('a[href*="/status/"]');
      const t = a.querySelector('[data-testid="tweetText"]');
      return { href: link ? link.getAttribute("href") : null, text: t ? t.innerText.substring(0, 120) : "" };
    });
  });
  rows.forEach((r) => console.log(r.href, "::", r.text.replace(/\n/g, " ")));
  await browser.close();
})();
