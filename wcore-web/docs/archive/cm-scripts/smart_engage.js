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
    
    async function postReply(tweetId, msg) {
      const url = `https://x.com/intent/post?in_reply_to=${tweetId}&text=${encodeURIComponent(msg)}`;
      await send('Page.navigate', { url });
      await wait(8000);
      const bi = await send('Runtime.evaluate', { expression: `
        (() => { const b = document.querySelector('[data-testid="tweetButton"]');
          if (!b || b.disabled || !b.offsetParent) return null;
          b.click(); return 'ok';
        })()
      `, returnByValue: true, awaitPromise: true });
      return bi.result?.result?.value === 'ok';
    }
    
    async function main() {
      await send('Page.enable');
      await send('Runtime.enable');
      await send('Page.navigate', { url: 'https://x.com/home' });
      await wait(5000);
      
      let count = 0;
      
      // 1. @vikki_loveridge - genuine DeFi frustration
      await send('Page.navigate', { url: 'https://x.com/vikki_loveridge/status/2054079636112646536' });
      await wait(4000);
      let c = await send('Runtime.evaluate', { expression: 'document.body.innerText.toLowerCase().includes("wcore")', returnByValue: true, awaitPromise: true });
      if (!c.result?.result?.value) {
        const ok = await postReply('2054079636112646536', "It really does become overwhelming once you spread across a few chains. I hit the same wall and built @wcorexyz to pull everything into one view. Still early but helps keep track without the manual work.");
        if (ok) { count++; console.log(`✅ vikki_loveridge`); }
        await send('Page.navigate', { url: 'https://x.com/home' });
        await wait(4000);
      }
      
      // 2. @arc_swap - unified balance (dev convo)
      await send('Page.navigate', { url: 'https://x.com/arc_swap/status/2053706580760338934' });
      await wait(4000);
      c = await send('Runtime.evaluate', { expression: 'document.body.innerText.toLowerCase().includes("wcore")', returnByValue: true, awaitPromise: true });
      if (!c.result?.result?.value) {
        const ok = await postReply('2053706580760338934', "Unified balance across different protocols is exactly the problem we are solving too. Good to see others approaching it. We went with a read only approach that aggregates evm, solana and cosmos into one dashboard. Different angle, same goal.");
        if (ok) { count++; console.log(`✅ arc_swap`); }
        await send('Page.navigate', { url: 'https://x.com/home' });
        await wait(4000);
      }
      
      // 3. @GuavaIntel - wallet tracking space
      await send('Page.navigate', { url: 'https://x.com/GuavaIntel/status/2054079711790170377' });
      await wait(4000);
      c = await send('Runtime.evaluate', { expression: 'document.body.innerText.toLowerCase().includes("wcore")', returnByValue: true, awaitPromise: true });
      if (!c.result?.result?.value) {
        const ok = await postReply('2054079711790170377', "Interesting approach. We built @wcorexyz for multichain portfolio tracking across evm, solana and cosmos with real time pricing. Different focus but same space. Always good to see more tools giving users better visibility on their holdings.");
        if (ok) { count++; console.log(`✅ GuavaIntel`); }
      }
      
      console.log(`\nPosted ${count} replies`);
      ws.close();
    }
  });
});
