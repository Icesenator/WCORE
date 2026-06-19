// Re-type the post text into the already-open X composer (image stays attached).
const { resolve } = require("node:path");
const ROOT = resolve(__dirname, "../..");
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (_e) {
  ({ chromium } = require(resolve(ROOT, "node_modules/.pnpm/playwright@1.59.1/node_modules/playwright")));
}

const CDP_URL = "http://127.0.0.1:9224";
const TEXT = [
  "8 more GM chains went live on WCORE.",
  "",
  "Immutable. Morph. Mezo. Reya. Swell. Swan. Vana. Story.",
  "",
  "Personal contracts. Creator fees. Chain streaks.",
  "",
  "80 chains live now.",
  "",
  "Which chain do you want next?",
  "",
  "wcore.xyz",
];

(async () => {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const page = context.pages().find((p) => p.url().includes("x.com")) || (await context.newPage());

  // Make sure we are on the composer with the image attached.
  const hasImage = await page.evaluate(() =>
    !!document.querySelector('[data-testid="attachments"] img, [data-testid="media"] img'));
  console.log("Image still attached:", hasImage);

  // Focus the composer textarea and place caret at start, do NOT delete media.
  const focused = await page.evaluate(() => {
    const tas = document.querySelectorAll('[data-testid="tweetTextarea_0"]');
    if (tas.length === 0) return false;
    const el = tas[tas.length - 1];
    el.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
    return true;
  });
  if (!focused) { console.log("!! textarea not found"); await browser.close(); process.exit(1); }

  // Clear only text content (select-all within the textarea), then type.
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Delete");
  await page.waitForTimeout(300);

  for (let i = 0; i < TEXT.length; i++) {
    if (TEXT[i].length > 0) await page.keyboard.type(TEXT[i], { delay: 22 });
    if (i < TEXT.length - 1) await page.keyboard.press("Shift+Enter");
  }
  await page.waitForTimeout(600);

  const draft = await page.evaluate(() => {
    const tas = document.querySelectorAll('[data-testid="tweetTextarea_0"]');
    return tas.length ? tas[tas.length - 1].innerText : null;
  });
  const stillImage = await page.evaluate(() =>
    !!document.querySelector('[data-testid="attachments"] img, [data-testid="media"] img'));

  console.log("Draft length:", (draft || "").length);
  console.log("Draft preview:", (draft || "").replace(/\n/g, " / ").substring(0, 160));
  console.log("Image still attached after typing:", stillImage);
  console.log("\n=== TEXT + IMAGE READY, NOT SUBMITTED. Review and click Post. ===");
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
