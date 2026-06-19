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
        (() => {
          const b = document.querySelector('[data-testid="tweetButton"]');
          if (!b) return JSON.stringify({err:'no btn'});
          return JSON.stringify({t: b.innerText, d: b.disabled});
        })()
      `, returnByValue: true, awaitPromise: true });
      const bi = JSON.parse(btnInfo.result?.result?.value || '{}');
      console.log(`  Button: ${bi.t}`);
      
      if (!bi.d) {
        const coords = await send('Runtime.evaluate', { expression: `
          (() => { const b = document.querySelector('[data-testid="tweetButton"]'); const r = b?.getBoundingClientRect(); return r ? JSON.stringify({x: r.x+r.width/2, y: r.y+r.height/2}) : null; })()
        `, returnByValue: true, awaitPromise: true });
        const c = JSON.parse(coords.result?.result?.value || 'null');
        if (c) {
          await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'left', clickCount: 1 });
          await wait(30);
          await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x, y: c.y, button: 'left', clickCount: 1 });
          await wait(4000);
          const pub = await send('Runtime.evaluate', { expression: `document.body.innerText.includes('publié')`, returnByValue: true, awaitPromise: true });
          console.log(`  ${pub.result?.result?.value ? '✅' : '❌'}`);
        }
      }
    }
    
    async function main() {
      await send('Page.enable');
      await send('Runtime.enable');
      await send('Page.navigate', { url: 'https://x.com/home' });
      await wait(5000);
      
      // 1. @weekhater already replied earlier, skip
      console.log('\n@weekhater already replied, skipping');
      
      // 2. Post original about GM season
      const post = "Good timing on the new OnChainGM season. If you are grinding across multiple chains, your badges and GM activity land in wallets spread across different networks. @wcorexyz tracks 116+ chains in one dashboard so you can actually see everything you have stacked in one place. Free to start.";
      
      // Navigate to compose/new post (not reply)
      // For a new post, use intent/tweet without in_reply_to
      await send('Page.navigate', { url: `https://x.com/intent/post?text=${encodeURIComponent(post)}` });
      await wait(8000);
      
      await send('Runtime.evaluate', { expression: `
        for (const ed of document.querySelectorAll('[contenteditable="true"]')) {
          if (!ed.closest('[role="dialog"]')) ed.innerHTML = '';
        }
      `, returnByValue: true, awaitPromise: true });
      await wait(1000);
      
      const btnInfo = await send('Runtime.evaluate', { expression: `
        (() => {
          const b = document.querySelector('[data-testid="tweetButton"]');
          if (!b) return JSON.stringify({err:'no btn'});
          return JSON.stringify({t: b.innerText, d: b.disabled});
        })()
      `, returnByValue: true, awaitPromise: true });
      const bi = JSON.parse(btnInfo.result?.result?.value || '{}');
      console.log(`\n=== GM Post ===\n  Button: ${bi.t}`);
      
      if (!bi.d) {
        await send('Runtime.evaluate', { expression: `
          (() => { const b = document.querySelector('[data-testid="tweetButton"]'); b?.click(); })()
        `, returnByValue: true, awaitPromise: true });
        await wait(4000);
        const pub = await send('Runtime.evaluate', { expression: `document.body.innerText.includes('publié')`, returnByValue: true, awaitPromise: true });
        console.log(`  ${pub.result?.result?.value ? '✅ GM posted' : '❌'}`);
      }
      
      console.log('\n✅ Done');
      ws.close();
    }
  });
});
