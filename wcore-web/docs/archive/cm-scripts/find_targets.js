const WebSocket = require('C:/Users/strau/wcore-web/node_modules/.pnpm/ws@8.18.3/node_modules/ws');
const PAGE_WS = 'ws://127.0.0.1:9222/devtools/page/50B08A82DBF396A311BA25640AD8F878';
let msgId = 0;
const pending = {};
const allTargets = [];

const ws = new WebSocket(PAGE_WS);
ws.on('open', () => {
  console.log('Connected');
  send('Page.enable');
  send('Runtime.enable');
});

ws.on('message', data => {
  const msg = JSON.parse(data.toString());
  if (msg.id && pending[msg.id]) pending[msg.id](msg);
});
ws.on('error', e => console.error('Error:', e.message));
ws.on('close', () => process.exit(0));

function send(method, params) {
  msgId++;
  ws.send(JSON.stringify({ id: msgId, method, params: params || {} }));
  return new Promise(r => { pending[msgId] = r; });
}

async function evalJS(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  return r.result?.result?.value;
}

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function search(query, label) {
  console.log(`\n=== ${label}: "${query}" ===`);
  await send('Page.navigate', { url: `https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query&f=live` });
  await wait(6000);
  await evalJS(`window.scrollBy(0, 600)`);
  await wait(2000);

  const tweets = await evalJS(`[...document.querySelectorAll('article[data-testid="tweet"]')].slice(0,6).map(a => {
    const text = a.innerText;
    const links = [...a.querySelectorAll('a')].map(l => l.getAttribute('href')).filter(Boolean);
    const tweetLink = links.find(l => l && l.includes('/status/') && !l.includes('analytics'));
    const userLink = links.find(l => l && l.startsWith('/') && !l.includes('/status/') && !l.includes('search') && !l.includes('analytics') && l.length < 30 && l.length > 2);
    const time = a.querySelector('time')?.getAttribute('datetime') || '';
    return { text: text.substring(0, 400), user: userLink, tweet: tweetLink, time };
  })`);

  if (tweets && tweets.length) {
    tweets.forEach((t, i) => {
      const short = t.text.replace(/\n/g, ' ').substring(0, 120);
      const mins = t.time ? Math.round((Date.now() - new Date(t.time).getTime())/60000) + 'min' : '?';
      console.log(`  [${i+1}] ${t.user} (${mins}) ${short}`);
    });
    allTargets.push(...tweets.filter(t => {
      const l = t.text.toLowerCase();
      return t.user && t.tweet && !l.includes('wcore');
    }));
  } else {
    console.log('  No results');
  }
}

async function main() {
  const queries = [
    ['"portfolio" "track" crypto', 'Portfolio tracking live'],
    ['"wallet" "track" "all" crypto', 'Wallet tracking all'],
    ['"multichain" "portfolio" OR "multi-chain" "portfolio"', 'Multichain portfolio'],
    ['"manage" "wallet" "across" "chains"', 'Cross-chain wallet mgmt'],
    ['"any" "portfolio tracker" OR "portfolio tool" crypto', 'Portfolio tool search'],
    ['"tracking" "wallet" "crypto" -debank -zerion', 'Wallet tracking (no competitors)'],
    ['"consolidate" "crypto" OR "dashboard" "crypto" "portfolio"', 'Crypto dashboard needs'],
  ];
  
  for (const [q, label] of queries) {
    await search(q, label);
    await wait(2000);
  }
  
  // Deduplicate
  const seen = new Set();
  console.log('\n\n========================================');
  console.log('=== TOP NEW TARGETS ===');
  console.log('========================================');
  allTargets.forEach(t => {
    if (!seen.has(t.user)) {
      seen.add(t.user);
      const short = t.text.replace(/\n/g, ' ').substring(0, 180);
      console.log(`\n${t.user}`);
      console.log(`  ${short}`);
      if (t.tweet) console.log(`  https://x.com${t.tweet}`);
    }
  });
  
  ws.close();
}

setTimeout(() => main(), 1000);
