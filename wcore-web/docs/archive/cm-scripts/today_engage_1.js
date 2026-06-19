const http = require('http');
const WebSocket = require('C:/Users/strau/wcore-web/node_modules/.pnpm/ws@8.18.3/node_modules/ws');

const targets = [
  {
    label: '@Mucttc fragmented UX',
    url: 'https://x.com/Mucttc/status/2055118721971315121',
    id: '2055118721971315121',
    message: 'The fragmentation is real but the fix is not another all-in-one app. It is making the state portable so you stop caring which tool you use. Same wallet data, same view, regardless of which dashboard you open.',
  },
];

http.get('http://127.0.0.1:9222/json', (res) => {
  let body = '';
  res.on('data', (chunk) => { body += chunk; });
  res.on('end', () => {
    const page = JSON.parse(body).filter((t) => t.type === 'page').find((t) => t.url && t.url.includes('x.com'));
    if (!page) process.exit(1);
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    let msgId = 0;
    const pending = {};
    const posted = [];
    ws.on('open', () => main());
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.method === 'Page.javascriptDialogOpening') {
        ws.send(JSON.stringify({ id: 99999, method: 'Page.handleJavaScriptDialog', params: { accept: true } }));
      }
      if (msg.id && pending[msg.id]) pending[msg.id](msg);
    });
    ws.on('close', () => process.exit(0));

    function send(m, p) { msgId++; ws.send(JSON.stringify({id:msgId,method:m,params:p||{}})); return new Promise((r) => { pending[msgId] = r; }); }
    async function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
    async function evalJs(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      return r.result && r.result.result && r.result.result.value;
    }
    async function post(target) {
      console.log(`\n=== ${target.label} ===`);
      await send('Page.navigate', { url: target.url });
      await wait(6000);
      await evalJs('window.scrollBy(0, 600)');
      await wait(2000);
      const text = await evalJs('document.body.innerText.toLowerCase()');
      if (text.includes('wcore')) { console.log('Already replied, skipping.'); return; }
      await send('Page.navigate', { url: `https://x.com/intent/post?in_reply_to=${target.id}&text=${encodeURIComponent(target.message)}` });
      await wait(8000);
      const button = await evalJs('(()=>{const b=[...document.querySelectorAll("button")].find(x=>/répondre|reply/i.test(x.innerText)&&!x.disabled);if(!b)return null;const r=b.getBoundingClientRect();return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2})})()');
      const parsed = button ? JSON.parse(button) : null;
      if (!parsed) { console.log('Button not found.'); return; }
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: parsed.x, y: parsed.y, button: 'left', clickCount: 1 });
      await wait(50);
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: parsed.x, y: parsed.y, button: 'left', clickCount: 1 });
      await wait(4000);
      posted.push(target);
      console.log('Posted.');
      await send('Page.navigate', { url: 'https://x.com/home' });
      await wait(4000);
    }
    async function main() {
      await send('Page.enable');
      await send('Runtime.enable');
      await send('Page.navigate', { url: 'https://x.com/home' });
      await wait(4000);
      for (const t of targets) await post(t);
      console.log(`\nDone: ${posted.length} replies.`);
      ws.close();
    }
  });
});
