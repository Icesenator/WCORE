const { chromium } = require('playwright');
const path = require('path');

const text = `Today's WCORE update.

GM fees are cleaner now.

Header, /gm and Profile share one source, so withdrawable tips stay consistent across refreshes.

Shipped:
• Zora GM support
• Polygon zkEVM detection fixed
• cleaner GM cards
• multi-contract withdraws per chain

wcore.xyz`;

const imagePath = path.resolve(process.cwd(), 'apps/web/public/wcore-post-daily-update-3.png');

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const context = browser.contexts()[0];
  const page = context.pages().find((p) => p.url().includes('x.com')) || await context.newPage();

  await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  const compose = page.locator('[data-testid="tweetTextarea_0"]').first();
  await compose.waitFor({ state: 'visible', timeout: 20000 });
  await compose.click();
  await page.keyboard.insertText(text);

  const fileInput = page.locator('input[data-testid="fileInput"], input[type="file"]').first();
  await fileInput.setInputFiles(imagePath);
  await page.waitForTimeout(6000);

  const postButton = page.locator('[data-testid="tweetButtonInline"], [data-testid="tweetButton"]').first();
  await postButton.waitFor({ state: 'visible', timeout: 20000 });
  await postButton.click();

  await page.waitForTimeout(8000);
  console.log('Posted daily WCORE update with image.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
