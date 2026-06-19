const http = require('http');
http.get('http://127.0.0.1:9222/json', res => {
  let body = '';
  res.on('data', c => body += c);
  res.on('end', () => {
    const xPage = JSON.parse(body).filter(t => t.type === 'page').find(p => p.url && p.url.includes('x.com'));
    if (!xPage) { process.exit(1); }
    
    const WebSocket = require('C:/Users/strau/wcore-web/node_modules/.pnpm/ws@8.18.3/node_modules/ws');
    const ws = new WebSocket(xPage.webSocketDebuggerUrl);
    let msgId = 0;
    const pending = {};
    ws.on('open', () => main());
    ws.on('message', data => {
      const msg = JSON.parse(data.toString());
      if (msg.id && pending[msg.id]) pending[msg.id](msg);
    });
    ws.on('close', () => process.exit(0));
    
    function send(m, p) { msgId++; ws.send(JSON.stringify({id:msgId,method:m,params:p||{}})); return new Promise(r => { pending[msgId] = r; }); }
    async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
    
    async function main() {
      await send('Page.enable');
      await send('Runtime.enable');
      await send('Page.navigate', { url: 'https://x.com/home' });
      await wait(5000);
      
      await send('Page.navigate', { url: 'https://x.com/search?q=%22gm%22%20%22crypto%22%20%22chain%22&src=typed_query&f=live' });
      await wait(6000);
      await send('Runtime.evaluate', { expression: 'window.scrollBy(0,600)', returnByValue: true });
      await wait(2000);
      
      const r = await send('Runtime.evaluate', { expression: `
        [...document.querySelectorAll('article[data-testid="tweet"]')].slice(0,6).map(a => {
          const text = a.innerText;
          const links = [...a.querySelectorAll('a')].map(l => l.getAttribute('href')).filter(Boolean);
          const tl = links.find(l => l && l.includes('/status/') && !l.includes('analytics'));
          const ul = links.find(l => l && l.startsWith('/') && !l.includes('/status/') && !l.includes('search') && !l.includes('analytics') && l.length < 30 && l.length > 2);
          return { text: text.substring(0, 300), user: ul, tweet: tl };
        }).filter(t => t.tweet && t.user)
      `, returnByValue: true, awaitPromise: true });
      
      const tweets = r.result?.result?.value || [];
      console.log('Found:', tweets.length);
      
      let posted = 0;
      for (const t of tweets) {
        if (posted >= 2) break;
        const lower = t.text.toLowerCase();
        if (lower.includes('arcterminal') || lower.includes('heyaura') || lower.includes('wallchain') || lower.includes('wcore')) continue;
        
        await send('Page.navigate', { url: `https://x.com${t.tweet}` });
        await wait(4000);
        const c = await send('Runtime.evaluate', { expression: `document.body.innerText.toLowerCase().includes('wcore')`, returnByValue: true, awaitPromise: true });
        if (c.result?.result?.value) continue;
        
        const tid = t.tweet.split('/').pop();
        const msg = lower.includes('gm') 
          ? "gm. Working on gm tracking for 8 chains at @wcorexyz with per-chain stats if you are into onchain gm."
          : "If you are in multichain, @wcorexyz aggregates 116+ chains in one dashboard. Real-time pricing, free. Built for cross-chain portfolio tracking.";
        
        const url = `https://x.com/intent/post?in_reply_to=${tid}&text=${encodeURIComponent(msg)}`;
        await send('Page.navigate', { url });
        await wait(8000);
        const bi = await send('Runtime.evaluate', { expression: `
          (() => { const b = document.querySelector('[data-testid="tweetButton"]');
            if (!b || b.disabled || !b.offsetParent) return null;
            const r = b.getBoundingClientRect(); return JSON.stringify({x: r.x+r.width/2, y: r.y+r.height/2});
          })()
        `, returnByValue: true, awaitPromise: true });
        const c2 = JSON.parse(bi.result?.result?.value || 'null');
        
        if (c2) {
          await send('Input.dispatchMouseEvent', { type:'mousePressed', x:c2.x, y:c2.y, button:'left', clickCount:1 });
          await wait(30);
          await send('Input.dispatchMouseEvent', { type:'mouseReleased', x:c2.x, y:c2.y, button:'left', clickCount:1 });
          await wait(4000);
          const pub = await send('Runtime.evaluate', { expression: 'document.body.innerText.includes("publié")', returnByValue: true, awaitPromise: true });
          if (pub.result?.result?.value) { posted++; console.log(`✅ ${t.user}`); }
        }
        await wait(3000);
      }
      
      console.log(`\nPosted ${posted} replies`);
      ws.close();
    }
  });
});
