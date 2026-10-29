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
      setFormulas(formulas) {
        writes.push({ a1, formulas });
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

// v4.16.x: Recap Portfolio!CA1:CA2+ must be auto-repaired by _setRecapHyperlinks_
// so the Vérif column keeps surfacing "Erreur (0 V)" for ledger/CEX rows
// whose target column has zero V entries (previous behavior regressed to a
// bare 0). We assert the explicit call to _repairRecapPortfolioVerif_ and
// the contract of the formula itself.
// NOTE: since 2026-10-04 the repair writes ONE CLASSIC FORMULA PER ROW
// (setFormulas over CA2:CA_last) instead of a single MAP spill in CA2.
// A slow/broken INDIRECT then breaks only its own cell instead of nuking
// the whole column with a formula-parse error.
const verifHeader = writes.find((write) => write.a1 === 'CA1' && 'value' in write);
const verifFormulas = writes.filter((write) => 'formulas' in write);
assert(verifHeader, 'Recap refresh should set CA1 to the Vérif header');
assert.strictEqual(verifHeader.value, 'Vérif');
assert(verifFormulas.length > 0 && verifFormulas[0].formulas.length > 0 && verifFormulas[0].formulas[0][0],
  'Recap refresh should write per-row Vérif formulas (setFormulas) starting at CA2');
assert(typeof context._recapPortfolioVerifFormula_ === 'function', '_recapPortfolioVerifFormula_ must be defined');
const formula = context._recapPortfolioVerifFormula_();
assert(typeof context._recapPortfolioVerifRowFormula_ === 'function', '_recapPortfolioVerifRowFormula_ must be defined');
const formulaRow7 = context._recapPortfolioVerifRowFormula_(7);
assert(formulaRow7.indexOf('A7') >= 0, 'row formula must reference its own row (A7 for row 7)');
assert(/MAP\s*\(/i.test(formula) === false, 'formula must NOT be a MAP spill anymore');
assert(formula.indexOf('Notification Rules') >= 0, 'formula must exclude utility tabs');
assert(formula.indexOf('Erreur (X présent)') >= 0, 'formula must surface Erreur (X présent) for X entries');
assert(formula.indexOf('Erreur (0 V)') >= 0, 'formula must surface Erreur (0 V) when no V entry exists');
assert(formula.indexOf('CEX - ') >= 0, 'formula must branch on CEX sheets (F2:F500 column)');
assert(formula.indexOf('H2:H500') >= 0, 'formula must branch on Ledger/on-chain sheets (bounded H2:H500 column)');
assert(!/![FH]:[FH]/.test(formula), 'formula must NOT use unbounded full-column INDIRECT ranges (!F:F / !H:H)');
assert(typeof context.REPAIR_RECAP_PORTFOLIO_VERIF === 'function', 'REPAIR_RECAP_PORTFOLIO_VERIF must be exposed');

// v4.16.x scoping: "Erreur (0 V)" is only meaningful on on-chain CRYPTO tabs.
// CEX tabs count sync confirmations in F:F (0 is a legitimate empty wallet),
// and on-chain Action tabs do not use V marks in H:H. The three branches are
// exposed separately so this contract is testable without a Sheets runtime.
assert(typeof context._recapVerifBranchFormula_ === 'function', '_recapVerifBranchFormula_ must be defined');
const cexBranch = context._recapVerifBranchFormula_('cex');
const actionBranch = context._recapVerifBranchFormula_('action');
const cryptoBranch = context._recapVerifBranchFormula_('crypto');
assert(cexBranch.indexOf('F2:F500') >= 0, 'cex branch must count in F2:F500');
assert(cexBranch.indexOf('Erreur (X présent)') >= 0, 'cex branch must surface Erreur (X présent)');
assert(cexBranch.indexOf('Erreur (0 V)') < 0, 'cex branch must NOT surface Erreur (0 V) — 0 V is a legitimate empty CEX');
assert(actionBranch.indexOf('J3:J') >= 0, 'action branch must count actual Vérif in J3:J');
assert(actionBranch.indexOf('Erreur (X présent)') >= 0, 'action branch must surface Erreur (X présent)');
assert(actionBranch.indexOf('Erreur (0 V)') < 0, 'action branch must NOT surface Erreur (0 V) — Action tabs have no V marks');
assert(cryptoBranch.indexOf('H2:H500') >= 0, 'crypto branch must count in H2:H500');
assert(cryptoBranch.indexOf('Erreur (X présent)') >= 0, 'crypto branch must surface Erreur (X présent)');
assert(cryptoBranch.indexOf('Erreur (0 V)') >= 0, 'crypto branch must surface Erreur (0 V) when no V entry exists');
assert(formula.indexOf('Action"') >= 0, 'formula must detect Action tabs by name suffix');
assert(formula.indexOf(cexBranch) >= 0 && formula.indexOf(cryptoBranch) >= 0, 'formula must compose the exposed branches');

console.log('listing recap headers OK');
