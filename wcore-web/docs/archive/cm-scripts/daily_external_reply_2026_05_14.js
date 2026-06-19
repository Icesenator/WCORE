const http = require('http');
const WebSocket = require('C:/Users/strau/wcore-web/node_modules/.pnpm/ws@8.18.3/node_modules/ws');

const targets = [
  {
    label: 'NgocThu unified finance question',
    url: 'https://x.com/NgocThu01159840/status/2054406394875691457',
    id: '2054406394875691457',
    message: 'To me, unified starts with visibility before execution. If users cannot see where assets sit across wallets and chains, every next action feels harder. That is the angle we are taking with @WCORExyz: read-only first, then clearer decisions.',
  },
  {
    label: 'tofudestiny persistent context',
    url: 'https://x.com/tofudestiny/status/2053439489943777295',
    id: '2053439489943777295',
    message: 'This is a really good way to phrase it. The missing piece is often context, not another button. Remembering why a wallet touched a chain is almost as important as showing the balance.',
  },
  {
    label: 'Almstin tracking question',
    url: 'https://x.com/Almstin4Crypto/status/2043092733246480610',
    id: '2043092733246480610',
    message: 'I split it into two layers now. One place for read-only balances across wallets and chains, then separate tools for execution and tax. Mixing those into one workflow gets messy fast.',
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

    async function checkAndPost(target) {
      console.log(`\n=== ${target.label} ===`);
      await send('Page.navigate', { url: target.url });
      await wait(6500);
      await evalJs('window.scrollBy(0, 900)');
      await wait(2500);
      const text = await evalJs('document.body.innerText.toLowerCase()');
      if (text.includes('wcore')) {
        console.log('Already has WCORE mention, skipping.');
        return;
      }

      await send('Page.navigate', { url: `https://x.com/intent/post?in_reply_to=${target.id}&text=${encodeURIComponent(target.message)}` });
      await wait(8000);
      const button = await evalJs(`
        (() => {
          const buttons = [...document.querySelectorAll('button')];
          const reply = buttons.find((button) => /répondre|reply/i.test(button.innerText) && !button.disabled);
          if (!reply) return null;
          const rect = reply.getBoundingClientRect();
          return JSON.stringify({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, text: reply.innerText });
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
      await wait(5000);
      for (const target of targets) {
        await checkAndPost(target);
        await wait(2500);
      }
      console.log(`\nSubmitted ${posted.length} replies.`);
      for (const item of posted) console.log(`${item.label}: ${item.url}`);
      ws.close();
    }
  });
});
