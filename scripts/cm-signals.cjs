// cm-signals.cjs — lecture read-only des notifications/mentions récentes (texte+auteur+link).
'use strict';
const path = require('path');
const pw = require(path.join('K:/ProjetIA/WCORE/node_modules/playwright'));
const ENDPOINT = 'http://127.0.0.1:9222';

async function scrape(page, url, limit) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);
  const arts = await page.$$('article');
  const out = [];
  for (let i = 0; i < Math.min(arts.length, limit); i++) {
    const a = arts[i];
    const text = (await a.innerText().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 260);
    let link = null;
    try { const l = await a.$('a[href*="/status/"]'); if (l) link = await l.getAttribute('href'); } catch (_) {}
    let user = null;
    try { const u = await a.$('a[href^="/"][role="link"]'); if (u) user = (await u.innerText()).trim().slice(0, 40); } catch (_) {}
    const replyCtx = text.includes('En réponse à') || text.includes('Replying to') || text.includes('réponse à');
    out.push({ link, replyCtx, text });
  }
  return out;
}

(async () => {
  const browser = await pw.chromium.connectOverCDP(ENDPOINT);
  const ctx = browser.contexts()[0];
  const pages = ctx.pages();
  let page = pages.find(p => p.url().includes('x.com')) || pages[0];
  if (!page) page = await ctx.newPage();

  const mentions = await scrape(page, 'https://x.com/notifications/mentions', 6);
  const notifs = await scrape(page, 'https://x.com/notifications', 6);
  const replies = await scrape(page, 'https://x.com/WCORExyz/with_replies', 6);

  console.log(JSON.stringify({ ts: new Date().toISOString(), mentions, notifs, replies, read_only: true, publication: 'NONE' }, null, 1));
  await browser.close();
})().then(() => process.exit(0)).catch(e => { console.error('ERR', e.message); process.exit(1); });
