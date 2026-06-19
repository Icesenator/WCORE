const http = require('http');
const WebSocket = require('C:/Users/strau/wcore-web/node_modules/.pnpm/ws@8.18.3/node_modules/ws');

const targets = [
  {
    label: 'GARL_DEFI fragmentation',
    url: 'https://x.com/GARL_DEFI/status/2054444036249759752',
    id: '2054444036249759752',
    marker: 'Hard mode is accurate',
    message: 'Hard mode is accurate. The real cost is not only swaps or bridges, it is the constant mental accounting across chains, wallets and venues.',
  },
  {
    label: 'Mary fragmented workflows',
    url: 'https://x.com/Mary__h0/status/2054625211345981741',
    id: '2054625211345981741',
    marker: 'the memory load',
    message: 'The hardest part is the memory load. Users are not just switching tools, they are trying to remember why each wallet, chain and protocol mattered in the first place.',
  },
];

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
    async function post(target) {
      console.log(`\n=== ${target.label} ===`);
      await send('Page.navigate', { url: target.url });
      await wait(6500);
      await evalJs('window.scrollBy(0, 800)');
      await wait(2000);
      const bodyText = await evalJs('document.body.innerText');
      if (bodyText.toLowerCase().includes('wcore') || bodyText.includes(target.marker)) {
        console.log('Already replied or marker found, skipping.');
        return;
      }
      await send('Page.navigate', { url: `https://x.com/intent/post?in_reply_to=${target.id}&text=${encodeURIComponent(target.message)}` });
      await wait(8000);
      const button = await evalJs(`
        (() => {
          const button = [...document.querySelectorAll('button')].find((item) => /répondre|reply/i.test(item.innerText) && !item.disabled);
          if (!button) return null;
          const rect = button.getBoundingClientRect();
          return JSON.stringify({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
        })()
      `);
      const parsed = button ? JSON.parse(button) : null;
      if (!parsed) {
        console.log('Reply button not found.');
        return;
      }
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: parsed.x, y: parsed.y, button: 'left', clickCount: 1 });
      await wait(50);
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: parsed.x, y: parsed.y, button: 'left', clickCount: 1 });
      await wait(5000);
      posted.push(target);
      console.log('Submitted.');
      await send('Page.navigate', { url: 'https://x.com/home' });
      await wait(5000);
    }
    async function main() {
      await send('Page.enable');
      await send('Runtime.enable');
      await send('Page.navigate', { url: 'https://x.com/home' });
      await wait(4000);
      for (const target of targets) await post(target);
      console.log(`\nSubmitted ${posted.length} replies.`);
      ws.close();
    }
  });
});
