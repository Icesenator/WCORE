const http = require('http');
http.get('http://127.0.0.1:9222/json', res => {
  let body = '';
  res.on('data', c => body += c);
  res.on('end', () => {
    const xPage = JSON.parse(body).find(t => t.type === 'page' && t.url && t.url.includes('x.com'));
    if (!xPage) { process.exit(1); }
    
    const WebSocket = require('C:/Users/strau/wcore-web/node_modules/.pnpm/ws@8.18.3/node_modules/ws');
    const ws = new WebSocket(xPage.webSocketDebuggerUrl);
    let msgId = 0;
    const pending = {};
    ws.on('open', () => main());
    ws.on('message', data => {
      const msg = JSON.parse(data.toString());
      if (msg.method === 'Page.javascriptDialogOpening') {
        ws.send(JSON.stringify({ id: 99999, method: 'Page.handleJavaScriptDialog', params: { accept: true } }));
      }
      if (msg.id && pending[msg.id]) pending[msg.id](msg);
    });
    ws.on('close', () => process.exit(0));
    
    function send(m, p) { msgId++; ws.send(JSON.stringify({id:msgId,method:m,params:p||{}})); return new Promise(r => { pending[msgId] = r; }); }
    async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
    
    async function searchAndPost(query, getMsg, label) {
      console.log(`\n=== ${label} ===`);
      await send('Page.navigate', { url: `https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query&f=live` });
      await wait(6000);
      await send('Runtime.evaluate', { expression: 'window.scrollBy(0,600)', returnByValue: true });
      await wait(2000);
      
      const r = await send('Runtime.evaluate', { expression: `
        [...document.querySelectorAll('article[data-testid="tweet"]')].slice(0,5).map(a => {
          const text = a.innerText;
          const links = [...a.querySelectorAll('a')].map(l => l.getAttribute('href')).filter(Boolean);
          const tl = links.find(l => l && l.includes('/status/') && !l.includes('analytics'));
          const ul = links.find(l => l && l.startsWith('/') && !l.includes('/status/') && l.length < 30 && l.length > 2);
          return { text, user: ul, tweet: tl };
        }).filter(t => t.tweet && t.user)
      `, returnByValue: true, awaitPromise: true });
      
      const tweets = r.result?.result?.value || [];
      let posted = 0;
      
      for (const t of tweets) {
        if (posted >= 1) break;
        const lower = t.text.toLowerCase();
        if (['sumex','arcterminal','heyaura','wallchain','wcore','giveaway','presale'].some(w => lower.includes(w))) continue;
        
        await send('Page.navigate', { url: `https://x.com${t.tweet}` });
        await wait(4000);
        const c = await send('Runtime.evaluate', { expression: 'document.body.innerText.toLowerCase().includes("wcore")', returnByValue: true, awaitPromise: true });
        if (c.result?.result?.value) continue;
        
        const msg = getMsg(t.text, t.user);
        if (!msg) continue;
        
        const tid = t.tweet.split('/').pop();
        const url = `https://x.com/intent/post?in_reply_to=${tid}&text=${encodeURIComponent(msg)}`;
        await send('Page.navigate', { url });
        await wait(8000);
        
        const bi = await send('Runtime.evaluate', { expression: `
          (() => { const b = document.querySelector('[data-testid="tweetButton"]');
            if (!b || b.disabled || !b.offsetParent) return null;
            b.click(); return 'ok';
          })()
        `, returnByValue: true, awaitPromise: true });
        
        if (bi.result?.result?.value === 'ok') {
          posted++;
          console.log(`  ✅ ${t.user}`);
          await wait(4000);
        }
      }
      return posted;
    }
    
    async function main() {
      await send('Page.enable');
      await send('Runtime.enable');
      await send('Page.navigate', { url: 'https://x.com/home' });
      await wait(5000);
      
      let total = 0;
      
      // 1. People frustrated with juggling wallets/apps
      total += await searchAndPost(
        '"juggling" crypto OR "too many" crypto apps -giveaway -presale',
        (text) => {
          const lower = text.toLowerCase();
          if (lower.includes('portfolio') || lower.includes('wallet') || lower.includes('chain')) {
            return "That is exactly why I built @wcorexyz. The pain of jumping between explorers for each chain got old fast. Now it pulls everything into one view, 116+ chains.";
          }
          return null;
        },
        'Juggling frustration'
      );
      await wait(3000);
      
      // 2. People comparing wallets or tracking solutions
      total += await searchAndPost(
        '"wallet" "track" "best" crypto OR "compare" crypto wallet',
        (text) => {
          const lower = text.toLowerCase();
          if (lower.includes('multichain') || lower.includes('multi') || lower.includes('all')) {
            return "For multichain tracking, @wcorexyz covers evm, solana and cosmos in one place. Real time pricing, no connection needed. Might save you some time.";
          }
          return null;
        },
        'Wallet comparison'
      );
      await wait(3000);
      
      // 3. People mentioning mulitple chains
      total += await searchAndPost(
        '"evm" "solana" tracking OR "solana" "cosmos" portfolio',
        () => "Running into the same thing. Currently building a tool that tracks evm, solana and cosmos in one dashboard. Real time pricing, free to use at @wcorexyz.",
        'Multichain users'
      );
      
      console.log(`\n✅ Total: ${total} replies`);
      ws.close();
    }
  });
});
