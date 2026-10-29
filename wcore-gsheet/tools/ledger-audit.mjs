// Audit local : sortie agregee uniquement, snapshot prive hors transfert.
import fs from 'node:fs';
import crypto from 'node:crypto';
const cfg=JSON.parse(fs.readFileSync('C:/Users/strau/.config/gsheets-mcp/service-account.json','utf8'));
const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const now=Math.floor(Date.now()/1000);
const data=b64({alg:'RS256',typ:'JWT'})+'.'+b64({iss:cfg.client_email,scope:'https://www.googleapis.com/auth/spreadsheets',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
const assertion=data+'.'+crypto.sign('RSA-SHA256',Buffer.from(data),cfg.private_key).toString('base64url');
const auth=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion})}).then(r=>r.json());
if(!auth.access_token)throw new Error('Auth Google indisponible');
export async function api(route,body,spreadsheetId='1kxidZZoEM6fXubFpp54fKvzJeXFCSCWCfyMTPNwYRB4'){const r=await fetch('https://sheets.googleapis.com/v4/spreadsheets/'+spreadsheetId+route,{method:body?'POST':'GET',headers:{authorization:'Bearer '+auth.access_token,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});if(!r.ok)throw new Error('Sheets HTTP '+r.status);return r.json();}
export async function audit() {
const meta=await api('?fields=sheets.properties');
const sheets=meta.sheets.map(s=>s.properties).filter(s=>s.title.startsWith('Ledger -'));
const entries=[];
for(let start=0;start<sheets.length;start+=12){const batch=sheets.slice(start,start+12);const qs=render=>'/values:batchGet?valueRenderOption='+render+'&'+batch.map(s=>'ranges='+encodeURIComponent("'"+s.title+"'!B2:J"+s.gridProperties.rowCount)).join('&');const vals=await api(qs('FORMATTED_VALUE'));const formulas=await api(qs('FORMULA'));for(let i=0;i<batch.length;i++){const rows=vals.valueRanges[i].values||[];const f=formulas.valueRanges[i].values||[];const action=batch[i].title.endsWith(' Action');const vc=action?8:6;const tokens=rows.slice(1).filter(r=>r[0]&&!/^(INFO(?:_|$)|META|last_|script_|web_|exec_)/.test(r[0])&&r[3]!==undefined&&r[3]!=='');entries.push({title:batch[i].title,rowCount:batch[i].gridProperties.rowCount,tokens:tokens.length,uncovered:tokens.filter(r=>!r[vc]).length,errors:rows.filter(r=>r.some(x=>/^#(?:REF!|ERROR!|VALUE!|N\/A)/.test(String(x)))).length,fx:rows.find(r=>r[0]==='INFO_FX')?.[1]||null,formulas:f.map((r,j)=>({row:j+2,value:r[vc]})).filter(r=>String(r.value||'').startsWith('='))});}}
fs.mkdirSync('D:/ProjetIA/WCORE/.tmp/ledger-audit',{recursive:true});fs.writeFileSync('D:/ProjetIA/WCORE/.tmp/ledger-audit/audit-'+Date.now()+'.json',JSON.stringify(entries,null,2));
console.log(JSON.stringify({examined:entries.length,tokens:entries.reduce((s,e)=>s+e.tokens,0),uncovered:entries.reduce((s,e)=>s+e.uncovered,0),errors:entries.reduce((s,e)=>s+e.errors,0),fxNA:entries.filter(e=>e.fx?.includes('N/A')).length,bounded:entries.filter(e=>e.formulas.length<10).map(e=>({title:e.title,formulas:e.formulas})),snapshot:'local .tmp/ledger-audit/before.json'},null,2));

return entries;
}
if (process.argv[1]?.endsWith('ledger-audit.mjs')) await audit();
