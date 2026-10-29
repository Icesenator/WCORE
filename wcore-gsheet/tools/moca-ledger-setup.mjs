import {api} from './ledger-audit.mjs';import pulse from '../../scripts/ledger-pulse-time.cjs';import helper from '../../scripts/ledger-verification-formula.cjs';
const meta=await api('?fields=sheets.properties');if(meta.sheets.some(x=>x.properties.title==='Ledger - Moca Chain'))throw new Error('Ledger existe : inventorier avant mutation');
const source=await api('/values/'+encodeURIComponent("'Ledger - Arc'!A1:K2")+'?valueRenderOption=FORMULA');
const formula=source.values?.[1]?.[0];if(!String(formula).includes('ARC'))throw new Error('Template canonique Arc absent');
const add=await api(':batchUpdate',{requests:[{addSheet:{properties:{title:'Ledger - Moca Chain',gridProperties:{rowCount:1000,columnCount:27,frozenRowCount:2}}}}]});
const rows=source.values.map(r=>r.map(v=>typeof v==='string'?v.replaceAll('ARC','MOCA'):v));rows[0][0]=false;rows[0][1]=pulse.formatLedgerPulse(Date.now());rows[0][2]=false;
await api('/values:batchUpdate',{valueInputOption:'USER_ENTERED',data:[{range:"'Ledger - Moca Chain'!A1:K2",values:rows},{range:"'Ledger - Moca Chain'!H3",values:[[helper.legacyVerificationFormula('Portefeuille Crypto Details')]]}]});
console.log(JSON.stringify({ledgerCreated:true,source:'Ledger - Arc canonical formulas',sheetIdAlias:'MOCA_LEDGER',privateWalletNotLogged:true}));
