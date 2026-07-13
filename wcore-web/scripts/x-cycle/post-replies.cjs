// X cycle phase 3: post validated replies (no em-dash, sanitized)
// Set X_REPLIES_JSON to an array of { url, text, label } objects.
// Use Chrome CDP + keyboard.type per gotcha (avoid insertText).
// Per gotcha: cleartext before typing, read draft, click submit via DOM, reload to verify.
// SAFETY: refuse to send if text contains em-dash or other forbidden patterns.

const path = require("path");
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (_e) {
  ({ chromium } = require(path.resolve(__dirname, "../../node_modules/.pnpm/playwright@1.59.1/node_modules/playwright")));
}

const CDP_URL = "http://127.0.0.1:9224";

const FORBIDDEN = [
  { pattern: /\u2014/g, name: "em-dash" },
  { pattern: /\u2013/g, name: "en-dash" },
  { pattern: /\u00A0/g, name: "non-breaking space" },
  { pattern: /\.\.\./g, name: "ellipsis" },
];

function sanitize(text) {
  const issues = [];
  for (const f of FORBIDDEN) {
    if (f.pattern.test(text)) issues.push(f.name);
  }
  return issues;
}

function normalizeDraft(text) {
  return (text || "").replace(/\s+/g, " ").trim();
}

const REPLIES = process.env.X_REPLIES_JSON ? JSON.parse(process.env.X_REPLIES_JSON) : [];

async function appearsOnProfile(xPage, text) {
  await xPage.goto("https://x.com/WCORExyz/with_replies", { waitUntil: "domcontentloaded", timeout: 30000 });
  await xPage.waitForTimeout(5000);
  return await xPage.evaluate((expected) => {
    return Array.from(document.querySelectorAll('article[data-testid="tweet"]'))
      .slice(0, 12)
      .some((a) => (a.innerText || "").includes(expected));
  }, text);
}

async function closeOpenComposers(xPage) {
  for (let i = 0; i < 3; i++) {
    const hasTextarea = await xPage.evaluate(() => document.querySelectorAll('[data-testid="tweetTextarea_0"]').length > 0);
    if (!hasTextarea) return;
    await xPage.keyboard.press("Escape").catch(() => {});
    await xPage.waitForTimeout(500);
    await xPage.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
      const discard = buttons.find((b) => /discard|ignorer|supprimer/i.test(b.innerText || b.getAttribute("aria-label") || ""));
      if (discard) discard.click();
    }).catch(() => {});
    await xPage.waitForTimeout(500);
  }
}

async function postReply(xPage, target) {
  console.log(`\n=== ${target.label} ===`);
  console.log(`URL: ${target.url}`);

  // SAFETY: refuse if text contains forbidden patterns
  const issues = sanitize(target.text);
  if (issues.length > 0) {
    console.log(`!! REFUSÉ: texte contient patterns interdits: ${issues.join(", ")}`);
    return false;
  }
  console.log("Sanitize: clean");

  // Navigate to target
  await xPage.goto(target.url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await xPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

  // Ensure no stale composer from a previous failed run remains open.
  await closeOpenComposers(xPage);

  // Check for automation warning (real X warnings only, not tweet text)
  const warning = await xPage.evaluate(() => {
    // 1. Mask overlay (X blocks clicks)
    if (document.querySelector('[data-testid="mask"]')) return "mask element";
    // 2. Real X automation banners (specific text patterns, not just any "automated")
    const bannerSelectors = [
      '[data-testid="automation-warning"]',
      '[role="alert"]',
      '[data-testid="primaryColumn"] [data-testid="error"]',
    ];
    for (const sel of bannerSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        const t = (el.innerText || "").toLowerCase();
        if (/verify|captcha|robot|unusual activity|automated behavior|suspicious login/i.test(t)) {
          return "automation banner: " + t.substring(0, 100);
        }
      }
    }
    // 3. Page title or top-level banner (NOT article text)
    const titleEl = document.querySelector("title");
    if (titleEl && /suspended|locked|verify|robot/i.test(titleEl.innerText)) {
      return "page title: " + titleEl.innerText;
    }
    return null;
  });
  if (warning) {
    console.log(`!! AUTOMATION WARNING: ${warning} - STOPPING`);
    return false;
  }

  // Check WCORE hasn't already replied
  const alreadyReplied = await xPage.evaluate(() => {
    const replies = Array.from(document.querySelectorAll('article[data-testid="tweet"]')).slice(1);
    return replies.some((a) => /@WCORExyz/.test(a.innerText));
  });
  if (alreadyReplied) {
    console.log(`!! WCORE already replied to this thread - SKIPPING`);
    return false;
  }

  // Click the reply button on the main post (article[0])
  console.log("Clicking reply button...");
  const replyButton = await xPage.evaluateHandle(() => {
    const main = document.querySelector('article[data-testid="tweet"]');
    return main?.querySelector('[data-testid="reply"]');
  });
  if (!replyButton) {
    console.log("!! Reply button not found");
    return false;
  }
  await replyButton.click();
  await xPage.waitForTimeout(1500);

  // Focus the textarea in the foreground modal, not a background inline composer.
  console.log("Focusing textarea...");
  const focused = await xPage.evaluate(() => {
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"]')).filter((d) => d.offsetParent !== null);
    const root = dialogs[dialogs.length - 1] || document;
    const textareas = Array.from(root.querySelectorAll('[data-testid="tweetTextarea_0"]')).filter((el) => el.offsetParent !== null);
    if (textareas.length === 0) return false;
    const el = textareas[0];
    el.focus();
    // Clear any existing content
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
    return true;
  });
  if (!focused) {
    console.log("!! Textarea not found");
    return false;
  }

  // Type the text
  console.log("Typing text...");
  await xPage.keyboard.type(target.text, { delay: 25 });
  await xPage.waitForTimeout(500);

  // Read back the draft to verify
  const draft = await xPage.evaluate(() => {
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"]')).filter((d) => d.offsetParent !== null);
    const root = dialogs[dialogs.length - 1] || document;
    const textareas = Array.from(root.querySelectorAll('[data-testid="tweetTextarea_0"]')).filter((el) => el.offsetParent !== null);
    if (textareas.length === 0) return null;
    return textareas[0].innerText;
  });

  if (normalizeDraft(draft) !== normalizeDraft(target.text)) {
    console.log(`!! DRAFT MISMATCH:`);
    console.log(`  expected: ${normalizeDraft(target.text).substring(0, 80)}...`);
    console.log(`  actual  : ${normalizeDraft(draft).substring(0, 80)}...`);
    console.log("!! ABORT: no automatic retype");
    return false;
  }

  console.log(`Draft verified: ${draft.length} chars`);

  // Find the submit button and click via DOM
  console.log("Clicking submit...");
  const submitted = await xPage.evaluate(() => {
    // Look for the reply button (data-testid changes after click: tweetButton or tweetButtonInline)
    const candidates = [
      ...document.querySelectorAll('[data-testid="tweetButton"]'),
      ...document.querySelectorAll('[data-testid="tweetButtonInline"]'),
    ];
    for (const b of candidates) {
      if (b.offsetParent === null) continue; // hidden
      if (b.getAttribute("aria-disabled") === "true") continue;
      // Check text/label
      const label = (b.getAttribute("aria-label") || "").toLowerCase();
      const text = (b.innerText || "").toLowerCase();
      if (label.includes("reply") || text.includes("reply") || text.includes("répondre")) {
        b.click();
        return "label-match: " + (label || text);
      }
    }
    // Fallback: find any enabled button in the composer
    for (const b of candidates) {
      if (b.offsetParent === null) continue;
      if (b.getAttribute("aria-disabled") === "true") continue;
      b.click();
      return "fallback";
    }
    return null;
  });

  if (!submitted) {
    console.log("!! Submit button not found/clickable");
    return false;
  }
  console.log(`Submit clicked: ${submitted}`);
  await xPage.waitForTimeout(2500);

  // Reload thread to verify the reply was posted
  console.log("Reloading thread to verify...");
  await xPage.goto(target.url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await xPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

  const verification = await xPage.evaluate(() => {
    const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
    const wcoreReplies = articles.slice(1).filter((a) => /@WCORExyz/.test(a.innerText));
    return { articleCount: articles.length, wcoreReplyCount: wcoreReplies.length };
  });

  console.log(`Verification: ${verification.articleCount} articles, ${verification.wcoreReplyCount} WCORE reply`);

  if (verification.wcoreReplyCount === 0) {
    console.log("Thread did not show reply; checking with_replies...");
    const profileOk = await appearsOnProfile(xPage, target.text);
    if (!profileOk) {
      console.log("!! REPLY NOT FOUND AFTER POST - manual verification needed");
      return false;
    }
    console.log("✓ REPLY VERIFIED ON with_replies");
    return true;
  }

  console.log("✓ REPLY VERIFIED");
  return true;
}

(async () => {
  if (!Array.isArray(REPLIES) || REPLIES.length === 0) {
    console.log("No replies configured. Set X_REPLIES_JSON to post validated replies.");
    return;
  }

  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const pages = context.pages();
  const xPage = pages.find((p) => p.url().includes("x.com")) || await context.newPage();

  const results = [];
  for (const target of REPLIES) {
    const ok = await postReply(xPage, target);
    results.push({ url: target.url, ok });
    if (!ok) {
      console.log("Stopping after failure.");
      break;
    }
  }

  console.log("\n=== RESULTS ===");
  results.forEach((r) => console.log(`  ${r.ok ? "OK" : "FAIL"}  ${r.url}`));

  await browser.close();
})();
