// cm-verify-by-phrase.cjs — QA de publication : retrouve un post X par phrase exacte.
// CM-only, READ-ONLY. Ne publie, ne reply, ne suit jamais. Sort l'URL + l'unicite.
// Usage: node scripts/cm-verify-by-phrase.cjs --phrase "<texte exact>" [--handle WCORExyz] [--replies]
// Exit 0 = exactement 1 correspondance (PUBLICIE + UNIQUE) ; 1 = 0 ou >1 (ne JAMAIS republier sur doute).
'use strict';
const { chromium } = require('K:/ProjetIA/WCORE/node_modules/playwright');

function parseArgs(argv) {
  const a = { phrase: null, handle: 'WCORExyz', replies: false };
  for (const t of argv.slice(2)) {
    if (t.startsWith('--phrase=')) a.phrase = t.slice(9);
    else if (t === '--phrase') { const i = argv.indexOf(t); a.phrase = argv[i + 1]; }
    else if (t.startsWith('--handle=')) a.handle = t.slice(9);
    else if (t === '--replies') a.replies = true;
  }
  if (!a.phrase) { console.error('missing --phrase'); process.exit(2); }
  return a;
}
const args = parseArgs(process.argv);
const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
const KEY = norm(args.phrase);

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 30000 });
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();
  const url = `https://x.com/${args.handle}${args.replies ? '/with_replies' : ''}`;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(5000);
  } catch { /* continue: retry below via scroll */ }
  let matches = [];
  const collect = () => page.$$eval('article[data-testid="tweet"]', (arts, key) => {
    const out = [];
    for (const a of arts) {
      const t = (a.innerText || '').replace(/\s+/g, ' ').trim();
      if (t.includes(key)) { const l = a.querySelector('a[href*="/status/"]'); out.push({ url: l ? 'https://x.com' + l.getAttribute('href') : null, text: t.slice(0, 160) }); }
    }
    return out;
  }, KEY);
  for (let i = 0; i < 8; i++) {
    for (const m of await collect()) { if (!matches.some((x) => x.url === m.url)) matches.push(m); }
    if (matches.length > 1) break;
    await page.mouse.wheel(0, 4000); await page.waitForTimeout(1500);
  }

  // Fallback/robustesse: passe recherche exacte from:<handle> (le fil de profil peut etre cape).
  try {
    const q = `from:${args.handle} "${args.phrase}"`;
    await page.goto('https://x.com/search?q=' + encodeURIComponent(q) + '&src=typed_query&f=live', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(6000);
    for (const m of await collect()) { if (!matches.some((x) => x.url === m.url)) matches.push(m); }
  } catch { /* ignore search pass */ }
  const uniq = [...new Set(matches.map((m) => m.url))];
  const result = { phrase: KEY.slice(0, 60), handle: args.handle, count: uniq.length, unique: uniq.length === 1, urls: uniq };
  console.log(JSON.stringify(result));
  await browser.close().catch(() => {});
  process.exit(uniq.length === 1 ? 0 : 1);
})().catch((e) => { console.error('VERIFY_ERROR', e.message); process.exit(3); });
