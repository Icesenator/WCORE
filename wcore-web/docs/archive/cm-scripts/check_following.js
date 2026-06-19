const WebSocket = require('C:/Users/strau/wcore-web/node_modules/.pnpm/ws@8.18.3/node_modules/ws');
const PAGE_WS = 'ws://127.0.0.1:9222/devtools/page/50B08A82DBF396A311BA25640AD8F878';
let msgId = 0;
const pending = {};

const ws = new WebSocket(PAGE_WS);
ws.on('open', () => {
  console.log('Connected');
  send('Page.enable');
  send('Runtime.enable');
  send('Page.navigate', { url: 'https://x.com/WCORExyz/following' });
});

ws.on('message', data => {
  const msg = JSON.parse(data.toString());
  if (msg.id && pending[msg.id]) pending[msg.id](msg);
});
ws.on('error', e => console.error('Error:', e.message));
ws.on('close', () => process.exit(0));

function send(method, params) {
  msgId++;
  ws.send(JSON.stringify({ id: msgId, method, params: params || {} }));
  return new Promise(r => { pending[msgId] = r; });
}

async function evalJS(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  return r.result?.result?.value;
}

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

setTimeout(async () => {
  try {
    await wait(5000);
    
    for (let i = 0; i < 10; i++) {
      await evalJS(`window.scrollBy(0, 1500)`);
      await wait(1000);
    }
    
    const handles = await evalJS(`[...document.querySelectorAll('[data-testid="UserCell"]')].map(c => {
      const link = c.querySelector('a[href]');
      return link ? link.getAttribute('href') : '';
    }).filter(h => h.startsWith('/') && h !== '/WCORExyz')`);
    
    console.log(`\n=== Following: ${handles ? handles.length : 0} total ===`);
    if (handles) handles.forEach(h => console.log(`  ${h}`));
    
    // Check key ones
    const wanted = ['OnChainGm', 'MookieNFT', 'blockscout', 'DexScreener', 'defillama', 'Routescan', 'NetworkNoya', 'CryptoLensUK', 'Cryptoskyrun', 'DefiRilla'];
    console.log('\n=== Status ===');
    wanted.forEach(w => {
      const found = handles && handles.some(h => h === '/' + w);
      console.log(`  ${found ? '✅' : '❌'} @${w}`);
    });
    
  } catch(e) { console.error('Error:', e.message); }
  ws.close();
}, 2000);
