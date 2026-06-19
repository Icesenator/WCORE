const http = require('http');
const WebSocket = require('C:/Users/strau/wcore-web/node_modules/.pnpm/ws@8.18.3/node_modules/ws');

const checks = [
  {
    url: 'https://x.com/NgocThu01159840/status/2054406394875691457',
    marker: 'unified starts with visibility before execution',
  },
  {
    url: 'https://x.com/tofudestiny/status/2053439489943777295',
    marker: 'Remembering why a wallet touched a chain',
  },
  {
    url: 'https://x.com/Almstin4Crypto/status/2043092733246480610',
    marker: 'One place for read-only balances across wallets and chains',
  },
];

http.get('http://127.0.0.1:9222/json', (res) => {
  let body = '';
  res.on('data', (chunk) => { body += chunk; });
  res.on('end', () => {
    const page = JSON.parse(body).filter((target) => target.type === 'page').find((target) => target.url && target.url.includes('x.com'));
    if (!page) process.exit(1);
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
      for (const check of checks) {
        await send('Page.navigate', { url: check.url });
        await wait(7000);
        for (let i = 0; i < 3; i += 1) {
          await evalJs('window.scrollBy(0, 900)');
          await wait(1500);
        }
        const text = await evalJs('document.body.innerText');
        console.log(`\n${check.url}`);
        console.log(text.includes(check.marker) ? 'Visible.' : 'Not visible.');
      }
      ws.close();
    }
  });
});
