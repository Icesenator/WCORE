import {api} from './ledger-audit.mjs';
const m=await api('?fields=sheets.properties');
const sheets=m.sheets.map(x=>x.properties).filter(x=>/^ZZ_VALIDATION_LEDGER_VERIF_\d+$/.test(x.title));
if(sheets.length)await api(':batchUpdate',{requests:sheets.map(s=>({deleteSheet:{sheetId:s.sheetId}}))});
console.log('FIXTURES_OWNED_REMOVED='+sheets.length);
