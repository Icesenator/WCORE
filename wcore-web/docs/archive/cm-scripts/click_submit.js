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

setTimeout(async () => {
  try {
    await wait(3000);
    
    const url = await evalJS(`document.location.href`);
    console.log('URL:', url);
    
    // Check state
    const state = await evalJS(`
      [...document.querySelectorAll('[data-testid="tweetButton"]')].map(b => ({
        d: b.disabled, v: b.offsetParent !== null,
        x: b.getBoundingClientRect().x + b.getBoundingClientRect().width/2,
        y: b.getBoundingClientRect().y + b.getBoundingClientRect().height/2
      }))
    `);
    console.log('Buttons:', JSON.stringify(state));
    
    // Also check text
    const text = await evalJS(`document.querySelector('[contenteditable="true"]')?.textContent?.substring(0,50)`);
    console.log('Editor text:', text);
    
    // Click the button
    if (state.length > 0) {
      const btn = state[0];
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: btn.x, y: btn.y, button: 'left', clickCount: 1 });
      await wait(50);
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: btn.x, y: btn.y, button: 'left', clickCount: 1 });
      console.log('Clicked at', btn.x, btn.y);
      await wait(4000);
      const pub = await evalJS(`document.body.innerText.includes('publié')`);
      console.log('Published:', pub);
    }
    
  } catch(e) { console.error('Error:', e.message); }
  ws.close();
}, 1000);
