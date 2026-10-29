import fs from 'node:fs';
import {api} from './ledger-audit.mjs';
const dir='D:/ProjetIA/WCORE/.tmp/ledger-audit';
const snap=JSON.parse(fs.readFileSync(dir+'/before.json','utf8'));
const titles=['Ledger - Robinhood Chain Crypto','Ledger - Base Crypto','Ledger - Peaq','Ledger - Solana Action'];
const backup=[];const data=[];
for(const title of titles){
 const e=snap.find(e=>e.title===title);if(!e)throw new Error('Snapshot absent');
 const col=title.endsWith(' Action')?'J':'H';const range=`'${title}'!${col}3:${col}${e.rowCount}`;
 const live=await api('/values/'+encodeURIComponent(range)+'?valueRenderOption=FORMULA');
 if(!(String(live.values?.[0]?.[0]).startsWith('=LET(')||String(live.values?.[0]?.[0]).startsWith('=MAP(')))throw new Error('Ancre concurrente inconnue '+title);
 backup.push({title,range,values:live.values});
 const original=e.formulas[0]?.value;if(!original?.includes('SUMPRODUCT'))throw new Error('Formule originale inconnue');
 // Restituer la couverture precedente ; étendre Peaq/Solana au même plafond existant, sans faux V.
 const last=Math.max(...e.formulas.map(f=>f.row),title.includes('Peaq')||title.includes('Solana')?e.rowCount:3);
 const rows=Array.from({length:last-2},(_,i)=>[original.replace(/\b([A-G])3\b/g,(_,c)=>c+(i+3))]);
 data.push({range:`'${title}'!${col}3:${col}${last}`,values:rows});
}
fs.writeFileSync(dir+'/regression-before-rollback-'+Date.now()+'.json',JSON.stringify(backup,null,2));
await api('/values:batchUpdate',{valueInputOption:'USER_ENTERED',data});
const report=[];
for(const title of titles){const action=title.endsWith(' Action');const r=await api('/values/'+encodeURIComponent(`'${title}'!A3:J1001`));const rows=r.values||[];const tokens=rows.filter(x=>x[1]&&!/^(INFO_|META|last_|script_|web_|exec_)/.test(x[1])&&x[4]!==undefined&&x[4]!=='');const missing=tokens.filter(x=>!['V','X'].includes(x[action?9:7]));report.push({title,eligible:tokens.length,missing:missing.length,errors:rows.filter(x=>x.some(v=>/^#/.test(String(v)))).length});}
console.log(JSON.stringify(report,null,2));
if(report.some(x=>x.missing||x.errors))process.exitCode=1;
