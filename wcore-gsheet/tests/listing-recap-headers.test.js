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

const headerWrite = writes.find((write) => write.a1 === 'D1:H1');
assert(headerWrite, 'Recap refresh should rewrite D1:H1 headers');
assert.strictEqual(JSON.stringify(headerWrite.values), JSON.stringify([[
  'PULSE (B1)',
  'FORCEFULL (C1)',
  'STATUS (I1)',
  'LAST SCAN (J1)',
  'INFO_TOTAL'
]]));

console.log('listing recap headers OK');
