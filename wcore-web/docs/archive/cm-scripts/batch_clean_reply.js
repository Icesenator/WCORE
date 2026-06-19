const WebSocket = require('C:/Users/strau/wcore-web/node_modules/.pnpm/ws@8.18.3/node_modules/ws');
const PAGE_WS = 'ws://127.0.0.1:9222/devtools/page/50B08A82DBF396A311BA25640AD8F878';
let msgId = 0;
const pending = {};

const ws = new WebSocket(PAGE_WS);
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

async function clickXY(x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await wait(50);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}

async function postReply(tweetId, message, label) {
  console.log(`\n=== ${label} ===`);
  const url = `https://x.com/intent/post?in_reply_to=${tweetId}&text=${encodeURIComponent(message)}`;
  
  await send('Page.navigate', { url });
  await wait(8000);
  
  // Clear QDN editor
  await send('Runtime.evaluate', { expression: `
    for (const ed of document.querySelectorAll('[contenteditable="true"]')) {
      if (!ed.closest('[role="dialog"]')) ed.innerHTML = '';
    }
  `, returnByValue: true, awaitPromise: true });
  await wait(1000);
  
  // Get button coordinates via JS, click via CDP mouse
  const btnCoords = await send('Runtime.evaluate', { expression: `
    (() => {
      const b = document.querySelector('[data-testid="tweetButton"]');
      if (!b || b.disabled || !b.offsetParent) return null;
      const r = b.getBoundingClientRect();
      return JSON.stringify({x: r.x + r.width/2, y: r.y + r.height/2});
    })()
  `, returnByValue: true, awaitPromise: true });
  
  const coords = JSON.parse(btnCoords.result?.result?.value || 'null');
  if (coords) {
    await clickXY(coords.x, coords.y);
    console.log('  Clicked');
    await wait(4000);
    const pub = await send('Runtime.evaluate', { expression: `document.body.innerText.includes('publié')`, returnByValue: true, awaitPromise: true });
    console.log(`  ${pub.result?.result?.value ? '✅' : '❌'}`);
  } else {
    console.log('  No button');
  }
  
  await send('Page.navigate', { url: 'https://x.com/home' });
  await wait(3000);
}

async function main() {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await wait(1000);
  
  await send('Page.navigate', { url: 'https://x.com/home' });
  await wait(5000);
  
  // Check Blastslot first
  await send('Page.navigate', { url: 'https://x.com/Blastslot/status/2053731833129418785' });
  await wait(5000);
  const hasB = await send('Runtime.evaluate', { expression: `document.body.innerText.toLowerCase().includes('wcore')`, returnByValue: true, awaitPromise: true });
  if (!hasB.result?.result?.value) {
    await postReply('2053731833129418785', 
      "Good point. Most tools show a balance without context. @wcorexyz tracks 116+ chains with real-time pricing and full token breakdown so you can actually understand what you're holding.",
      '@Blastslot');
  } else { console.log('@Blastslot already replied'); }
  
  await wait(3000);
  
  // Check DefiGoWeb3
  await send('Page.navigate', { url: 'https://x.com/DefiGoWeb3/status/2052850105963864089' });
  await wait(5000);
  const hasD = await send('Runtime.evaluate', { expression: `document.body.innerText.toLowerCase().includes('wcore')`, returnByValue: true, awaitPromise: true });
  if (!hasD.result?.result?.value) {
    await postReply('2052850105963864089',
      "That's the part most tools miss. @wcorexyz tracks 116+ chains with full token breakdown and real-time pricing so you actually understand what you're holding across evm, solana and cosmos.",
      '@DefiGoWeb3');
  } else { console.log('@DefiGoWeb3 already replied'); }
  
  console.log('\n✅ Done');
  ws.close();
}
