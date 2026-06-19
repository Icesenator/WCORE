const { resolve } = require("node:path");
const ROOT = resolve(__dirname, "../..");
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (_e) {
  ({ chromium } = require(resolve(ROOT, "node_modules/.pnpm/playwright@1.59.1/node_modules/playwright")));
}

(async () => {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9224");
  const context = browser.contexts()[0];
  const page = context.pages().find((p) => p.url().includes("x.com")) || (await context.newPage());

  const info = await page.evaluate(() => {
    const tas = Array.from(document.querySelectorAll('[data-testid="tweetTextarea_0"]'));
    return tas.map((el, i) => {
      const r = el.getBoundingClientRect();
      const visible = el.offsetParent !== null && r.width > 0 && r.height > 0;
      // climb up to find a modal/dialog ancestor
      let modal = false;
      let n = el;
      for (let d = 0; d < 12 && n; d++) {
        if (n.getAttribute && (n.getAttribute("role") === "dialog" || n.getAttribute("aria-modal") === "true")) { modal = true; break; }
        n = n.parentElement;
      }
      return { i, visible, modal, text: (el.innerText || "").substring(0, 60), rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) } };
    });
  });
  info.forEach((c) => console.log(JSON.stringify(c)));
  await browser.close();
})();
