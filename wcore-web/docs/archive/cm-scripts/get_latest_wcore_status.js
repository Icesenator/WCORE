const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const context = browser.contexts()[0];
  const page = context.pages().find((p) => p.url().includes('x.com')) || await context.newPage();
  await page.goto('https://x.com/WCORExyz', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  const latest = await page.evaluate(() => {
    const article = document.querySelector('article[data-testid="tweet"]');
    if (!article) return null;
    const href = [...article.querySelectorAll('a')]
      .map((a) => a.getAttribute('href'))
      .find((href) => href && href.includes('/status/') && !href.includes('/analytics'));
    return {
      href,
      text: article.innerText,
    };
  });
  console.log(JSON.stringify(latest, null, 2));
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
