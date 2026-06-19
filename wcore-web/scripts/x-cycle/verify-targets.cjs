// X cycle phase 2b: READ-ONLY verification of candidate threads
// - full text of the main post (detect hidden shill)
// - check whether @WCORExyz already replied in the thread
const path = require("path");
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (_e) {
  ({ chromium } = require(path.resolve(__dirname, "../../node_modules/.pnpm/playwright@1.59.1/node_modules/playwright")));
}

const CDP_URL = "http://127.0.0.1:9224";

const TARGETS = process.env.X_TARGETS
  ? process.env.X_TARGETS.split("|").map((url) => url.trim()).filter(Boolean)
  : [
      "https://x.com/AndyCrews1000/status/1932287031633162323",
      "https://x.com/DexBlocker/status/2017613977837334559",
      "https://x.com/Noir_Pulse_/status/2057558401706868945",
      "https://x.com/RahulKarth29923/status/2066019627050877411",
      "https://x.com/strato_money/status/2066943003512512897",
    ];

(async () => {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const pages = context.pages();
  const page = pages.find((p) => p.url().includes("x.com")) || (await context.newPage());

  for (const url of TARGETS) {
    console.log(`\n========== ${url} ==========`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(5000);
    await page.evaluate(() => window.scrollBy(0, 1500));
    await page.waitForTimeout(2000);

    const info = await page.evaluate(() => {
      const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
      if (articles.length === 0) return { error: "no articles" };
      const main = articles[0];
      const textEl = main.querySelector('[data-testid="tweetText"]');
      const mainText = textEl ? textEl.innerText : "(no text)";
      const wcoreReplies = articles.slice(1).filter((a) => /WCORExyz/i.test(a.innerText)).map((a) => a.innerText.substring(0, 150));
      const replyAuthors = articles.slice(1, 8).map((a) => {
        const u = a.querySelector('[data-testid="User-Name"]');
        return u ? u.innerText.split("\n")[0] : "?";
      });
      return { mainText: mainText.substring(0, 1200), wcoreReplies, replyAuthors, articleCount: articles.length };
    });

    if (info.error) { console.log("ERROR:", info.error); continue; }
    console.log("--- MAIN TEXT ---");
    console.log(info.mainText.replace(/\n/g, " / "));
    console.log(`--- ${info.articleCount} articles, WCORE replies: ${info.wcoreReplies.length} ---`);
    info.wcoreReplies.forEach((r) => console.log("  WCORE: " + r.replace(/\n/g, " | ")));
  }

  await browser.close();
})();
