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

async function followUser(username, label) {
  console.log(`\n=== Follow @${username} ${label} ===`);
  await send('Page.navigate', { url: `https://x.com/${username}` });
  await wait(6000);

  const result = await evalJS(`
    (() => {
      // Find follow button - several possible selectors
      const selectors = [
        '[data-testid*="follow"]',
        'div[data-testid*="follow"]',
        '[aria-label*="Follow"]',
        '[aria-label*="follow"]'
      ];
      
      for (const sel of selectors) {
        const els = document.querySelectorAll(sel);
        for (const el of els) {
          const text = el.innerText.toLowerCase();
          const aria = (el.getAttribute('aria-label') || '').toLowerCase();
          const tid = (el.getAttribute('data-testid') || '').toLowerCase();
          
          // Check if it's a "Follow" button (not "Following")
          if ((text === 'follow' || text === 'suivre' || aria.includes('follow') || tid.endsWith('follow')) && 
              !text.includes('ing') && !aria.includes('ing')) {
            el.scrollIntoView({ block: 'center' });
            const r = el.getBoundingClientRect();
            return JSON.stringify({ x: r.x + r.width/2, y: r.y + r.height/2, text: el.innerText });
          }
        }
      }
      
      // Fallback: look for any button with "Follow" text
      const allBtns = document.querySelectorAll('div[role="button"], button');
      for (const btn of allBtns) {
        const t = btn.innerText.trim();
        if ((t === 'Follow' || t === 'Suivre') && btn.offsetParent !== null) {
          const r = btn.getBoundingClientRect();
          return JSON.stringify({ x: r.x + r.width/2, y: r.y + r.height/2, text: t });
        }
      }
      
      return JSON.stringify({ error: 'no follow button' });
    })()
  `);
  
  const info = JSON.parse(result);
  if (info.x) {
    await clickXY(info.x, info.y);
    await wait(2000);
    console.log(`  Followed @${username} (${info.text})`);
  } else {
    console.log(`  ${info.error} for @${username}`);
    // Check if already following
    const body = await evalJS(`document.body.innerText.substring(0, 500)`);
    if (body.includes('Abonné') || body.includes('Following')) {
      console.log(`  Already following @${username}`);
    }
  }
}

async function main() {
  try {
    // Priority 1: Accounts we already engaged with
    await followUser('dippydinos', '(replied to)');
    await followUser('ZeroMazed', '(replied to)');
    await followUser('OnChainGm', '(GM ecosystem)');
    await followUser('StartaleApp', '(Soneium ecosystem)');
    await followUser('lochie_sol', '(replied to)');
    await followUser('theerra001', '(GM badges)');
    await followUser('rodrigomcrypto', '(airdrop tracking)');
    await followUser('Max0x1260', '(airdrop tools)');
    await followUser('shahal0623', '(Soneium S10)');
    await followUser('mobasshir29', '(replied to)');
    await followUser('MookieNFT', '(replied to)');
    
    // Priority 2: Ecosystem / data partners
    await followUser('blockscout', '(multi-chain explorer)');
    await followUser('NetworkNoya', '(wallet tracking)');
    await followUser('Routescan', '(route scanner)');
    await followUser('DexScreener', '(pricing data)');
    await followUser('defillama', '(data source)');
    
    // Priority 3: Potential targets
    await followUser('CryptoLensUK', '(wallet scanner)');
    await followUser('Cryptoskyrun', '(tool stack)');
    await followUser('DefiRilla', '(DeFi monitoring)');
    
    console.log('\n=== ALL FOLLOWS COMPLETE ===');
    
  } catch(e) { console.error('Error:', e.message); }
  ws.close();
}

setTimeout(() => main(), 1000);
