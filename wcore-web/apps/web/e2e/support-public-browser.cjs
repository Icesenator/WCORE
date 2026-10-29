/* QA locale isolée ; APIs synthétiques, aucun wallet ni service externe. */
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium } = require('@playwright/test');
const root='D:/ProjetIA/WCORE';
const runtime=JSON.parse(fs.readFileSync(root+'/.tmp/local-groups-browser-qa/runtime.json','utf8'));
const base=`http://127.0.0.1:${runtime.port}`;
const report={startedAt:new Date().toISOString(),checks:[],errors:[],mutations:[],externalBlocked:[],limits:['Auth et tickets mockés ; aucune preuve de permissions ou de suivi GitHub.', 'QA locale non déployée.']};
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-extensions','--disable-background-networking']});
 try {
  for(const width of [1440,390]) for(const language of ['fr','en']) for(const auth of [false,true]) {
   const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
   await context.addInitScript(({language,auth})=>{localStorage.setItem('wcore_language',language);if(auth)localStorage.setItem('wcore_address','0x00000000000000000000000000000000000000a1');},{language,auth});
   await context.route('**/*',async route=>{
    const req=route.request(),u=new URL(req.url());
    if(u.pathname.startsWith('/api/')){
     if(req.method()!=='GET')report.mutations.push({path:u.pathname,method:req.method()});
     if(u.pathname==='/api/auth/me')return route.fulfill({status:auth?200:401,json:auth?{address:'0x00000000000000000000000000000000000000a1'}:{error:'UNAUTHENTICATED'}});
     if(u.pathname==='/api/tickets')return route.fulfill({json:{tickets:[]}});
     return route.fulfill({json:{}});
    }
    if(u.origin===base)return route.continue();
    report.externalBlocked.push(u.origin);return route.abort();
   });
   await context.routeWebSocket('**/*',ws=>{if(ws.url().startsWith(base.replace('http:','ws:')))ws.connectToServer();else ws.close();});
   const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
   await page.goto(base+'/support',{waitUntil:'domcontentloaded',timeout:120000});
   if(auth){
    await page.getByRole('heading',{name:'Create a ticket',exact:true}).waitFor();
    assert.equal(await page.getByPlaceholder('Title').count(),1);
    assert.equal(await page.getByRole('button',{name:'Submit ticket',exact:true}).isDisabled(),true);
    await page.getByPlaceholder('Title').fill('Synthetic QA');
    await page.getByPlaceholder('Describe the issue or request...').fill('Synthetic local report, never submitted');
    assert.equal(await page.getByRole('button',{name:'Submit ticket',exact:true}).isEnabled(),true);
   }else{
    const heading=language==='fr'?'Informations utiles au signalement':'Useful report details';
    await page.getByRole('heading',{name:heading,exact:true}).waitFor();
    const main=page.locator('main');const text=await main.innerText();
    assert.match(text,language==='fr'?/Facultatif/:/Optional/);
    assert.match(text,language==='fr'?/non vérifiés/:/not verified/);
    const link=main.locator('a[href="https://github.com/Icesenator/WCORE/issues"]');
    assert.equal(await link.count(),1);
    await link.focus();assert.equal(await link.evaluate(el=>el===document.activeElement),true);
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(()=>document.activeElement?.tagName==='BUTTON'),true);
   }
   const dimensions=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(dimensions.scroll<=width);
   report.checks.push({width,language,auth,status:'PASS',horizontalOverflow:false});
   await context.close();
  }
  // Le shell authentifié demande un stream-token mocké ; ce n'est pas un ticket soumis.
  assert.ok(report.mutations.every(r=>r.path==='/api/notifications/stream-token' && r.method==='POST'));
  report.ticketMutations=report.mutations.filter(r=>r.path.startsWith('/api/tickets')).length;
  report.liveMutations=0;
  assert.equal(report.ticketMutations,0);assert.equal(report.errors.length,0);
  report.status='PASS';
 }finally{await browser.close();report.finishedAt=new Date().toISOString();fs.writeFileSync(root+'/docs/reference/support-public-browser-2026-10-22.json',JSON.stringify(report,null,2));}
 console.log(JSON.stringify(report));
})().catch(e=>{console.error(e);process.exitCode=1;});
