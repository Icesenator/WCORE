const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../src/41_KRAKEN_SYNC.gs'),'utf8');
function fixture(failAt) {
  const cells=[['','','','','','','','', 'OK'],['cryptocoin_symbol','balance','','','','','','hold_trade'],['AAPLx',3,'','','','','',1],['MUx',2,'','','','','',0.5]];
  let mutations=0; const trace=[];
  const range=(r,c,n=1,m=1)=>({ getValues:()=>Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>cells[r+i-1]?.[c+j-1]??'')), setValue(value){return this.setValues([[value]]);},setValues(values){ mutations++; trace.push({r,c,values}); if(mutations===failAt)throw Error('synthetic-interruption'); values.forEach((row,i)=>row.forEach((v,j)=>{cells[r+i-1]??=[];cells[r+i-1][c+j-1]=v;})); return this; },clearContent(){return this.setValues(Array.from({length:n},()=>Array(m).fill('')));} });
  const sheet={getName:()=> 'CEX - Kraken Stocks',getLastRow:()=>cells.length,getMaxRows:()=>100,getMaxColumns:()=>17,getRange:range};
  const ctx=vm.createContext({Utilities:{formatDate:()=> 'date'}});vm.runInContext(code,ctx);
  ctx._krakenFetchXStockPricesUsd_=()=>({});
  ctx._cexComputeAndAppendTotal_=()=>{
    assert.equal(cells[0][8],'UNKNOWN'); assert.equal(cells[2][7],'');
    cells[2][0]='MUx';cells[2][1]=2;cells[3][0]='AAPLx';cells[3][1]=3;
    if(failAt==='writer')throw Error('synthetic-writer');
  };
  const snapshot={collectedAt:Date.now(),balance:{status:'OK',AAPLx:{balance:3,hold_trade:1},MUx:{balance:2,hold_trade:0.5}},orders:{status:'OK',_xstockCount:0}};
  return {ctx,cells,sheet,trace,snapshot};
}
test('writer commun réordonné : hold remappé exact après A:G, OK écrit en dernier',()=>{
 const h=fixture();h.ctx._krakenWriteSheet_({getSheetByName:()=>h.sheet},'CEX - Kraken Stocks',[['AAPLx',3],['MUx',2]],h.snapshot);
 assert.equal(h.cells[2][7],0.5);assert.equal(h.cells[3][7],1);assert.equal(h.cells[0][8],'OK');
 assert.equal(h.trace.at(-1).c,9);assert.equal(h.trace.at(-1).values[0][0],'OK');
});
for(const failure of ['writer',3,4,5])test('interruption '+failure+' : jamais OK courant avec holds partiels',()=>{
 const h=fixture(failure);assert.throws(()=>h.ctx._krakenWriteSheet_({getSheetByName:()=>h.sheet},'CEX - Kraken Stocks',[['AAPLx',3]],h.snapshot));
 assert.notEqual(h.cells[0][8],'OK');
});
test('snapshot périmé ou méta inconnue : UNKNOWN/STALE, aucun hold frais',()=>{
 for(const kind of ['stale','unknown']){const h=fixture();if(kind==='stale')h.snapshot.collectedAt=1;else h.snapshot.orders.status='UNKNOWN';
 h.ctx._krakenWriteSheet_({getSheetByName:()=>h.sheet},'CEX - Kraken Stocks',[['AAPLx',3]],h.snapshot);
 assert.notEqual(h.cells[0][8],'OK'); assert.equal(h.cells[2][7],'');}
});
test('formules locales E/F exacts, crédit exclu, L jamais modifiée',()=>{
 const h=fixture();const f=h.ctx._krakenStocksDetailsFormulas_(2);
 assert.deepEqual(Object.keys(f),['H','J','K']);
 assert.match(f.K,/EXACT\(\$E2;/);assert.match(f.K,/EXACT\(.+\$A\$3:\$A;\$F2\)/);
 assert.match(f.J,/\$I\$1="OK"/);assert.match(f.H,/K2-J2/);
});
