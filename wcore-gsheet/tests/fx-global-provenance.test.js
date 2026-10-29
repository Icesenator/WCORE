const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '../src/04C_CACHE_GLOBAL.gs'), 'utf8');
const start = src.indexOf('var GlobalFxCache =');
const end = src.indexOf('})();', start) + 5;
function load(persisted) {
  let saved;
  const c = {GLOBAL_CACHE_KEYS:{GLOBAL_FX:'test'},GLOBAL_CACHE_CONFIG:{FX_TTL_MS:3600000},
    CacheManager:{init(){},safeGetJson:()=>persisted,safeSetJson:(_k,v)=>{saved=JSON.parse(JSON.stringify(v));},delete(){}}};
  vm.createContext(c);vm.runInContext('Date.now = () => 20000000;',c);vm.runInContext(src.slice(start,end),c);
  return {c,cache:c.GlobalFxCache,saved:()=>saved};
}
test('cache global : set/save ne conserve que rate et ts, pas la collecte ni les sources',()=>{
  const h=load();h.cache.set('USD_EUR',0.9);h.cache.save();
  assert.deepEqual(h.saved().rates.USD_EUR,{rate:0.9,ts:20000000});
  assert.equal(h.saved().updatedAt,20000000);
  assert.equal(h.cache.get('USD_EUR'),0.9);
});
test('lecture/rechargement : ts écriture inchangé, get retourne uniquement le scalaire',()=>{
  const h=load({rates:{USD_EUR:{rate:0.91,ts:19000000}}});
  assert.equal(h.cache.get('USD_EUR'),0.91);h.cache.save();
  assert.equal(h.saved().rates.USD_EUR.ts,19000000);
  assert.equal(h.saved().rates.USD_EUR.sources,undefined);
});
test('TTL du cache global : taux ancien refusé sans inventer une nouvelle collecte',()=>{
  const h=load({rates:{USD_EUR:{rate:0.91,ts:10000000}}});
  assert.equal(h.cache.get('USD_EUR'),null);
});
test('format legacy racine : valeur lisible mais aucune provenance attestée',()=>{
  const h=load({USD_EUR:{rate:0.92,ts:19000000}});
  assert.equal(h.cache.get('USD_EUR'),0.92);
});
