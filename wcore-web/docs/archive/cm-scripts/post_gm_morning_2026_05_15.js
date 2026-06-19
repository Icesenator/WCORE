const { chromium } = require('playwright');
const path = require('path');

const text = `GM.

One wallet is simple.
130+ chains is where mornings get interesting.

Say GM, keep the streak alive, and track the mess from one place.

wcore.xyz`;

const imagePath = path.resolve(__dirname, '../../../apps/web/public/wcore-post-gm-morning.png');

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
  await page.waitForTimeout(5000);

  const postButton = page.locator('[data-testid="tweetButtonInline"], [data-testid="tweetButton"]').first();
  await postButton.waitFor({ state: 'visible', timeout: 20000 });
  await postButton.click();

  await page.waitForTimeout(7000);
  console.log('Posted GM morning tweet with image.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
