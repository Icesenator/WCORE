const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const context = browser.contexts()[0];
  const page = context.pages().find((p) => p.url().includes('x.com')) || await context.newPage();
  await page.goto('https://x.com/WCORExyz', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  const tweets = await page.evaluate(() =>
    [...document.querySelectorAll('article[data-testid="tweet"]')]
      .slice(0, 3)
      .map((article) => article.innerText.slice(0, 500)),
  );
  console.log(JSON.stringify(tweets, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
