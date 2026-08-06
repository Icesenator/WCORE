// Garde-fou: le store de RPC dynamiques doit etre rafraichi automatiquement.
//
// 33_DYNAMIC_RPC.gs annonce "TTL: 30 days (auto-expires if trigger stops
// running)" et "weekly trigger with 25-day staleness check". Ce trigger n'avait
// jamais ete installe par l'auto-heal: mesure du 2026-08-06, DYNAMIC_RPC_STATUS
// renvoyait "EMPTY - Run UPDATE_DYNAMIC_RPCS() to populate".
//
// Consequence: WCORE tournait uniquement sur les endpoints codes en dur, sans
// jamais decouvrir les nouveaux ni ecarter les morts. Les endpoints defunts
// s'accumulaient (Degen: drpc.org en HTTP 404, thirdweb inutilisable).
//
// Un trigger absent ne se voit pas: rien n'echoue, le systeme sert simplement
// une liste figee. D'ou ce test.

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'src');
const autoHeal = fs.readFileSync(path.join(srcDir, '16B_AUTO_HEAL.gs'), 'utf8');
const dynamicRpc = fs.readFileSync(path.join(srcDir, '33_DYNAMIC_RPC.gs'), 'utf8');

const failures = [];
function test(name, fn) {
  try {
    fn();
    console.log('OK - ' + name);
  } catch (err) {
    failures.push(name);
    console.error('FAIL - ' + name + ': ' + err.message);
  }
}

function creationBlock() {
  const start = autoHeal.indexOf('function _wcoreAutoHealCreateManagedTriggers_');
  assert.ok(start >= 0, '_wcoreAutoHealCreateManagedTriggers_ introuvable');
  const end = autoHeal.indexOf('\nfunction ', start + 10);
  return autoHeal.slice(start, end > 0 ? end : autoHeal.length);
}

test("l'auto-heal installe le rafraichissement des RPC dynamiques", () => {
  const block = creationBlock();
  assert.ok(
    /newTrigger\("UPDATE_DYNAMIC_RPCS"\)/.test(block),
    'sans ce trigger, le store expire au bout de 30 jours et rien ne le signale',
  );
});

test('la cadence reste hebdomadaire, comme le suppose le TTL de 30 jours', () => {
  const block = creationBlock();
  const m = block.match(/newTrigger\("UPDATE_DYNAMIC_RPCS"\)\s*\.timeBased\(\)\s*\.every(\w+)\((\d+)\)/);
  assert.ok(m, 'cadence introuvable pour UPDATE_DYNAMIC_RPCS');
  assert.equal(m[1], 'Weeks', `cadence inattendue: every${m[1]}(${m[2]})`);
  const weeks = Number(m[2]);
  assert.ok(weeks >= 1 && weeks <= 3, `un cycle de ${weeks} semaines ne tient pas dans le TTL de 30 jours`);
});

test("le trigger est declare geré, sinon l'auto-heal le supprimerait", () => {
  const managedLists = autoHeal.match(/var managed = \[[^\]]+\]/g) || [];
  assert.ok(managedLists.length >= 2, `listes managed introuvables (${managedLists.length})`);
  for (let i = 0; i < managedLists.length; i++) {
    assert.ok(
      managedLists[i].indexOf('"UPDATE_DYNAMIC_RPCS"') >= 0,
      `liste managed #${i + 1}: le trigger serait supprime au prochain nettoyage`,
    );
  }
});

test('le cout reste borne par le skip de fraicheur et le test partiel', () => {
  // Sans ces deux gardes, un trigger hebdomadaire couterait ~250 appels/semaine.
  assert.ok(/ageDays < 25/.test(dynamicRpc), 'le skip de fraicheur a 25 jours doit rester');
  assert.ok(/rotationMod = 3/.test(dynamicRpc), 'le test par rotation (1/3 des chaines) doit rester');
});

if (failures.length) {
  console.error('\n' + failures.length + ' failing test(s)');
  process.exit(1);
}
console.log('\ndynamic rpc trigger OK');
