const http = require('http');
const WebSocket = require('C:/Users/strau/wcore-web/node_modules/.pnpm/ws@8.18.3/node_modules/ws');

http.get('http://127.0.0.1:9222/json', (res) => {
  let body = '';
  res.on('data', (c) => { body += c; });
  res.on('end', () => {
    const page = JSON.parse(body).filter((t) => t.type === 'page').find((t) => t.url && t.url.includes('x.com'));
    if (!page) { process.exit(1); }
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    let msgId = 0;
    const pending = {};
    const all = [];
    ws.on('open', () => main());
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      if (m.id && pending[m.id]) pending[m.id](m);
    });
    ws.on('close', () => process.exit(0));

    function send(m, p) { msgId++; ws.send(JSON.stringify({id:msgId,method:m,params:p||{}})); return new Promise((r) => { pending[msgId] = r; }); }
    async function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
    async function evalJs(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      return r.result && r.result.result && r.result.result.value;
    }

    async function search(q, label) {
      console.log(`\n=== ${label}: ${q} ===`);
      await send('Page.navigate', { url: `https://x.com/search?q=${encodeURIComponent(q)}&src=typed_query&f=live` });
      await wait(7000);
      for (let i = 0; i < 2; i++) { await evalJs('window.scrollBy(0, 800)'); await wait(1500); }
      const tweets = await evalJs(`
        [...document.querySelectorAll('article[data-testid="tweet"]')].slice(0, 8).map((a) => {
          const text = a.innerText;
          const links = [...a.querySelectorAll('a')].map((l) => l.getAttribute('href')).filter(Boolean);
          const s = links.find((h) => h.includes('/status/') && !h.includes('/analytics')) || '';
          const u = links.find((h) => h.startsWith('/') && !h.includes('/status/') && !h.includes('/search') && !h.includes('/analytics') && h.length > 1 && h.length < 32) || '';
          const t = a.querySelector('time')?.getAttribute('datetime') || '';
          return { text: text.slice(0, 700), user: u, status: s, time: t };
        })
      `);
      for (const tw of tweets || []) {
        const l = tw.text.toLowerCase();
        if (!tw.user || !tw.status) continue;
        if (l.includes('wcore')) continue;
        if (l.includes('giveaway') || l.includes('whitelist') || l.includes('redeem')) continue;
        if (l.includes('recovery') && l.includes('lost')) continue;
        if (l.includes('alpha') && l.includes('group')) continue;
        if (l.includes('buy now') || l.includes('100x')) continue;
        all.push({ ...tw, label });
      }
    }

    async function main() {
      await send('Page.enable');
      await send('Runtime.enable');
      const queries = [
        ['"forgot I had" crypto wallet', 'forgot assets'],
        ['"lost track of" crypto wallet', 'lost track wallet'],
        ['"where did I put" crypto', 'where did i put'],
        ['"wallet" "across" "chains" "tired"', 'wallet across chains tired'],
        ['"keep track" "crypto" "wallets" "chains"', 'keep track wallets'],
        ['"hard to keep" crypto wallet', 'hard to keep wallet'],
        ['"what happened to my" crypto wallet', 'what happened wallet'],
        ['"no idea" crypto wallet balance', 'no idea balance'],
        ['"checking" "multiple" "wallets" crypto', 'checking multiple wallets'],
        ['"mess" crypto wallet portfolio', 'mess portfolio'],
      ];
      for (const [q, label] of queries) { await search(q, label); await wait(1000); }
      const seen = new Set();
      const unique = all.filter((t) => { if (seen.has(t.status)) return false; seen.add(t.status); return true; });
      console.log('\n=== FRESH CANDIDATES ===');
      unique.slice(0, 20).forEach((t, i) => {
        const age = t.time ? Math.round((Date.now() - new Date(t.time).getTime()) / 60000) : '?';
        console.log(`\n[${i+1}] ${t.label} ${t.user} ${age}min`);
        console.log(`https://x.com${t.status}`);
        console.log(t.text.replace(/\n/g, ' ').slice(0, 300));
      });
      ws.close();
    }
  });
});
