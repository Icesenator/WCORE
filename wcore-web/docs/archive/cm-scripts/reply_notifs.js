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
  
  await send('Runtime.evaluate', { expression: `
    for (const ed of document.querySelectorAll('[contenteditable="true"]')) {
      if (!ed.closest('[role="dialog"]')) ed.innerHTML = '';
    }
  `, returnByValue: true, awaitPromise: true });
  await wait(1000);
  
  const coords = await send('Runtime.evaluate', { expression: `
    (() => {
      const b = document.querySelector('[data-testid="tweetButton"]');
      if (!b || b.disabled || !b.offsetParent) return null;
      const r = b.getBoundingClientRect();
      return JSON.stringify({x: r.x + r.width/2, y: r.y + r.height/2});
    })()
  `, returnByValue: true, awaitPromise: true });
  
  const c = JSON.parse(coords.result?.result?.value || 'null');
  if (c) {
    await clickXY(c.x, c.y);
    await wait(4000);
    const pub = await send('Runtime.evaluate', { expression: `document.body.innerText.includes('publié')`, returnByValue: true, awaitPromise: true });
    console.log(`  ${pub.result?.result?.value ? '✅' : '❌'}`);
  } else console.log('  No button');
  
  await send('Page.navigate', { url: 'https://x.com/home' });
  await wait(3000);
}

async function main() {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  
  await send('Page.navigate', { url: 'https://x.com/home' });
  await wait(5000);
  
  // 1. Reply to @weekhater - the thoughtful comment
  await postReply('2053594971140186361',
    "Fair question. Targeting community-first: engaging where multi-chain users already talk (portfolio trackers, airdrop hunters, GM communities), not broadcasting. Building in public so the right people find it organically. What channels would you prioritize?",
    '@weekhater (strategy)');
  
  await wait(3000);
  
  // 2. Reply to @TomCalls - positive comment
  await postReply('2053594247424696785',
    "Appreciate that. Taking the time to get the infra right before pushing hard. 116+ chains is a lot to maintain, but it means the foundation is solid when we scale outreach.",
    '@TomCalls (positive)');
  
  await wait(3000);
  
  // 3. Reply to @DianaCrypto - Osmosis mention
  await postReply('2053820485075853592',
    "Osmosis was one of the first Cosmos chains we added. The IBC ecosystem is underrated for portfolio tracking. @wcorexyz tracks it alongside 115+ other chains in one dashboard if you want a unified view.",
    '@DianaCrypto (Osmosis)');
  
  console.log('\n✅ All 3 replies done');
  ws.close();
}
