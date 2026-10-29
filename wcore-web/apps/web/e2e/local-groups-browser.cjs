/* QA de vraie page Next locale, profil éphémère, sans wallet/auth/API réelle.
 * Démarrer .tmp/local-groups-browser-qa/start-isolated.cjs, puis node ce fichier.
 * Les fixtures et injections Storage ne concernent que le contexte QA vierge.
 */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('@playwright/test');
const root = 'D:/ProjetIA/WCORE';
const work = path.join(root, '.tmp/local-groups-browser-qa');
const selectedFix = process.argv.includes('--delete-green');
const proof = path.join(root, selectedFix ? 'docs/reference/local-groups-selected-delete-fix.json' : 'docs/reference/wcore-local-groups-browser-qa.json');
const key = 'wcore.local-wallet-groups.v1';
const sentinel = 'qa.local-groups.unrelated';
const a = '0x00000000000000000000000000000000000000a1';
const b = '0x00000000000000000000000000000000000000b2';
const report = { objective: 'LOCAL_GROUPS_REAL_PAGE_QA', startedAt: new Date().toISOString(), status: 'NOT_EXECUTED', checks: [], requests: [], externalBlocked: [], errors: [], screenshots: [], limits: ['API et chaînes synthétiques ; aucun backend, wallet provider, secret, GAS ou accès Flare.', 'Captures limitées à la page localhost du projet ; tests modèle/backend hors périmètre.'] };
let runtime, base, browser;
function pass(name, details = {}) { report.checks.push({ name, status: 'PASS', ...details }); }
async function stored(page) { return page.evaluate(k => JSON.parse(localStorage.getItem(k)), key); }
async function noOverflow(page, width, stage) { const sizes = await page.evaluate(() => ({ viewport:innerWidth, body:document.body.scrollWidth, html:document.documentElement.scrollWidth })); assert(sizes.body <= sizes.viewport && sizes.html <= sizes.viewport, JSON.stringify(sizes)); pass('absence de débordement horizontal', { width, stage, ...sizes }); }
async function contextFor(width, mode = 'normal') {
  const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, serviceWorkers: 'block' });
  const state = { stage: 'bootstrap', width, mode };
  await context.addInitScript(({ key, sentinel, mode }) => {
    if (!sessionStorage.getItem('qa-fixture-seeded')) {
      localStorage.setItem(sentinel, 'preserve-me');
      if (mode === 'corrupt') localStorage.setItem(key, '{broken');
      if (mode === 'future') localStorage.setItem(key, JSON.stringify({schemaVersion:999,groups:[],sources:[]}));
      sessionStorage.setItem('qa-fixture-seeded','1');
    }
    if (mode === 'write-error') {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(k,v) { if (k === key) throw new DOMException('QA storage denied','QuotaExceededError'); return original.call(this,k,v); };
    }
    if (mode === 'read-error') {
      const original = Storage.prototype.getItem;
      Storage.prototype.getItem = function(k) { if (k === key) throw new DOMException('QA storage denied','SecurityError'); return original.call(this,k); };
    }
  }, {key,sentinel,mode});
  await context.route('**/*', async route => {
    const req=route.request(); const url=new URL(req.url());
    if (url.pathname.startsWith('/api/')) {
      report.requests.push({width,mode,stage:state.stage,method:req.method(),path:url.pathname,query:url.search,body:req.postData()});
      if (url.pathname === '/api/auth/me') return route.fulfill({status:401,json:{error:'UNAUTHENTICATED'}});
      if (url.pathname === '/api/chains') return route.fulfill({json:[{key:'BASE',name:'Base',vm:'EVM',chainId:8453,nativeSymbol:'ETH',disabled:false},{key:'ETHEREUM',name:'Ethereum',vm:'EVM',chainId:1,nativeSymbol:'ETH',disabled:false}]});
      if (/scan/.test(url.pathname)) return route.fulfill({status:200,json:{address:a,tokens:[],chains:[],totalEur:0,errors:[],status:'completed',results:[]}});
      return route.fulfill({status:200,json:{}});
    }
    // Les requêtes RSC de navigation sont des ressources frontend locales, pas une API.
    if (url.origin === base && (!['fetch','xhr'].includes(req.resourceType()) || req.headers()['rsc'] === '1' || url.pathname.startsWith('/_next/'))) return route.continue();
    report.externalBlocked.push({width,mode,stage:state.stage,origin:url.origin,path:url.pathname,type:req.resourceType()});
    return route.abort('blockedbyclient');
  });
  await context.routeWebSocket('**/*', ws => { if (ws.url().startsWith(base.replace('http:','ws:'))) ws.connectToServer(); else ws.close(); });
  const page=await context.newPage(); page.on('pageerror',e=>report.errors.push({width,mode,stage:state.stage,message:e.message}));
  return {context,page,state};
}
async function main() {
  runtime=JSON.parse(fs.readFileSync(path.join(work,'runtime.json'),'utf8')); base=`http://127.0.0.1:${runtime.port}`;
  report.runtime={port:runtime.port,envKeys:runtime.envKeys,isolatedCopy:'.tmp/local-groups-browser-qa/workspace',browser:'Chromium Chrome channel, headless, ephemeral contexts, extensions disabled'};
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-extensions','--disable-background-networking']});
  report.status='RUNNING';
  if (selectedFix || process.argv.includes('--delete-red')) {
    report.command = `node wcore-web/apps/web/e2e/local-groups-browser.cjs ${selectedFix ? '--delete-green' : '--delete-red'}`;
    const crypto = require('node:crypto');
    report.testedSourceHashes = {};
    for (const file of ['components/MyGroups.tsx','lib/local-wallet-groups-storage.ts','app/HomePageClient.tsx']) report.testedSourceHashes[file] = crypto.createHash('sha256').update(fs.readFileSync(path.join(runtime.target,file))).digest('hex');
    for (const width of selectedFix ? [390,1440] : [390]) await selectedDeleteScenario(width);
    report.status='PASS'; report.BROWSER_E2E='EXECUTED'; return;
  }
  for (const width of [1440,390]) await normalScenario(width);
  for (const mode of ['corrupt','future','write-error','read-error']) await errorScenario(mode);
  report.status='PASS'; report.BROWSER_E2E='EXECUTED';
}
// Les sélecteurs ci-dessous suivent les noms accessibles du composant livré.
async function openPanel(page) {
  const response=await page.goto(base, {waitUntil:'domcontentloaded',timeout:180000});
  if(response.status()>=500) throw new Error(`NOT_EXECUTED: frontend compile HTTP ${response.status()}`);
  const panel=page.getByRole('region',{name:'My Groups',exact:true});
  await panel.getByRole('button',{name:'Create group',exact:true}).waitFor({timeout:180000});
  await page.waitForFunction(() => { const s=document.querySelector('section[aria-label="My Groups"] [role="status"]'); return s && !s.textContent.includes('Loading'); }, {timeout:60000});
  return panel;
}
async function create(panel,name) { await panel.getByRole('textbox',{name:'New group name',exact:true}).fill(name); await panel.getByRole('button',{name:'Create group',exact:true}).click(); await panel.getByRole('textbox',{name:`Name for ${name}`,exact:true}).waitFor(); }
function group(panel,name) { return panel.getByRole('textbox',{name:`Name for ${name}`,exact:true}).locator('../..'); }
async function add(panel,name,address) { const g=group(panel,name); await g.getByRole('textbox',{name:`Public address for ${name}`,exact:true}).fill(address); await g.getByRole('button',{name:'Add address',exact:true}).click(); }
async function selectedDeleteScenario(width) {
  const {context,page,state}=await contextFor(width);
  try {
    const panel=await openPanel(page); state.stage='actions-delete-selected';
    await create(panel,'QA selected deletion'); await add(panel,'QA selected deletion',a);
    await panel.getByRole('checkbox',{name:/QA selected deletion/}).check();
    await group(panel,'QA selected deletion').getByRole('button',{name:'Delete group',exact:true}).click();
    await page.waitForFunction(k=>JSON.parse(localStorage.getItem(k)).groups.length===0,key);
    const message=panel.getByText('Select a chain and a non-empty public-wallet group.',{exact:false});
    const visible=await message.isVisible();
    const shot=path.join(work,`selected-delete-${selectedFix ? 'green' : 'red'}-${width}.png`); await panel.screenshot({path:shot}); report.screenshots.push(path.relative(root,shot));
    const blob=await stored(page);
    const observation={width,groups:blob.groups.length,sources:blob.sources.length,orphanMessageVisible:visible,apiRequests:report.requests.filter(r=>r.width===width&&r.stage==='actions-delete-selected').length};
    report.selectedDeleteObservations ??= []; report.selectedDeleteObservations.push(observation);
    report.selectedDeleteObservation=observation;
    assert.equal(visible,false,'P3: après suppression du dernier groupe sélectionné, aucun message de sélection vide ne doit subsister');
    assert.equal(blob.groups.length,0); assert.equal(blob.sources.length,1); assert.equal(observation.apiRequests,0);
    assert.equal(await page.evaluate(k=>localStorage.getItem(k),sentinel),'preserve-me');
    assert(await panel.getByRole('button',{name:'Explore group',exact:true}).isDisabled());
    pass('suppression dernier groupe sélectionné : aucun message orphelin, sources conservées, zéro API',observation);
  } finally {await context.close();}
}
async function normalScenario(width) {
  const {context,page,state}=await contextFor(width);
  try {
    let panel=await openPanel(page); await noOverflow(page,width,'empty');
    const secretName='QA private alias '+width; const renamed='QA renamed private '+width; const second='QA second '+width;
    state.stage='actions-local'; const before=report.requests.length;
    await create(panel,secretName); await add(panel,secretName,a);
    await page.waitForFunction(k=>JSON.parse(localStorage.getItem(k)).sources.length===1,key);
    await add(panel,secretName,a.replace('a1','A1'));
    let blob=await stored(page); assert.equal(blob.sources.length,1); assert.equal(blob.groups[0].memberIds.length,1);
    pass('création + ajout EVM et doublon de casse dédupliqué',{width});
    await group(panel,secretName).getByRole('textbox',{name:`Name for ${secretName}`,exact:true}).fill(renamed);
    await group(panel,secretName).getByRole('button',{name:'Rename',exact:true}).click();
    await panel.getByRole('textbox',{name:`Name for ${renamed}`,exact:true}).waitFor();
    await create(panel,second); await add(panel,second,a); await add(panel,second,b);
    blob=await stored(page); assert.equal(blob.sources.length,2); assert.deepEqual(blob.groups.map(g=>g.memberIds.length),[1,2]);
    const ids=blob.groups.map(g=>g.id);
    await panel.getByRole('checkbox',{name:new RegExp(renamed)}).check();
    await panel.getByRole('checkbox',{name:new RegExp(second)}).check();
    assert.equal(report.requests.slice(before).filter(r=>/scan/.test(r.path)).length,0);
    assert(!page.url().includes('wallet/'));
    pass('multi-groupe : source partagée et sélection sans scan ni navigation',{width,groupMembers:[1,2],uniqueSources:2});
    await noOverflow(page,width,'populated');
    const shot=path.join(work,`groups-${width}.png`); await page.screenshot({path:shot,fullPage:true}); report.screenshots.push(path.relative(root,shot));
    state.stage='bootstrap-reload'; await page.reload({waitUntil:'domcontentloaded'});
    panel=page.getByRole('region',{name:'My Groups',exact:true}); await panel.getByRole('textbox',{name:`Name for ${renamed}`,exact:true}).waitFor({timeout:60000});
    assert.equal((await stored(page)).sources.length,2); pass('renommage et persistance après reload',{width});
    state.stage='actions-select';
    await panel.getByRole('checkbox',{name:new RegExp(renamed)}).check(); await panel.getByRole('checkbox',{name:new RegExp(second)}).check();
    state.stage='actions-explore'; const scanResponse=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/scan/batch',{timeout:60000}); await panel.getByRole('button',{name:'Explore group',exact:true}).click();
    await page.waitForURL(/\/wallet\//,{timeout:180000});
    const url=new URL(page.url()); const addresses=decodeURIComponent(url.pathname.slice('/wallet/'.length)).split(',');
    assert.deepEqual(addresses,[a,b]); assert.deepEqual([...url.searchParams.keys()].sort(),['chains','deep']);
    assert(![secretName,renamed,second,...ids].some(v=>decodeURIComponent(url.href).includes(v)));
    await page.waitForFunction(() => document.querySelector('main')?.textContent?.includes('Loading') || /Portfolio|tokens|Scan|Total/i.test(document.querySelector('main')?.textContent || ''), {timeout:60000});
    await scanResponse;
    const scans=report.requests.filter(r=>r.width===width&&r.mode==='normal'&&r.stage==='actions-explore'&&r.path==='/api/scan/batch');
    assert(scans.length>0,'Explore doit atteindre le scanner existant et sa requête mockée');
    pass('Explore explicite : navigation scanner existant, union unique adresses seules sans alias/groupID',{width,path:url.pathname,query:url.search,scanRequests:scans.length});
    state.stage='bootstrap-return'; panel=await openPanel(page); state.stage='actions-delete';
    await group(panel,renamed).getByRole('button',{name:'Delete group',exact:true}).click();
    await page.waitForFunction(k=>JSON.parse(localStorage.getItem(k)).groups.length===1,key);
    blob=await stored(page); assert.equal(blob.sources.length,2); assert.equal(blob.groups[0].name,second);
    assert.equal(await page.evaluate(k=>localStorage.getItem(k),sentinel),'preserve-me');
    assert.equal(report.requests.filter(r=>r.width===width&&r.mode==='normal'&&r.stage==='actions-delete').length,0);
    assert.equal(report.requests.filter(r=>r.width===width&&r.mode==='normal'&&r.stage==='actions-local').length,0);
    pass('suppression locale : aucune API, sources et clé tierce conservées',{width});
    await noOverflow(page,width,'after-delete');
  } finally {await context.close();}
}
async function errorScenario(mode) {
  const {context,page,state}=await contextFor(390,mode);
  try {
    const panel=await openPanel(page); state.stage='actions-storage-error';
    const status=panel.getByRole('status').first();
    assert.equal(await status.getAttribute('aria-live'),'polite');
    assert.match(await status.innerText(),mode==='corrupt'||mode==='future'?/invalid|newer version/i:mode==='write-error'?/No saved groups/i:/Memory only/i);
    await create(panel,'QA unsaved');
    assert.match(await status.innerText(),/memory only|not saved/i);
    assert.equal(await page.evaluate(k=>localStorage.getItem(k),sentinel),'preserve-me');
    if(mode==='corrupt') assert.equal(await page.evaluate(k=>localStorage.getItem(k),key),'{broken');
    if(mode==='future') assert.equal(JSON.parse(await page.evaluate(k=>localStorage.getItem(k),key)).schemaVersion,999);
    if(mode==='write-error') assert.equal(await page.evaluate(k=>localStorage.getItem(k),key),null);
    assert.equal(report.requests.filter(r=>r.mode===mode&&r.stage==='actions-storage-error').length,0);
    await noOverflow(page,390,mode);
    const shot=path.join(work,`groups-${mode}.png`); await panel.screenshot({path:shot}); report.screenshots.push(path.relative(root,shot));
    pass('stockage invalide/indisponible : message accessible non-persisté et isolation',{mode,message:await status.innerText()});
  } finally {await context.close();}
}
main().catch(e=>{report.status=report.status==='NOT_EXECUTED'?'NOT_EXECUTED':'FAIL';report.failure=e.stack;process.exitCode=1;}).finally(async()=>{
  if(browser) await browser.close();
  report.finishedAt=new Date().toISOString(); report.exitCode=process.exitCode||0;
  const redPath=path.join(work,'result-delete-red.json');
  if(fs.existsSync(redPath) && !process.argv.includes('--delete-red') && !selectedFix) {
    const red=JSON.parse(fs.readFileSync(redPath,'utf8'));
    report.knownRegression={id:'P3_DELETE_SELECTED_ORPHAN_STATUS',status:'RED_REPRODUCED_PENDING_PRODUCTION_FIX',evidence:'.tmp/local-groups-browser-qa/result-delete-red.json',exitCode:red.exitCode,observation:red.selectedDeleteObservation};
    if(report.status==='PASS') report.status='PASS_WITH_KNOWN_REGRESSION';
  }
  report.requestSummary=report.requests.reduce((out,r)=>{const k=`${r.width} ${r.mode} ${r.stage} ${r.method} ${r.path}`;out[k]=(out[k]||0)+1;return out;},{});
  fs.mkdirSync(path.dirname(proof),{recursive:true}); fs.writeFileSync(proof,JSON.stringify(report,null,2));
  fs.writeFileSync(path.join(work,selectedFix ? 'result-delete-green.json' : 'result.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({status:report.status,checks:report.checks.length,exitCode:report.exitCode,failure:report.failure},null,2));
});
