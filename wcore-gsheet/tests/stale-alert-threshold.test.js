// Garde-fou: le seuil de l'alerte "DONNEES FIGEES" doit rester superieur a la
// cadence de rafraichissement du watchdog.
//
// Incident 2026-08-06: l'alerte se declenchait a 2 h alors que
// WATCHDOG_FROM_RECAP ne repulse une feuille saine qu'au-dela de
// WD_STALE_I1_HOURS (5 h). Toute feuille valide etait donc signalee comme figee
// entre 2 h et 5 h, par construction et non par accident. Observe en production
// sur "Binance Web3 Wallet - zkLink Nova" (dernier scan 07:36, alerte a 09:45,
// prochain pulse normal attendu vers 12:36).

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'src');
const engine = fs.readFileSync(path.join(srcDir, '11_EVM_ENGINE.gs'), 'utf8');
const refresh = fs.readFileSync(path.join(srcDir, '16_REFRESH.gs'), 'utf8');

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

function readWatchdogStaleHours() {
  const m = refresh.match(/var\s+WD_STALE_I1_HOURS\s*=\s*(\d+)/);
  assert.ok(m, 'WD_STALE_I1_HOURS introuvable dans 16_REFRESH.gs');
  return Number(m[1]);
}

function readAlertMarginHours() {
  const m = engine.match(/var\s+_staleAlertMs\s*=\s*\(_wdStaleHours\s*\+\s*(\d+)\)\s*\*\s*3600000/);
  assert.ok(m, "le seuil d'alerte doit etre derive de _wdStaleHours");
  return Number(m[1]);
}

test("le seuil d'alerte est derive de la cadence du watchdog, pas code en dur", () => {
  assert.ok(
    /_wdStaleHours\s*=\s*\(typeof\s+WD_STALE_I1_HOURS/.test(engine),
    'le moteur doit lire WD_STALE_I1_HOURS au lieu de figer une duree',
  );
  assert.ok(
    !/_staleMs\s*\)\s*>=\s*7200000/.test(engine),
    "le seuil fixe de 2 h ne doit pas revenir: il est inferieur a la cadence de 5 h",
  );
});

test("le seuil d'alerte reste strictement superieur a la cadence de rafraichissement", () => {
  const watchdogHours = readWatchdogStaleHours();
  const marginHours = readAlertMarginHours();
  const alertHours = watchdogHours + marginHours;
  assert.ok(
    alertHours > watchdogHours,
    `alerte ${alertHours}h doit depasser la cadence ${watchdogHours}h`,
  );
  assert.ok(
    marginHours >= 1,
    `marge ${marginHours}h insuffisante: une feuille rafraichie a l'heure exacte serait signalee`,
  );
});

test("la reference est resolue a l'execution, pas au chargement du fichier", () => {
  // 11_EVM_ENGINE est charge avant 16_REFRESH (ordre alphabetique GAS): sans le
  // garde typeof, la constante serait undefined et le fichier casserait.
  assert.ok(
    /typeof\s+WD_STALE_I1_HOURS\s*!==\s*"undefined"/.test(engine),
    'la lecture doit etre protegee par un garde typeof',
  );
  const fallback = engine.match(/typeof\s+WD_STALE_I1_HOURS[\s\S]{0,160}?\?\s*WD_STALE_I1_HOURS\s*:\s*(\d+)/);
  assert.ok(fallback, 'un repli numerique explicite est requis');
  assert.equal(
    Number(fallback[1]),
    readWatchdogStaleHours(),
    'le repli doit valoir la meme cadence que WD_STALE_I1_HOURS',
  );
});

if (failures.length) {
  console.error('\n' + failures.length + ' failing test(s)');
  process.exit(1);
}
console.log('\nstale alert threshold OK');
