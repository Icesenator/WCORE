// cm-probe.cjs — lecture read-only de la surface X @WCORExyz via le navigateur CDP project-owned.
// Aucune publication. Sert au cycle CM frais (WC-01) : auth, notifications, mentions, with_replies, profil.
'use strict';
const path = require('path');
const pw = require(path.join('K:/ProjetIA/WCORE/node_modules/playwright'));

const URL = 'https://x.com/WCORExyz';
const ENDPOINT = 'http://127.0.0.1:9222';

async function getText(page, sel) {
  try { const el = await page.$(`[data-testid="${sel}"]`); if (!el) return null; return (await el.innerText()).trim(); }
  catch (_) { return null; }
}

(async () => {
  const browser = await pw.chromium.connectOverCDP(ENDPOINT);
  const ctx = browser.contexts()[0];
  const pages = ctx.pages();
  let page = pages.find(p => p.url().includes('x.com')) || pages[0];
  if (!page || !page.url().includes('x.com')) {
    page = await ctx.newPage();
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  }
  await page.waitForTimeout(3000);

  const url = page.url();
  // auth heuristic
  const authBtn = await page.$('[data-testid="SideNav_AccountSwitcher_Button"]');
  const editProfile = await page.$('a[href="/settings/profile"]');
  const auth = Boolean(authBtn || editProfile);

  // profile posts count (a[href$="/status"] not reliable) -> read from ProfileHeader posts stat
  let posts = null;
  try {
    const stat = await page.$('a[href$="/verified_followers"], a[href$="/followers"]');
    posts = null; // placeholder
  } catch (_) {}

  // notifications
  let notifCount = null;
  try {
    await page.goto('https://x.com/notifications', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3500);
    const articles = await page.$$('article[data-testid="cellInnerDiv"], article');
    notifCount = articles.length;
  } catch (_) {}

  // mentions
  let mentionCount = null;
  try {
    await page.goto('https://x.com/notifications/mentions', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3500);
    mentionCount = (await page.$$('article')).length;
  } catch (_) {}

  // with_replies
  let withReplies = null;
  try {
    await page.goto('https://x.com/WCORExyz/with_replies', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(4000);
    withReplies = (await page.$$('article')).length;
  } catch (_) {}

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);

  console.log(JSON.stringify({
    probe: 'cm-probe', ts: new Date().toISOString(),
    x_url: url, auth, notifCount, mentionCount, withReplies,
    publication: 'NONE', read_only: true,
  }, null, 1));

  await browser.close();
  return 0;
})().then(rc => process.exit(rc)).catch(e => { console.error('ERR', e.message); process.exit(1); });
