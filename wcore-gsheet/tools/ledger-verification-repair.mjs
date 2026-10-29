import fs from 'node:fs';
import {api} from './ledger-audit.mjs';
import helper from '../../scripts/ledger-verification-formula.cjs';
const snapshot=JSON.parse(fs.readFileSync('D:/ProjetIA/WCORE/.tmp/ledger-audit/before.json','utf8'));
const targets=['Ledger - Peaq','Ledger - Robinhood Chain Crypto','Ledger - Base Crypto','Ledger - Solana Action'];
const requests=[];
for(const title of targets){const e=snapshot.find(x=>x.title===title);if(!e)throw new Error('Snapshot absent');const col=title.endsWith(' Action')?'J':'H';const f=e.formulas[0]?.value;if(!f?.includes('SUMPRODUCT'))throw new Error('Formule inconnue '+title);const live=await api('/values/'+encodeURIComponent("'"+title+"'!"+col+'3:'+col+e.rowCount)+'?valueRenderOption=FORMULA');const cells=live.values||[];if(cells.some((r,i)=>r[0]&&!String(r[0]).includes('SUMPRODUCT')&&!(i===0&&String(r[0]).startsWith('=MAP(A3:A;B3:B;D3:D;E3:E;F3:F;LAMBDA'))))throw new Error('Preuve inconnue dans colonne '+title);for(let row=3;row<=e.rowCount;row++)requests.push({range:"'"+title+"'!"+col+row,values:[[row===3?helper.legacyVerificationFormula(title.endsWith(' Action')?'Portefeuille Action Details':'Portefeuille Crypto Details',col):'']]});}
fs.writeFileSync('D:/ProjetIA/WCORE/.tmp/ledger-audit/repair-manifest.json',JSON.stringify({targets,requests},null,2));
if(process.argv.includes('--apply')){await api('/values:batchUpdate',{valueInputOption:'USER_ENTERED',data:requests});console.log('FORMULAS_REPAIRED=4 ; pas de refresh');}else console.log('DRY_RUN_VALIDATED=4 ; utiliser --apply');
