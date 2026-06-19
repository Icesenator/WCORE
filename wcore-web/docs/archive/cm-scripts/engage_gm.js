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
      if (msg.method === 'Page.javascriptDialogOpening') {
        ws.send(JSON.stringify({ id: 99999, method: 'Page.handleJavaScriptDialog', params: { accept: true } }));
      }
      if (msg.id && pending[msg.id]) pending[msg.id](msg);
    });
    ws.on('close', () => process.exit(0));
    
    function send(m, p) { msgId++; ws.send(JSON.stringify({id:msgId,method:m,params:p||{}})); return new Promise(r => { pending[msgId] = r; }); }
    async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
    
    async function main() {
      await send('Page.enable');
      await send('Runtime.enable');
      
      // 1. Go to the new GM post and like it
      await send('Page.navigate', { url: 'https://x.com/WCORExyz/status/2053914258849587271' });
      await wait(6000);
      
      // Like the post
      await send('Runtime.evaluate', { expression: `
        const likeBtn = document.querySelector('[data-testid="like"]');
        if (likeBtn) likeBtn.click();
      `, returnByValue: true, awaitPromise: true });
      await wait(2000);
      console.log('✅ Post liked');
      
      // 2. Find OnChainGM's post about the new season to reply
      await send('Page.navigate', { url: 'https://x.com/OnChainGm' });
      await wait(5000);
      
      const tweets = await send('Runtime.evaluate', { expression: `
        JSON.stringify([...document.querySelectorAll('article[data-testid="tweet"]')].slice(0,3).map(a => {
          const text = a.innerText;
          const links = [...a.querySelectorAll('a')].map(l => l.getAttribute('href')).filter(Boolean);
          const tl = links.find(l => l && l.includes('/status/') && !l.includes('analytics'));
          return { text: text.substring(0, 300), tweet: tl };
        }).filter(t => t.tweet))
      `, returnByValue: true, awaitPromise: true });
      
      const data = JSON.parse(tweets.result?.result?.value || '[]');
      console.log('\nOnChainGM posts:');
      data.forEach((t, i) => console.log(`  [${i+1}] ${t.tweet?.substring(0,60)} ${t.text.substring(0,80)}`));
      
      // Find a post about the new season to reply to
      const seasonPost = data.find(t => t.text.toLowerCase().includes('season') || t.text.toLowerCase().includes('leaderboard'));
      if (seasonPost?.tweet) {
        // Check we haven't already replied
        await send('Page.navigate', { url: `https://x.com${seasonPost.tweet}` });
        await wait(5000);
        const hasW = await send('Runtime.evaluate', { expression: `document.body.innerText.toLowerCase().includes('wcore')`, returnByValue: true, awaitPromise: true });
        
        if (!hasW.result?.result?.value) {
          const tid = seasonPost.tweet.split('/').pop();
          const msg = "New season timing is perfect. Just deployed GM tracking for 8 chains at @wcorexyz with per-chain stats. Good luck this season!";
          const url = `https://x.com/intent/post?in_reply_to=${tid}&text=${encodeURIComponent(msg)}`;
          await send('Page.navigate', { url });
          await wait(8000);
          
          const btnInfo = await send('Runtime.evaluate', { expression: `
            (() => { const b = document.querySelector('[data-testid="tweetButton"]');
              if (!b || b.disabled || !b.offsetParent) return null;
              const r = b.getBoundingClientRect(); return JSON.stringify({x: r.x+r.width/2, y: r.y+r.height/2});
            })()
          `, returnByValue: true, awaitPromise: true });
          const c = JSON.parse(btnInfo.result?.result?.value || 'null');
          
          if (c) {
            await send('Input.dispatchMouseEvent', { type:'mousePressed', x:c.x, y:c.y, button:'left', clickCount:1 });
            await wait(30);
            await send('Input.dispatchMouseEvent', { type:'mouseReleased', x:c.x, y:c.y, button:'left', clickCount:1 });
            await wait(4000);
            const pub = await send('Runtime.evaluate', { expression: 'document.body.innerText.includes("publié")', returnByValue: true, awaitPromise: true });
            console.log(pub.result?.result?.value ? '✅ Replied to OnChainGM' : '❌ Failed');
          }
        } else { console.log('Already replied to OnChainGM'); }
      }
      
      await send('Page.navigate', { url: 'https://x.com/home' });
      ws.close();
    }
  });
});
