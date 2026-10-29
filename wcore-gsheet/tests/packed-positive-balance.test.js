const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../src/04B_CACHE_WALLET.gs'),'utf8');
function extract(name){const start=source.indexOf('CacheManager.'+name+' = function');if(start<0)throw Error(name);const end=source.indexOf('\n};',start);return source.slice(start,end+3);}
const c={CacheManager:{}};vm.createContext(c);vm.runInContext(extract('_looksJson_')+'\n'+extract('_packedEntryHasPositiveBalance_'),c);
test('solde positif détecté dans formats packed, objet et JSON',()=>{
 for(const entry of [{v:{a:[['ETH','0.01']]}},{assets:[{balance:2}]},{s:'{"assets":[{"balance":1}]}'}])assert.equal(c.CacheManager._packedEntryHasPositiveBalance_(entry),true);
});
test('zéro, négatif, invalide ou JSONcorrompu ne prétendent pas soldepositif',()=>{
 for(const entry of [{v:{a:[['ETH','0']]}},{assets:[{balance:-1}]},{s:'{broken'},{v:{assets:[{balance:'NaN'}]}}])assert.equal(c.CacheManager._packedEntryHasPositiveBalance_(entry),false);
});
