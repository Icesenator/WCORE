const WebSocket = require('C:/Users/strau/wcore-web/node_modules/.pnpm/ws@8.18.3/node_modules/ws');
const PAGE_WS = 'ws://127.0.0.1:9222/devtools/page/50B08A82DBF396A311BA25640AD8F878';
let msgId = 0;
const pending = {};

const ws = new WebSocket(PAGE_WS);
ws.on('open', () => {
  console.log('Connected');
  send('Page.enable');
  send('Runtime.enable');
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
async function clickXY(x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await wait(50);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}

async function postReply(tweetId, message, label) {
  console.log(`\n=== ${label} ===`);
  console.log(`Replying to tweet ${tweetId}`);
  console.log(`Message: ${message.substring(0, 80)}...`);
  
  const url = `https://x.com/intent/post?in_reply_to=${tweetId}&text=${encodeURIComponent(message)}`;
  await send('Page.navigate', { url });
  await wait(8000);
  
  const state = await evalJS(`[...document.querySelectorAll('[data-testid="tweetButton"]')].map(b => ({
    d: b.disabled, v: b.offsetParent !== null,
    x: b.getBoundingClientRect().x + b.getBoundingClientRect().width/2,
    y: b.getBoundingClientRect().y + b.getBoundingClientRect().height/2
  }))`);
  
  if (state.length > 0 && state[0].v) {
    await clickXY(state[0].x, state[0].y);
    await wait(4000);
    const pub = await evalJS(`document.body.innerText.includes('publié')`);
    console.log(pub ? '  ✅ Published!' : '  ❌ Failed');
    return pub;
  }
  console.log('  ❌ No button');
  return false;
}

async function main() {
  // Clean messages without em dashes
  const msg1 = "Same here, I've been using @wcorexyz for this. 116+ chains (evm, solana, cosmos) in one dashboard, real-time pricing, free. Was tired of juggling 5 different explorers.";
  const msg2 = "I use @wcorexyz for tracking everything. 116+ chains, real-time pricing, no paywall. Pretty solid for a free tool.";
  const msg3 = "If you're juggling multiple chains, @wcorexyz tracks 116+ (evm, solana, cosmos) in one dashboard. Real-time pricing, no paywall. Built it for my own sanity.";
  
  // Post to 3 recent relevant tweets
  // These are from the search results above
  await postReply('2053732741007462469', "I use @wcorexyz for tracking everything. 116+ chains, real-time pricing, no paywall. Pretty solid for a free tool.", '@Amethisto (portfolio tracker)');
  
  await wait(6000);
  
  await postReply('2053156105224872388', "If you're juggling multiple chains, @wcorexyz tracks 116+ (evm, solana, cosmos) in one dashboard. Real-time pricing, no paywall. Built it for my own sanity.", '@walangIjo174579 (portfolio+AI)');
  
  await wait(6000);
  
  await postReply('2053901818386055445', "Same here, I've been using @wcorexyz for this. 116+ chains (evm, solana, cosmos) in one dashboard, real-time pricing, free. Was tired of juggling 5 different explorers.", '@NOW_Wallet (gm+monday)');
  
  console.log('\n✅ Done!');
  ws.close();
}

setTimeout(() => main(), 1000);
