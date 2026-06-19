// X cycle phase 1: READ-ONLY scan of notifications (no clicks, no likes, no posts)
const path = require("path");
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (_e) {
  ({ chromium } = require(path.resolve(__dirname, "../../node_modules/.pnpm/playwright@1.59.1/node_modules/playwright")));
}

const CDP_URL = "http://127.0.0.1:9224";

(async () => {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const pages = context.pages();
  const page = pages.find((p) => p.url().includes("x.com")) || (await context.newPage());

  await page.goto("https://x.com/notifications", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(5000);

  const data = await page.evaluate(() => {
    const out = { loggedIn: !document.body.innerText.includes("Sign in"), items: [] };
    const cells = document.querySelectorAll('[data-testid="cellInnerDiv"]');
    for (const c of cells) {
      const t = c.innerText.trim();
      if (t) out.items.push(t.substring(0, 300));
      if (out.items.length >= 25) break;
    }
    return out;
  });

  console.log("loggedIn:", data.loggedIn);
  console.log("--- NOTIFICATIONS ---");
  data.items.forEach((t, i) => console.log(`[${i}] ${t.replace(/\n/g, " | ")}\n`));

  await browser.close();
})();
