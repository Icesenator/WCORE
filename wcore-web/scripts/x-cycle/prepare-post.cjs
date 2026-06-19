// Prepare an X post draft (text + image) WITHOUT submitting.
// The user reviews and clicks Post manually.
const { resolve } = require("node:path");
const ROOT = resolve(__dirname, "../..");
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (_e) {
  ({ chromium } = require(resolve(ROOT, "node_modules/.pnpm/playwright@1.59.1/node_modules/playwright")));
}

const CDP_URL = "http://127.0.0.1:9224";
const IMAGE = resolve(ROOT, "apps/web/public/wcore-post-gm-8-l2s.png");

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
].join("\n");

const FORBIDDEN = [
  { pattern: /\u2014/g, name: "em-dash" },
  { pattern: /\u2013/g, name: "en-dash" },
  { pattern: /\u00A0/g, name: "non-breaking space" },
  { pattern: /\.\.\./g, name: "ellipsis" },
];

(async () => {
  const issues = FORBIDDEN.filter((f) => f.pattern.test(TEXT)).map((f) => f.name);
  if (issues.length > 0) {
    console.log(`REFUSE: texte contient patterns interdits: ${issues.join(", ")}`);
    process.exit(1);
  }
  console.log("Sanitize: clean");

  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const page = context.pages().find((p) => p.url().includes("x.com")) || (await context.newPage());

  await page.goto("https://x.com/compose/post", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(4000);

  // Focus the composer textarea
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
  if (!focused) {
    console.log("!! Composer textarea not found");
    await browser.close();
    process.exit(1);
  }

  // Clear then type (real keyboard events; Shift+Enter for line breaks to avoid posting)
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Delete");
  await page.waitForTimeout(300);
  const lines = TEXT.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].length > 0) await page.keyboard.type(lines[i], { delay: 20 });
    if (i < lines.length - 1) await page.keyboard.press("Shift+Enter");
  }
  await page.waitForTimeout(500);

  // Verify draft
  const draft = await page.evaluate(() => {
    const tas = document.querySelectorAll('[data-testid="tweetTextarea_0"]');
    return tas.length ? tas[tas.length - 1].innerText : null;
  });
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
  if (norm(draft) !== norm(TEXT)) {
    console.log("!! DRAFT MISMATCH");
    console.log("expected:", norm(TEXT).substring(0, 120));
    console.log("actual  :", norm(draft).substring(0, 120));
    await browser.close();
    process.exit(1);
  }
  console.log(`Draft verified: ${draft.length} chars`);

  // Remove any previously attached media (re-run case)
  for (let i = 0; i < 4; i++) {
    const removed = await page.evaluate(() => {
      const btn = document.querySelector('[data-testid="attachments"] [aria-label*="emove"], [data-testid="attachments"] [aria-label*="upprimer"]');
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (!removed) break;
    await page.waitForTimeout(800);
    console.log("Removed stale attachment");
  }

  // Attach the image via the hidden file input
  const fileInput = await page.$('input[data-testid="fileInput"]') || await page.$('input[type="file"]');
  if (!fileInput) {
    console.log("!! File input not found");
    await browser.close();
    process.exit(1);
  }
  await fileInput.setInputFiles(IMAGE);
  await page.waitForTimeout(4000);

  // Verify the image preview is attached
  const hasImage = await page.evaluate(() => {
    return !!document.querySelector('[data-testid="attachments"] img, [data-testid="media"] img');
  });
  console.log(`Image attached: ${hasImage}`);

  if (!hasImage) {
    console.log("!! Image preview not detected, check manually");
  }

  console.log("\n=== DRAFT READY, NOT SUBMITTED ===");
  console.log("Review the draft in Chrome and click Post manually.");
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
