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
    
    async function main() {
      await send('Page.enable');
      await send('Runtime.enable');
      
      const text = "Desktop-first refresh 🖥️\n\nEvery page now fills your screen. Gnosis RealT pricing fixed. 50+ token logos updated. Chain selector unified.\n\n\u2192 wcore.xyz";
      
      await send('Page.navigate', { url: `https://x.com/intent/post?text=${encodeURIComponent(text)}` });
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
        console.log(pub.result?.result?.value ? '✅ Posted' : '❌ Failed');
      }
    }
  });
});
