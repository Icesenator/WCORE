const http = require('http');
const WebSocket = require('C:/Users/strau/wcore-web/node_modules/.pnpm/ws@8.18.3/node_modules/ws');

const postText = 'Drop a public wallet address.\n\nI will check what WCORE can see across supported chains and share the fragmentation pattern.\n\nRead-only only. No signatures. No approvals.';

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
    async function main() {
      await send('Page.enable');
      await send('Runtime.enable');
      await send('Page.navigate', { url: `https://x.com/intent/post?text=${encodeURIComponent(postText)}` });
      await wait(8000);
      const button = await evalJs(`
        (() => {
          const button = [...document.querySelectorAll('button')].find((item) => /poster|post/i.test(item.innerText) && !item.disabled);
          if (!button) return null;
          const rect = button.getBoundingClientRect();
          return JSON.stringify({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, text: button.innerText });
        })()
      `);
      const parsed = button ? JSON.parse(button) : null;
      if (!parsed) {
        console.log('Post button not found.');
        ws.close();
        return;
      }
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: parsed.x, y: parsed.y, button: 'left', clickCount: 1 });
      await wait(50);
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: parsed.x, y: parsed.y, button: 'left', clickCount: 1 });
      await wait(6000);
      console.log('Submitted wallet scan hook.');
      ws.close();
    }
  });
});
