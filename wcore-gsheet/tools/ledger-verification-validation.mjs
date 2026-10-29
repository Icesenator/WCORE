import {api} from './ledger-audit.mjs';import helper from '../../scripts/ledger-verification-formula.cjs';
const title='ZZ_VALIDATION_LEDGER_VERIF_'+Date.now();
const added=await api(':batchUpdate',{requests:[{addSheet:{properties:{title,gridProperties:{rowCount:150,columnCount:10}}}}]});const gid=added.replies[0].addSheet.properties.sheetId;
try {
  const values=Array.from({length:80},(_,i)=>['Ledger - Validation','TOKEN_'+i,'Synthetic','test_'+i,1,'']);
  await api('/values:batchUpdate',{valueInputOption:'USER_ENTERED',data:[{range:`'${title}'!A3:F82`,values},{range:`'${title}'!H3`,values:[[helper.legacyVerificationFormula('Portefeuille Crypto Details')]]}]});
  let r=await api('/values/'+encodeURIComponent(`'${title}'!H3:H82`));
  if(r.values?.length!==80 || r.values.some(x=>x[0]!=='V'))throw new Error('Extension fixture non couverte');
  await api('/values:batchUpdate',{valueInputOption:'RAW',data:[{range:`'${title}'!A83:F83`,values:[['Ledger - Validation','ADDED','Synthetic','test_added',1,'']]},{range:`'${title}'!E4`,values:[['']]}]});
  r=await api('/values/'+encodeURIComponent(`'${title}'!H3:H83`));
  if(r.values?.[1]?.[0] || r.values?.[80]?.[0]!=='V')throw new Error('Ajout/suppression decale');
  await api(':batchUpdate',{requests:[{sortRange:{range:{sheetId:gid,startRowIndex:2,endRowIndex:83,startColumnIndex:0,endColumnIndex:6},sortSpecs:[{dimensionIndex:1,sortOrder:'DESCENDING'}]}}]});
  r=await api('/values/'+encodeURIComponent(`'${title}'!A3:J83`));
  if(r.values.some(x=>x.some(v=>String(v).startsWith('#'))))throw new Error('Erreur formule fixture');
  console.log('SHEETS_FIXTURE=PASS : 80 tokens, extension 81, suppression, tri, MAP dynamique sans erreur');
} finally {await api(':batchUpdate',{requests:[{deleteSheet:{sheetId:gid}}]});console.log('TEMP_FIXTURE_REMOVED=YES (onglet créé par ce script uniquement)');}
