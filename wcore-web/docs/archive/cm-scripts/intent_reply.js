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

async function postViaIntent(tweetId, message, label) {
  console.log(`\n========== ${label} ==========`);
  
  // Use the intent/tweet URL with in_reply_to parameter
  const intentUrl = `https://x.com/intent/tweet?in_reply_to=${tweetId}&text=${encodeURIComponent(message)}`;
  console.log('Intent URL:', intentUrl);
  
  await send('Page.navigate', { url: intentUrl });
  await wait(8000);
  
  // Check what page we're on
  const url = await evalJS(`document.location.href`);
  console.log('Current URL:', url);
  
  // Check editors
  const state = await evalJS(`
    (() => {
      const eds = [...document.querySelectorAll('[contenteditable="true"]')].map((e,i) => ({
        i, v: e.offsetParent !== null, w: Math.round(e.getBoundingClientRect().width),
        y: Math.round(e.getBoundingClientRect().y), t: e.textContent.substring(0,60)
      }));
      const btns = [...document.querySelectorAll('[data-testid="tweetButton"]')].map(b => ({
        d: b.disabled, v: b.offsetParent !== null, t: b.innerText
      }));
      const dlg = document.querySelectorAll('[role="dialog"]').length;
      return JSON.stringify({ eds, btns, dlg, title: document.title.substring(0,80) });
    })()
  `);
  console.log('State:', state);
  
  // Try to click submit if there's text
  const s = JSON.parse(state);
  if (s.btns.length > 0) {
    for (const btn of s.btns) {
      if (btn.v) {
        const coords = await evalJS(`
          (() => {
            const btns = document.querySelectorAll('[data-testid="tweetButton"]');
            for (const b of btns) {
              if (b.offsetParent !== null) {
                const r = b.getBoundingClientRect();
                return {x: r.x+r.width/2, y: r.y+r.height/2};
              }
            }
            return null;
          })()
        `);
        if (coords) {
          await clickXY(coords.x, coords.y);
          await wait(4000);
          const pub = await evalJS(`document.body.innerText.includes('publié') || document.body.innerText.includes('Votre')`);
          console.log('Published:', pub);
        }
        break;
      }
    }
  }
  
  // If pre-fill didn't work via intent, try composing manually
  if (s.eds.length === 0 || !s.eds.some(e => e.v && e.w > 200)) {
    console.log('Intent pre-fill did not work, trying alternative...');
  }
}

async function main() {
  try {
    // Dippydinos
    await postViaIntent(
      '2047972280202903721',
      "Same here, the paywall is annoying. I've been using @wcorexyz lately, it tracks 116+ chains (evm, solana, cosmos) with no paywall. Pretty solid for a free tool.",
      'Dippydinos'
    );
    
    await wait(5000);
    
    // ZeroMazed
    await postViaIntent(
      '2053814090078785760',
      "Bro what portfolio tracker crashes on a saylor buy. Time to switch 😂",
      'ZeroMazed'
    );
    
  } catch(e) { console.error('Error:', e.message); }
  ws.close();
}

setTimeout(() => main(), 1000);
