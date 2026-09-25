const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src', '35_BITPANDA_SYNC.gs'), 'utf8');

function extractFunction(sourceText, name) {
  const start = sourceText.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Missing function ${name}`);
  const brace = sourceText.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < sourceText.length; i++) {
    if (sourceText[i] === '{') depth++;
    if (sourceText[i] === '}') depth--;
    if (depth === 0) return sourceText.slice(start, i + 1);
  }
  throw new Error(`Unclosed function ${name}`);
}

function makeHarness(stamp) {
  const sheets = {};
  function getSheet(name) {
    if (!sheets[name]) {
      sheets[name] = {
        cells: {},
        getRange(a1) {
          return {
            setValue(v) { sheets[name].cells[a1] = v; return this; },
            setNumberFormat() { return this; },
            getDisplayValue() { return sheets[name].cells[a1] || ''; },
          };
        },
      };
    }
    return sheets[name];
  }
  const context = { Utilities: { formatDate: () => stamp }, console };
  context._bpGetSpreadsheet_ = () => ({ getSheetByName: getSheet });
  context._bpExtractStampText_ = (value) => {
    const m = String(value || '').match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?/);
    return m ? m[0] : '';
  };
  context._bpGetSheetCellText_ = (ss, sheetName, a1) => {
    const sh = ss.getSheetByName(sheetName);
    return sh ? String(sh.cells[a1] || '') : '';
  };
  context._bpSetSheetStatus_ = (ss, sheetName, status) => {
    ss.getSheetByName(sheetName).cells.B1 = String(status || '');
  };
  vm.createContext(context);
  vm.runInContext([
    extractFunction(source, '_bpFmtStamp_'),
    extractFunction(source, '_cexWriteManualJobStatus_'),
  ].join('\n'), context);
  return { context, getSheet };
}

const KRAKEN_FAILURE = '{"ok":false,"ts":"2026-09-25T11:26:05.687Z","error":"Error: Kraken API error: EGeneral:Temporary lockout (ban temporaire Kraken ~15-60 min : ne pas relancer, attendre puis reessayer une seule fois)"}';

function cryptoJob() {
  return {
    kind: 'KRAKEN',
    sheetName: 'CEX - Kraken Crypto',
    statusSheetName: 'Portefeuille Crypto',
    statusCell: 'V2',
  };
}

// --- 1. Un echec porte un horodatage lisible en tete (age visible) ---
{
  const h = makeHarness('2026-09-25 13:26:05');
  h.context._cexWriteManualJobStatus_(cryptoJob(), KRAKEN_FAILURE);
  const v2 = h.getSheet('Portefeuille Crypto').cells.V2;
  assert.ok(
    /^ERROR 2026-09-25 13:26:05 KRAKEN: /.test(v2),
    'V2 doit commencer par "ERROR <horodatage> <kind>:" pour qu\'un echec fige reste datable',
  );
  assert.ok(v2.includes('EGeneral:Temporary lockout'), 'le corps exact de l\'erreur doit rester present');
  assert.ok(v2.includes('"ok":false'), 'le JSON brut exact doit rester present (aucune donnee inventee)');
  assert.ok(!/\bOK: \d/.test(v2), 'un echec ne doit jamais etre presente comme un succes');
}

// --- 2. Un echec ancien reste date : aucun refresh posterieur ne le maquille ---
{
  const h = makeHarness('2026-09-14 21:28:29');
  h.context._cexWriteManualJobStatus_(cryptoJob(), KRAKEN_FAILURE);
  const v2 = h.getSheet('Portefeuille Crypto').cells.V2;
  assert.ok(
    v2.startsWith('ERROR 2026-09-14 21:28:29 '),
    'un echec enregistre a une date ancienne doit conserver CETTE date en tete, pas une date courante',
  );
}

// --- 3. Un succes posterieur replie le statut avec sa propre date ---
{
  const h = makeHarness('2026-09-25 14:00:00');
  h.context._cexWriteManualJobStatus_(cryptoJob(), KRAKEN_FAILURE);
  h.context._cexWriteManualJobStatus_(cryptoJob(), 'OK');
  const v2 = h.getSheet('Portefeuille Crypto').cells.V2;
  assert.equal(v2, 'KRAKEN OK: 2026-09-25 14:00:00', 'un succes posterieur remplace l\'echec daté par un OK daté');
}

// --- 4. Garde statique : la forme horodatee est bien celle livree ---
{
  const fn = extractFunction(source, '_cexWriteManualJobStatus_');
  assert.ok(
    /"ERROR " \+ _bpFmtStamp_\(\)/.test(fn),
    '_cexWriteManualJobStatus_ doit prefixer tout echec par un horodatage lisible',
  );
}

console.log('cex manual status observability OK');
