import fs from 'node:fs';import {api} from './ledger-audit.mjs';
const r=await api('/values:batchGet?'+["'Recap Portfolio'!A1:A1501","'Recap Portfolio'!CA1:CA1501"].map(x=>'ranges='+encodeURIComponent(x)).join('&'));
const f=await api('/values/'+encodeURIComponent("'Recap Portfolio'!CA2:CA146")+'?valueRenderOption=FORMULA');
const names=r.valueRanges[0].values||[];const values=r.valueRanges[1].values||[];
fs.mkdirSync('D:/ProjetIA/WCORE/.tmp/ledger-audit',{recursive:true});fs.writeFileSync('D:/ProjetIA/WCORE/.tmp/ledger-audit/recap-before-'+Date.now()+'.json',JSON.stringify({names,values,formulas:f.values},null,2));
const actions=[];for(let i=1;i<names.length;i++){const name=names[i]?.[0];if(name?.endsWith(' Action'))actions.push({row:i+1,name,result:values[i]?.[0],readsH:String(f.values?.[i-1]?.[0]).includes('H2:H500')});}
console.log(JSON.stringify({fixtures:names.filter(x=>String(x[0]).startsWith('ZZ_')).length,formulaCount:f.values?.filter(x=>String(x[0]).startsWith('=')).length,errors:values.filter(x=>String(x[0]).startsWith('#')).length,actions},null,2));
