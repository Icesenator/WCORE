import fs from 'node:fs';import vm from 'node:vm';import {api} from './ledger-audit.mjs';
const c={Logger:{log(){}}};vm.createContext(c);vm.runInContext(fs.readFileSync(new URL('../src/17_LISTING.gs',import.meta.url),'utf8'),c);
const names=await api('/values/'+encodeURIComponent("'Recap Portfolio'!A2:A146"));const before=await api('/values/'+encodeURIComponent("'Recap Portfolio'!CA2:CA146")+'?valueRenderOption=FORMULA');
fs.writeFileSync('D:/ProjetIA/WCORE/.tmp/ledger-audit/recap-pre-source-repair-'+Date.now()+'.json',JSON.stringify(before,null,2));
const data=[];for(let i=0;i<names.values.length;i++){const name=names.values[i]?.[0];if(!name?.endsWith(' Action'))continue;const h=await api('/values/'+encodeURIComponent(`'${name}'!A2:J2`));if(h.values?.[0]?.[9]!=='Vérif')throw new Error('Schema Action inconnu');data.push({range:`'Recap Portfolio'!CA${i+2}`,values:[[c._recapPortfolioVerifRowFormula_(i+2)]]});}
await api('/values:batchUpdate',{valueInputOption:'USER_ENTERED',data});
const after=await api('/values/'+encodeURIComponent("'Recap Portfolio'!CA2:CA146")+'?valueRenderOption=FORMULA');const vals=await api('/values/'+encodeURIComponent("'Recap Portfolio'!CA2:CA146"));
for(const d of data){const row=Number(d.range.match(/CA(\d+)/)[1]);if(after.values[row-2][0]!==d.values[0][0])throw new Error('Formule non conforme');}
console.log(JSON.stringify({actionFormulasVerified:data.length,errors:vals.values.filter(x=>String(x[0]).startsWith('#')).length,otherColumnsUntouched:true}));
