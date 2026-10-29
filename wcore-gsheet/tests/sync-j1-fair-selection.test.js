const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'../src/16_REFRESH.gs'),'utf8');
function load(persisted=new Map()){const max=Number((src.match(/SYNC_J1_MAX_SYNCS_PER_RUN\s*=\s*(\d+)/)||[])[1]);assert.ok(max>0);const props=persisted;
 const c={SYNC_J1_MAX_SYNCS_PER_RUN:max,LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k),setProperty:(k,v)=>props.set(k,v)})},_props:props,_max:max};
 vm.createContext(c);for(const n of ['_wd_selectFairJ1Actions_','_wd_applyJ1Actions_']){const s=src.indexOf('function '+n+'(');assert.ok(s>=0,n);const e=src.indexOf('\n}',s);vm.runInContext(src.slice(s,e+2),c);}
 const original=c._wd_selectFairJ1Actions_;c._wd_selectFairJ1Actions_=(a,t,k,st)=>original(a,t,k,st);return c;}
function addRealFunctions(c,names){for(const name of names){const start=src.indexOf('function '+name+'(');assert.ok(start>=0,name);const end=src.indexOf('\n}',start);vm.runInContext(src.slice(start,end+2),c);}}
const mk=n=>Array.from({length:n},(_,i)=>({sheet:'S'+i,fairnessIndex:i}));
function unlockable(){const c=load();c.LockService={getScriptLock:()=>({tryLock:()=>false,releaseLock:()=>{}})};return c;}
const build=()=>load();
test('borne dure : 50 candidats -> exactement20 retenus, 30 marqués non traités',()=>{const c=build(),stats={};const out=c._wd_selectFairJ1Actions_(mk(50),50,'CUR',stats);assert.equal(out.length,c._max);assert.equal(stats.skippedSync,50-c._max);});
test('curseur persistant et équité : chaque feuille finit traitée, jamais 2x de suite',()=>{const c=build();const seen=new Set();let previous=null;for(let pass=0;pass<4;pass++){const out=c._wd_selectFairJ1Actions_(mk(50),50,'CUR',{});assert.equal(out.length,c._max);assert.notDeepEqual(out.map(a=>a.sheet),previous);previous=out.map(a=>a.sheet);out.forEach(a=>seen.add(a.sheet));}assert.equal(seen.size,50,'toutes les feuilles ont été servies sur quatre passes');});
test('moins de candidats que la borne : tous retenus sans dépassement',()=>{const c=build();const out=c._wd_selectFairJ1Actions_(mk(7),7,'CUR',{});assert.equal(out.length,7);});
test('entrées dégénérées : liste vide, totalRows0 ou curseur hors bornes retombent à zéro sans planter',()=>{const c=build();assert.equal(c._wd_selectFairJ1Actions_([],0,'CUR',{}).length,0);assert.equal(c._wd_selectFairJ1Actions_(mk(5),0,'CUR',{}).length,0);c._props.set('CUR','99999');const out=c._wd_selectFairJ1Actions_(mk(5),5,'CUR',{});assert.equal(out.length,5);});
test('verrou indisponible : aucune écriture, aucune sélection, état signalé',()=>{const c=unlockable(),stats={};const out=c._wd_selectFairJ1Actions_(mk(10),10,'CUR',stats);assert.equal(out.length,0);assert.equal(stats.j1ClaimBusy,true);assert.equal(c._props.has('CUR'),false);});
function applyHarness({apiFails=false,missingSheets=[]}={}){
 const c=load();const writes=[],sets=[];
 c.Sheets={Spreadsheets:{Values:{}}};
 c._wd_addApiWrite_=(arr,sheet,range,value)=>{if(apiFails)throw Error('batch unavailable');arr.push({sheet,range,value});};
 c._wd_flushApiWrites_=(arr)=>{writes.push(...arr);return arr.length;};
 c._wd_rollbackPulseReservations_=()=>({errors:0});
 c._mk=(name)=>{if(missingSheets.includes(name))return null;return {getRange:()=>({setValue:v=>sets.push({name,value:v}),setNumberFormat:()=>{}})};};
 const ss={getSheetByName:name=>c._mk(name)};
 return {c,run:a=>c._wd_applyJ1Actions_(ss,a),writes,sets,apiWrites:()=>writes};
}
const act=(name,i,value)=>({sheetName:name,value,fairnessIndex:i});
test('application : exactement une écriture par action retenue, jamais au-delà de la borne',()=>{
 const h=applyHarness();const out=h.run(Array.from({length:50},(_,i)=>act('S'+i,i,'2026-01-01')));assert.equal(out.synced,20);assert.equal(out.batch,true);assert.equal(h.writes.length,20);assert.deepEqual([...new Set(h.writes.map(w=>w.range))],['J1']);});
test('application : repli par feuille si le lot échoue, erreurs comptées sans être masquées',()=>{
 const h=applyHarness({apiFails:true,missingSheets:['S1']});const out=h.run([act('S0',0,'a'),act('S1',1,'b'),act('S2',2,'c')]);assert.equal(out.batch,false);assert.equal(out.synced,2);assert.equal(out.errors,1);assert.equal(h.sets.length,2);assert.deepEqual(h.sets.map(s=>s.name),['S0','S2']);});
test('application : lot vide ou absent => aucune écriture',()=>{const h=applyHarness();for(const input of [[],null,undefined]){const out=h.run(input);assert.equal(out.synced,0);assert.equal(out.batch,false);}assert.equal(h.writes.length,0);assert.equal(h.sets.length,0);});

test('redémarrage VM : reprise exacte depuis le curseur persisté, sans reset quotidien',()=>{
 const props=new Map();const first=load(props)._wd_selectFairJ1Actions_(mk(50),50,'CUR',{});
 assert.equal(props.get('CUR'),'20');const restarted=load(props);
 const second=restarted._wd_selectFairJ1Actions_(mk(50),50,'CUR',{});
 assert.equal(second[0].fairnessIndex,20);assert.equal(first[0].fairnessIndex,0);
 assert.equal(props.get('CUR'),'40');
});
test('pas de compteur quotidien dans le sélecteur : une même feuille reste éligible à chaque passe',()=>{
 const c=load();for(let i=0;i<25;i++)assert.equal(c._wd_selectFairJ1Actions_(mk(1),1,'CUR',{}).length,1);
 assert.deepEqual([...c._props.keys()],['CUR']);
});
test('persistance indisponible : zéro sélection et verrou libéré',()=>{
 const c=load();let releases=0;c.LockService={getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>releases++})};
 c.PropertiesService={getScriptProperties:()=>({getProperty:()=>null,setProperty:()=>{throw Error('storage unavailable');}})};
 const stats={};assert.equal(c._wd_selectFairJ1Actions_(mk(50),50,'CUR',stats).length,0);
 assert.equal(stats.stateErrors,1);assert.equal(releases,1);
});
test('A2 persistante : le bump est conservé et ne provoque pas une boucle inter-exécutions',()=>{
 const rows=[{name:'Ledger A',i1:'2026-10-14 10:00:00',j1:'2026-10-14 10:00:00',b1:'',a2:'#ERROR!'}];
 const h=syncHarness(rows),c=h.c;
 addRealFunctions(c,['_wd_collectGlobalRefreshActions_','_wd_shouldSyncJ1_','_wd_bumpTimestampSeconds_']);
 Object.assign(c,{P_WD_J1_CURSOR:'WD_J1_CURSOR',WD_PULSE_MIN:30,WD_PULSE_MIN_BLOCKED:30,WD_CYCLE_SLOTS_PER_RUN:2,WD_MAX_PULSES_PER_RUN:10,
 _wd_loadWebBackoff_:()=>({}),_wd_isSystemBlocked_:()=>({blocked:false}),_wd_webErrorDecision_:()=>({allowed:false}),
 _wd_needsRefresh_:()=>({needsPulse:false}),_wd_shouldPulseB1_:()=>false,_wd_confirmA2Error_:()=>true,
 _wd_reservePulseStates_:actions=>({actions,errors:0})});
 addRealFunctions(c,['_wd_fmtDate_']);
 for(let pass=0;pass<2;pass++){
  const actions=c._wd_collectGlobalRefreshActions_([{name:rows[0].name,vA2:'#ERROR!',vI1:rows[0].i1,vJ1:rows[0].j1,vB1:''}],Date.parse('2026-10-14T12:00:00Z'),3600000,'2026-10-14 12:00:00',{},[]);
  assert.equal(actions.length,pass===0?1:0);
  if(pass===0){assert.equal(actions[0].reason,'a2_error_recalc');assert.equal(actions[0].value,'2026-10-14 10:00:01');rows[0].j1=actions[0].value;}
  assert.equal(h.run().synced,0);assert.equal(rows[0].j1,'2026-10-14 10:00:01');
 }
});
function syncHarness(rows,persisted=new Map()){ 
 const c=load(persisted),writes=[];
 addRealFunctions(c,['SYNC_J1_ALL_SHEETS','_wd_norm_','_wd_extractTimestamp_','_wd_j1LatchValue_',
 '_wd_isUnsafeLatchSource_','_wd_isLastUpdateFormat_','_wd_parseLocalDateTimeToMs_','_wd_isCexSheet_',
 '_wd_a2NeedsRecalc_','_wd_bumpTimestampSeconds_','_wd_fmtDate_']);
 c.P_SYNC_J1_CURSOR='SYNC_J1_CURSOR';
 const recap={getLastRow:()=>rows.length+1,getRange:(r,col)=>({getValues:()=>rows.map(x=>[({1:x.name,4:x.b1,6:x.i1,7:x.j1})[col]])})};
 c._wcoreGetSpreadsheet_=()=>({getSheetByName:name=>name==='Recap Portfolio'?recap:{getRange:cell=>({
 getValue:()=>{const row=rows.find(x=>x.name===name);return cell==='A2'?(row.a2??'healthy'):row.b1;},
 setValue:value=>{assert.equal(cell,'J1');rows.find(x=>x.name===name).j1=value;writes.push({name,value});},setNumberFormat:()=>{}})}});
 return {c,writes,run:()=>c.SYNC_J1_ALL_SHEETS()};
}
test('appelant réel : 50 feuilles puis zéro réécriture après convergence, même après redémarrage',()=>{
 const rows=Array.from({length:50},(_,i)=>({name:'Ledger '+i,i1:'WEB_SCAN_OK 2026-10-14 10:00:00',j1:'',b1:''}));
 const props=new Map(),h=syncHarness(rows,props);for(let i=0;i<3;i++)assert.ok(h.run().synced<=20);
 assert.equal(h.writes.length,50);assert.equal(new Set(h.writes.map(x=>x.name)).size,50);
 assert.equal(h.run().synced,0);assert.equal(syncHarness(rows,props).run().synced,0);
});
test('appelant réel : deux feuilles indépendantes, changement de date sans reset ni écriture inutile',()=>{
 const rows=[{name:'Ledger A',i1:'2026-10-14 23:59:00',j1:'',b1:''},{name:'Ledger B',i1:'2026-10-14 23:59:00',j1:'',b1:''}];
 const h=syncHarness(rows);assert.equal(h.run().synced,2);assert.equal(h.run().synced,0);
 rows[0].i1='2026-10-15 00:01:00';assert.equal(h.run().synced,1);assert.equal(h.writes.at(-1).name,'Ledger A');
 assert.equal(rows[1].j1,'2026-10-14 23:59:00');assert.equal(h.run().synced,0);
});
test('Recap A2 périmé mais feuille saine : aucun bump watchdog',()=>{
 const rows=[{name:'Ledger A',i1:'[CACHE_ONLY] 2026-10-13 10:00:00',j1:'2026-10-14 10:00:00',b1:'2026-10-14 10:00:00',a2:'healthy'}];
 const h=syncHarness(rows),c=h.c;addRealFunctions(c,['_wd_collectGlobalRefreshActions_','_wd_shouldSyncJ1_']);
 Object.assign(c,{P_WD_J1_CURSOR:'WD_J1_CURSOR',WD_PULSE_MIN:30,WD_PULSE_MIN_BLOCKED:30,WD_CYCLE_SLOTS_PER_RUN:2,WD_MAX_PULSES_PER_RUN:10,
 _wd_loadWebBackoff_:()=>({}),_wd_isSystemBlocked_:()=>({blocked:false}),_wd_webErrorDecision_:()=>({allowed:false}),
 _wd_needsRefresh_:()=>({needsPulse:false}),_wd_shouldPulseB1_:()=>false,_wd_readDirectB1_:()=>rows[0].b1,
 _wd_confirmA2Error_:()=>false,_wd_reservePulseStates_:actions=>({actions,errors:0})});
 const out=c._wd_collectGlobalRefreshActions_([{name:rows[0].name,vA2:'#ERROR!',vI1:rows[0].i1,vJ1:rows[0].j1,vB1:rows[0].b1}],Date.now(),3600000,'2026-10-14 12:00:00',{},[]);
 assert.equal(out.length,0);
});
test('A2 rétablie : latch normal repris une fois ; lecture inconnue : bump préservé',()=>{
 const rows=[{name:'Ledger A',i1:'2026-10-14 10:00:00',j1:'2026-10-14 10:00:01',b1:'',a2:'healthy'}];
 const h=syncHarness(rows);assert.equal(h.run().synced,1);assert.equal(h.run().synced,0);
 rows[0].j1='2026-10-14 10:00:01';const ss=h.c._wcoreGetSpreadsheet_();
 h.c._wcoreGetSpreadsheet_=()=>({getSheetByName:name=>name==='Recap Portfolio'?ss.getSheetByName(name):{getRange:()=>{throw Error('read unavailable');}}});
 const out=h.run();assert.equal(out.synced,0);assert.equal(out.errors,1);assert.equal(rows[0].j1,'2026-10-14 10:00:01');
});
test('concurrence : le verrou protège le curseur, pas toute la lecture-écriture du latch',()=>{
 const props=new Map();const a=load(props),b=load(props);
 const first=a._wd_selectFairJ1Actions_(mk(1),1,'CUR',{});
 const second=b._wd_selectFairJ1Actions_(mk(1),1,'CUR',{});
 assert.equal(first.length,1);assert.equal(second.length,1);
 // Des candidats lus avant application restent sélectionnables : aucune lease par feuille.
});
test('échec batch après écriture partielle : repli idempotent, seuls succès individuels comptés',()=>{
 const h=applyHarness({missingSheets:['S1']});let partial=0;
 h.c._wd_flushApiWrites_=()=>{partial++;throw Error('response unavailable after write');};
 const out=h.run([act('S0',0,'a'),act('S1',1,'b'),act('S2',2,'c')]);
 assert.equal(partial,1);assert.equal(out.synced,2);assert.equal(out.errors,1);assert.equal(h.sets.length,2);
});
test('Cas A : A2 persistante et I1 qui progresse -> un bump par valeur d I1, aucun plafond quotidien',()=>{
 const rows=[{name:'Ledger A',i1:'2026-10-14 09:00:00',j1:'2026-10-14 09:00:00',b1:''}];
 const h=syncHarness(rows),c=h.c;
 addRealFunctions(c,['_wd_collectGlobalRefreshActions_','_wd_shouldSyncJ1_','_wd_bumpTimestampSeconds_']);
 Object.assign(c,{P_WD_J1_CURSOR:'WD_J1_CURSOR',WD_PULSE_MIN:30,WD_PULSE_MIN_BLOCKED:30,WD_CYCLE_SLOTS_PER_RUN:2,WD_MAX_PULSES_PER_RUN:10,
 _wd_loadWebBackoff_:()=>({}),_wd_isSystemBlocked_:()=>({blocked:false}),_wd_webErrorDecision_:()=>({allowed:false}),
 _wd_needsRefresh_:()=>({needsPulse:false}),_wd_shouldPulseB1_:()=>false,_wd_confirmA2Error_:()=>true,
 _wd_reservePulseStates_:actions=>({actions,errors:0})});
 const call=(i1)=>{rows[0].i1=i1;return c._wd_collectGlobalRefreshActions_([{name:'Ledger A',vA2:'#ERROR!',vI1:i1,vJ1:rows[0].j1,vB1:''}],Date.parse('2026-10-14T12:00:00Z'),3600000,'2026-10-14 12:00:00',{},[]);};
 const steps=['2026-10-14 09:00:00','2026-10-14 10:00:00','2026-10-14 11:00:00'];let bumps=0;
 for(const i1 of steps){const a=call(i1);assert.equal(a.length,1,'chaque NOUVELLE valeur de I1 rejoue un bump');assert.equal(a[0].value,i1.slice(0,-2)+(String(Number(i1.slice(-2))+1).padStart(2,'0')));rows[0].j1=a[0].value;bumps++;}
 assert.equal(bumps,3,'3 valeurs de I1 => 3 bumps: idempotence par ETAT, pas un compteur/jour');
 const again=call(steps[2]);assert.equal(again.length,0,'I1 inchange => aucun nouveau bump (idempotence)');
 assert.deepEqual([...c._props.keys()],['WD_J1_CURSOR'],'seul le curseur est persiste, aucune cle de compteur quotidien');
});
test('Cas B : deux acteurs a snapshots decales ecrivent J1 sur la meme feuille (pas d exclusion mutuelle)',()=>{
 const base={name:'Ledger A',i1:'2026-10-14 10:00:00',j1:'',b1:''};
 const snapA=[{...base}],snapB=[{...base}]; // les deux lisent AVANT toute ecriture
 const a=syncHarness(snapA,new Map()),b=syncHarness(snapB,new Map());
 assert.equal(a.run().synced,1);assert.equal(b.run().synced,1);
 assert.equal(a.writes.length,1);assert.equal(b.writes.length,1);
 assert.equal(a.writes[0].value,b.writes[0].value,'meme valeur => issue idempotente benigne');
 const divA=[{...base,i1:'2026-10-14 10:00:00'}],divB=[{...base,i1:'2026-10-14 10:00:05'}];
 const c=syncHarness(divA,new Map()),d=syncHarness(divB,new Map());
 assert.equal(c.run().synced,1);assert.equal(d.run().synced,1);
 assert.notEqual(c.writes[0].value,d.writes[0].value,'snapshots divergents => valeurs differentes ecrites, dernier ecrivain gagne');
});
test('CACHE_ONLY : latch sur B1 direct stable ; sources bloquées et CEX non écrites',()=>{
 const rows=[{name:'Ledger A',i1:'[CACHE_ONLY] 2026-10-13 10:00:00',b1:'2026-10-14 10:00:00',j1:''},
 {name:'Ledger B',i1:'[BLOCKED:QUOTA] 2026-10-14 10:00:00',b1:'',j1:''},
 {name:'CEX - Kraken',i1:'2026-10-14 10:00:00',b1:'',j1:''}];
 const h=syncHarness(rows);assert.equal(h.run().synced,1);assert.equal(rows[0].j1,rows[0].b1);assert.equal(h.run().synced,0);
 assert.equal(rows[1].j1,'');assert.equal(rows[2].j1,'');
});
