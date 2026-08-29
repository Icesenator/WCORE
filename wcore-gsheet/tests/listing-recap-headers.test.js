const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', '17_LISTING.gs'), 'utf8');

const writes = [];
const recap = {
  getRange(a1) {
    return {
      setValues(values) {
        writes.push({ a1, values });
      },
      setValue(value) {
        writes.push({ a1, value });
      },
      setFormula(formula) {
        writes.push({ a1, formula });
      },
      setRichTextValues() {},
      clearContent() {}
    };
  },
  getLastRow() { return 2; }
};

const context = {
  console,
  Logger: { log() {} },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty() {} }) },
  SpreadsheetApp: {
    newRichTextValue() {
      return {
        setText() { return this; },
        setLinkUrl() { return this; },
        build() { return {}; }
      };
    },
    getActiveSpreadsheet() { return null; }
  }
};

vm.createContext(context);
vm.runInContext(source, context);

context._setRecapHyperlinks_({
  getSheetByName(name) { return name === 'Recap Portfolio' ? recap : null; },
  getUrl() { return 'https://docs.google.com/spreadsheets/d/test'; }
}, ['Ledger - Ancient8'], { 'Ledger - Ancient8': 123 });

const headerWrite = writes.find((write) => write.a1 === 'D1:G1');
assert(headerWrite, 'Recap refresh should rewrite D1:G1 headers');
assert.strictEqual(JSON.stringify(headerWrite.values), JSON.stringify([[
  'PULSE (B1)',
  'FORCEFULL (C1)',
  'STATUS (I1)',
  'LAST SCAN (J1)'
]]));

// v4.16.x: Recap Portfolio!CA1:CA2 must be auto-repaired by _setRecapHyperlinks_
// so the Vérif column keeps surfacing "Erreur (0 V)" for ledger/CEX rows
// whose target column has zero V entries (previous behavior regressed to a
// bare 0). We assert the explicit call to _repairRecapPortfolioVerif_ and
// the contract of the formula itself.
const verifHeader = writes.find((write) => write.a1 === 'CA1' && 'value' in write);
const verifFormula = writes.find((write) => write.a1 === 'CA2' && 'formula' in write);
assert(verifHeader, 'Recap refresh should set CA1 to the Vérif header');
assert.strictEqual(verifHeader.value, 'Vérif');
assert(verifFormula, 'Recap refresh should set CA2 to the Vérif MAP formula');
assert(typeof context._recapPortfolioVerifFormula_ === 'function', '_recapPortfolioVerifFormula_ must be defined');
const formula = context._recapPortfolioVerifFormula_();
assert(formula.indexOf('Erreur (X présent)') >= 0, 'formula must surface Erreur (X présent) for X entries');
assert(formula.indexOf('Erreur (0 V)') >= 0, 'formula must surface Erreur (0 V) when no V entry exists');
assert(formula.indexOf('CEX - ') >= 0, 'formula must branch on CEX sheets (F:F column)');
assert(formula.indexOf('H:H') >= 0, 'formula must branch on Ledger/on-chain sheets (H:H column)');
assert(typeof context.REPAIR_RECAP_PORTFOLIO_VERIF === 'function', 'REPAIR_RECAP_PORTFOLIO_VERIF must be exposed');

// v4.16.x scoping: "Erreur (0 V)" is only meaningful on on-chain CRYPTO tabs.
// CEX tabs count sync confirmations in F:F (0 is a legitimate empty wallet),
// and on-chain Action tabs do not use V marks in H:H. The three branches are
// exposed separately so this contract is testable without a Sheets runtime.
assert(typeof context._recapVerifBranchFormula_ === 'function', '_recapVerifBranchFormula_ must be defined');
const cexBranch = context._recapVerifBranchFormula_('cex');
const actionBranch = context._recapVerifBranchFormula_('action');
const cryptoBranch = context._recapVerifBranchFormula_('crypto');
assert(cexBranch.indexOf('F:F') >= 0, 'cex branch must count in F:F');
assert(cexBranch.indexOf('Erreur (X présent)') >= 0, 'cex branch must surface Erreur (X présent)');
assert(cexBranch.indexOf('Erreur (0 V)') < 0, 'cex branch must NOT surface Erreur (0 V) — 0 V is a legitimate empty CEX');
assert(actionBranch.indexOf('H:H') >= 0, 'action branch must count in H:H');
assert(actionBranch.indexOf('Erreur (X présent)') >= 0, 'action branch must surface Erreur (X présent)');
assert(actionBranch.indexOf('Erreur (0 V)') < 0, 'action branch must NOT surface Erreur (0 V) — Action tabs have no V marks');
assert(cryptoBranch.indexOf('H:H') >= 0, 'crypto branch must count in H:H');
assert(cryptoBranch.indexOf('Erreur (X présent)') >= 0, 'crypto branch must surface Erreur (X présent)');
assert(cryptoBranch.indexOf('Erreur (0 V)') >= 0, 'crypto branch must surface Erreur (0 V) when no V entry exists');
assert(formula.indexOf('Action"') >= 0, 'formula must detect Action tabs by name suffix');
assert(formula.indexOf(cexBranch) >= 0 && formula.indexOf(cryptoBranch) >= 0, 'formula must compose the exposed branches');

console.log('listing recap headers OK');
