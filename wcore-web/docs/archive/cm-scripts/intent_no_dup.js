const http = require('http');
http.get('http://127.0.0.1:9222/json', res => {
  let body = '';
  res.on('data', c => body += c);
  res.on('end', () => {
    const xPage = JSON.parse(body).filter(t => t.type === 'page').find(p => p.url && p.url.includes('x.com'));
    if (!xPage) { console.log('No X page'); process.exit(1); }
    
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
    ws.on('error', e => console.error('Error:', e.message));
    ws.on('close', () => process.exit(0));
    
    function send(m, p) { msgId++; ws.send(JSON.stringify({id:msgId,method:m,params:p||{}})); return new Promise(r => { pending[msgId] = r; }); }
    async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
    
    async function checkAndPost(tweetUrl, tweetId, message, label) {
      console.log(`\n=== ${label} ===`);
      
      // First check if already replied
      await send('Page.navigate', { url: tweetUrl });
      await wait(6000);
      await send('Runtime.evaluate', { expression: 'window.scrollBy(0,600)', returnByValue: true });
      await wait(2000);
      
      const hasW = await send('Runtime.evaluate', { expression: `document.body.innerText.toLowerCase().includes('wcore')`, returnByValue: true, awaitPromise: true });
      
      if (hasW.result?.result?.value) {
        console.log('  Already replied, skipping');
        return;
      }
      
      // Post via intent URL
      const url = `https://x.com/intent/post?in_reply_to=${tweetId}&text=${encodeURIComponent(message)}`;
      await send('Page.navigate', { url });
      await wait(8000);
      
      // Clear QDN
      await send('Runtime.evaluate', { expression: `
        for (const ed of document.querySelectorAll('[contenteditable="true"]')) {
          if (!ed.closest('[role="dialog"]')) ed.innerHTML = '';
        }
      `, returnByValue: true, awaitPromise: true });
      await wait(1000);
      
      // Check button
      const btnInfo = await send('Runtime.evaluate', { expression: `
        (() => {
          const b = document.querySelector('[data-testid="tweetButton"]');
          if (!b) return JSON.stringify({err: 'no btn'});
          return JSON.stringify({t: b.innerText, d: b.disabled});
        })()
      `, returnByValue: true, awaitPromise: true });
      const bi = JSON.parse(btnInfo.result?.result?.value || '{}');
      console.log(`  Button: ${bi.t} | disabled: ${bi.d}`);
      
      const isReply = bi.t && (bi.t.toLowerCase().includes('répondre') || bi.t.toLowerCase().includes('reply'));
      if (isReply && !bi.d) {
        const coords = await send('Runtime.evaluate', { expression: `
          (() => {
            const b = document.querySelector('[data-testid="tweetButton"]');
            const r = b?.getBoundingClientRect();
            return r ? JSON.stringify({x: r.x+r.width/2, y: r.y+r.height/2}) : null;
          })()
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
      } else {
        console.log(`  Skipped: button is "${bi.t}"`);
      }
      
      await send('Page.navigate', { url: 'https://x.com/home' });
      await wait(3000);
    }
    
    async function main() {
      await send('Page.enable');
      await send('Runtime.enable');
      await send('Page.navigate', { url: 'https://x.com/home' });
      await wait(5000);
      
      const targets = [
        ['https://x.com/weekhater/status/2053712119716086145', '2053712119716086145',
         "You are right. The approach is to be where multi-chain users already are, not broadcast. Building in public so the right people find it organically.",
         '@weekhater (1)'],
        ['https://x.com/weekhater/status/2053614691801329842', '2053614691801329842',
         "Appreciate the honest feedback. Intentional steps over mass outreach. That is the philosophy.",
         '@weekhater (2)'],
        ['https://x.com/T0m_Calls/status/2053713364325724320', '2053713364325724320',
         "Appreciate that. Taking the time to get the infra right before pushing hard. 116+ chains is a lot to maintain but it means the foundation is solid when we scale.",
         '@TomCalls'],
        ['https://x.com/142C_/status/2053741931314954578', '2053741931314954578',
         "Osmosis was one of the first Cosmos chains we added. The IBC ecosystem is underrated for portfolio tracking. @wcorexyz tracks it alongside 115+ other chains in one dashboard if you want a unified view.",
         '@DianaCrypto'],
        ['https://x.com/JusthappySergio/status/2053865382033715465', '2053865382033715465',
         "Appreciate that. Small accounts deserve solid tools too. @wcorexyz is free to start, 116+ chains, real-time pricing, no paywall. Somnia is already tracked in it.",
         '@JusthappySergio'],
      ];
      
      for (const [url, id, msg, label] of targets) {
        await checkAndPost(url, id, msg, label);
        await wait(2000);
      }
      
      console.log('\n✅ Done');
      ws.close();
    }
  });
});
