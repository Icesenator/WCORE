const http = require('http');
const WebSocket = require('C:/Users/strau/wcore-web/node_modules/.pnpm/ws@8.18.3/node_modules/ws');

http.get('http://127.0.0.1:9222/json', (res) => {
  let body = '';
  res.on('data', (chunk) => { body += chunk; });
  res.on('end', () => {
    const page = JSON.parse(body).filter((target) => target.type === 'page').find((target) => target.url && target.url.includes('x.com'));
    if (!page) {
      console.log('No X page found.');
      process.exit(1);
    }

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    let msgId = 0;
    const pending = {};
    const all = [];

    ws.on('open', () => main());
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.id && pending[msg.id]) pending[msg.id](msg);
    });
    ws.on('close', () => process.exit(0));

    function send(method, params) {
      msgId += 1;
      ws.send(JSON.stringify({ id: msgId, method, params: params || {} }));
      return new Promise((resolve) => { pending[msgId] = resolve; });
    }
    async function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
    async function evalJs(expression) {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      return result.result && result.result.result && result.result.result.value;
    }

    async function search(query, label) {
      console.log(`\n=== ${label}: ${query} ===`);
      await send('Page.navigate', { url: `https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query&f=live` });
      await wait(7000);
      for (let i = 0; i < 2; i += 1) {
        await evalJs('window.scrollBy(0, 900)');
        await wait(1500);
      }
      const tweets = await evalJs(`
        [...document.querySelectorAll('article[data-testid="tweet"]')].slice(0, 10).map((article) => {
          const text = article.innerText;
          const links = [...article.querySelectorAll('a')].map((link) => link.getAttribute('href')).filter(Boolean);
          const status = links.find((href) => href.includes('/status/') && !href.includes('/analytics')) || '';
          const user = links.find((href) => href.startsWith('/') && !href.includes('/status/') && !href.includes('/search') && !href.includes('/analytics') && href.length > 1 && href.length < 32) || '';
          const time = article.querySelector('time')?.getAttribute('datetime') || '';
          return { text: text.slice(0, 800), user, status, time };
        })
      `);

      for (const tweet of tweets || []) {
        const lower = tweet.text.toLowerCase();
        if (!tweet.user || !tweet.status) continue;
        if (lower.includes('wcore')) continue;
        if (lower.includes('giveaway') || lower.includes('whitelist') || lower.includes('redeem code')) continue;
        if (lower.includes('lost crypto') || lower.includes('recovery expert')) continue;
        if (lower.includes('dm me') || lower.includes('alpha group')) continue;
        all.push({ ...tweet, label });
      }
    }

    async function main() {
      await send('Page.enable');
      await send('Runtime.enable');
      const queries = [
        ['"too many chains" crypto', 'too many chains'],
        ['"too many bridges" crypto', 'too many bridges'],
        ['"wallets" "chains" "complicated" crypto', 'wallet chains complicated'],
        ['"fragmented" "crypto" "wallets"', 'fragmented wallets'],
        ['"too many wallets" crypto', 'too many wallets'],
        ['"multiple wallets" crypto portfolio', 'multiple wallets portfolio'],
        ['"track my portfolio" crypto', 'track my portfolio'],
        ['"how do you track" crypto', 'how track'],
        ['"DeBank" "portfolio"', 'debank portfolio'],
        ['"Zerion" "portfolio"', 'zerion portfolio'],
        ['"CoinGecko" "portfolio"', 'coingecko portfolio'],
        ['"EVM" "Solana" "wallet"', 'evm solana wallet'],
        ['"multichain" "wallet" "portfolio"', 'multichain wallet portfolio'],
        ['"wallet" "all chains" crypto', 'wallet all chains'],
      ];
      for (const [query, label] of queries) {
        await search(query, label);
        await wait(1200);
      }
      const seen = new Set();
      const unique = all.filter((target) => {
        if (seen.has(target.status)) return false;
        seen.add(target.status);
        return true;
      });
      console.log('\n=== CANDIDATES ===');
      unique.slice(0, 30).forEach((target, index) => {
        const age = target.time ? Math.round((Date.now() - new Date(target.time).getTime()) / 60000) : '?';
        console.log(`\n[${index + 1}] ${target.label} ${target.user} ${age}min`);
        console.log(`https://x.com${target.status}`);
        console.log(target.text.replace(/\n/g, ' ').slice(0, 320));
      });
      ws.close();
    }
  });
});
