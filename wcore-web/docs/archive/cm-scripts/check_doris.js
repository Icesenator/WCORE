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
    
    async function postReply(tweetId, message, label) {
      console.log(`\n=== ${label} ===`);
      const url = `https://x.com/intent/post?in_reply_to=${tweetId}&text=${encodeURIComponent(message)}`;
      await send('Page.navigate', { url });
      await wait(8000);
      await send('Runtime.evaluate', { expression: `
        for (const ed of document.querySelectorAll('[contenteditable="true"]')) {
          if (!ed.closest('[role="dialog"]')) ed.innerHTML = '';
        }
      `, returnByValue: true, awaitPromise: true });
      await wait(1000);
      
      const btnInfo = await send('Runtime.evaluate', { expression: `
        (() => { const b = document.querySelector('[data-testid="tweetButton"]'); if (!b) return 'no'; return JSON.stringify({t:b.innerText,d:b.disabled}); })()
      `, returnByValue: true, awaitPromise: true });
      const bi = JSON.parse(btnInfo.result?.result?.value || '{}');
      console.log(`  ${bi.t}`);
      
      if (!bi.d) {
        const coords = await send('Runtime.evaluate', { expression: `
          (() => { const b = document.querySelector('[data-testid="tweetButton"]'); const r = b?.getBoundingClientRect(); return r ? JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2}) : null; })()
        `, returnByValue: true, awaitPromise: true });
        const c = JSON.parse(coords.result?.result?.value || 'null');
        if (c) {
          await send('Input.dispatchMouseEvent', { type:'mousePressed', x:c.x, y:c.y, button:'left', clickCount:1 });
          await wait(30);
          await send('Input.dispatchMouseEvent', { type:'mouseReleased', x:c.x, y:c.y, button:'left', clickCount:1 });
          await wait(4000);
          const pub = await send('Runtime.evaluate', { expression: 'document.body.innerText.includes("publié")', returnByValue: true, awaitPromise: true });
          console.log(pub.result?.result?.value ? '  ✅' : '  ❌');
        }
      }
      await send('Page.navigate', { url: 'https://x.com/home' });
      await wait(3000);
    }
    
    async function main() {
      await send('Page.enable');
      await send('Runtime.enable');
      
      // Check @DorisCampb3155 tweet
      await send('Page.navigate', { url: 'https://x.com/DorisCampb3155' });
      await wait(6000);
      
      const tweets = await send('Runtime.evaluate', { expression: `
        JSON.stringify([...document.querySelectorAll('article[data-testid="tweet"]')].slice(0,3).map(a => {
          const text = a.innerText;
          const links = [...a.querySelectorAll('a')].map(l => l.getAttribute('href')).filter(Boolean);
          const tweetLink = links.find(l => l && l.includes('/status/') && !l.includes('analytics'));
          return { text: text.substring(0, 400), tweet: tweetLink };
        }))
      `, returnByValue: true, awaitPromise: true });
      
      const data = JSON.parse(tweets.result?.result?.value || '[]');
      console.log('DorisCampb3155 tweets:');
      data.forEach((t, i) => console.log(`  [${i+1}] ${t?.text?.substring(0,120)}`));
      
      const portfolioTweet = data.find(t => t.text?.toLowerCase().includes('portfolio'));
      if (portfolioTweet?.tweet) {
        const tid = portfolioTweet.tweet.split('/').pop();
        
        // Check not already replied
        await send('Page.navigate', { url: `https://x.com${portfolioTweet.tweet}` });
        await wait(5000);
        const r = await send('Runtime.evaluate', { expression: `document.body.innerText.toLowerCase().includes('wcore')`, returnByValue: true, awaitPromise: true });
        
        if (!r.result?.result?.value) {
          await postReply(tid,
            "At least one of those is in good shape then :) If you ever want to track it across evm, solana and cosmos in one place, I have been using @wcorexyz. 116+ chains, free, real-time pricing.",
            '@DorisCampb3155');
        } else { console.log('Already replied'); }
      }
      
      ws.close();
    }
  });
});
