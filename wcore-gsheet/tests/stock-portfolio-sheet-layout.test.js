const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', '42_STOCK_PORTFOLIO.gs'), 'utf8');
const context = { console };

vm.createContext(context);
vm.runInContext(source, context);

assert.strictEqual(typeof context._stockPortfolioBuildMatrix_, 'function');
assert.strictEqual(typeof context._stockPortfolioBuildRow1_, 'function');
assert.strictEqual(typeof context.REPAIR_STOCK_PORTFOLIO_FORMATS, 'function');
assert.strictEqual(typeof context._stockPortfolioCurrentRunTimestamp_, 'function');

function extractFunctionBody(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} must exist`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(bodyStart + 1, i);
    }
  }
  throw new Error(`${name} body not found`);
}

const setupBody = extractFunctionBody('SETUP_STOCK_PORTFOLIO');
const updateBodyForFormatGuard = extractFunctionBody('UPDATE_STOCK_PORTFOLIO');

assert.deepStrictEqual(
  Array.from(context.STOCK_PORTFOLIO_HEADERS.slice(0, 19)),
  [
    'Symbol',
    'CMC Rank',
    'Price EUR',
    'Market Cap EUR',
    'Name',
    'Balance Théorique',
    'Total €',
    'Exclude',
    'Include',
    '% Stable',
    '√ MC',
    '% Cible théo',
    '% Cible stable',
    '% Cible',
    '% Réel',
    'Ecart',
    'Actions',
    'Signal',
    'Achat',
  ]
);
assert.strictEqual(context.STOCK_PORTFOLIO_CONFIG.MANAGED_LAST_COLUMN, 19,
  'MANAGED_LAST_COLUMN must grow by 1 (Exclude column)');
assert.doesNotMatch(source, /_stockPortfolioApplyValidation_\s*\(\s*sh\s*,/, 'refresh/setup must not apply number formats');
assert.doesNotMatch(source, /_stockPortfolioApplyHeaderLayout_\s*\(\s*sh\s*\)/, 'refresh/setup must not apply header formatting');
assert.doesNotMatch(source, /_stockPortfolioAutoResizeManagedColumns_\s*\(\s*sh\s*\)/, 'refresh/setup must not change column widths');
assert.doesNotMatch(source, /_stockPortfolioApplyRow1Formats_\s*\(\s*sh\s*\)/, 'refresh/setup must not format row 1');
assert.doesNotMatch(setupBody + updateBodyForFormatGuard, /setFontWeight\s*\(|setBackground\s*\(|setFontColor\s*\(|setNumberFormat\s*\(\s*"@"\s*\)/,
  'refresh/setup must not directly change Portefeuille Action formatting');
assert.match(source, /FIRST_DATA_ROW\s*,\s*1\s*,\s*dataRows\s*,\s*1\)\.setNumberFormat\("@"\)/,
  'format repair must start at data rows, not format whole columns or row 1');
assert.doesNotMatch(source, /getRange\("[A-Z]+:[A-Z]+"\)\.setNumberFormat/,
  'format repair must not use whole-column formatting that can mutate row 1 controls');
assert.deepStrictEqual(Array.from(context.PORTFOLIO_SHARED_COLUMN_WIDTHS.slice(0, 19)), [87, 131, 91, 131, 168, 91, 69, 78, 74, 83, 59, 75, 75, 75, 71, 60, 76, 67, 64],
  'shared portfolio column widths must be explicit and stable');
assert.match(source, /setColumnWidth\(c \+ 1, PORTFOLIO_SHARED_COLUMN_WIDTHS\[c\]\)/,
  'explicit format repair must also restore managed column widths');
assert.match(source, /_stockPortfolioWithFilterSuspended_\(sh,\s*function\s*\(\)\s*\{/,
  'format repair must suspend the active filter before formatting hidden rows');
assert.match(source, /filter\.remove\(\)/,
  'format repair must remove the active filter before applying row formats');
assert.match(source, /range\.createFilter\(\)/,
  'format repair must recreate the original basic filter after formatting');
assert.match(source, /_stockPortfolioExtendConditionalFormats_\(sh, lastRow\)/,
  'format repair must extend conditional formatting to the full managed row range');
assert.strictEqual(context.STOCK_PORTFOLIO_CONFIG.REFRESH_CELL, 'A1', 'A1 must be the manual refresh checkbox');
assert.strictEqual(context.STOCK_PORTFOLIO_CONFIG.STATUS_CELL, 'B1', 'B1 must be the update timestamp/status cell');
context.Format = { datetime: (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ') };
assert.strictEqual(
  context._stockPortfolioFormatTimestamp_('2026-07-11T07:57:56.123Z'),
  '2026-07-11 07:57:56',
  'B1 update timestamp must be displayed without ISO T/Z/milliseconds'
);
context.Format = {
  datetime: (value) => {
    assert.strictEqual(typeof value, 'number', 'Format.datetime must receive epoch milliseconds, not a Date object');
    return 'OK_TS';
  },
};
assert.strictEqual(context._stockPortfolioCurrentRunTimestamp_(), 'OK_TS',
  'current run timestamp must pass epoch milliseconds to Format.datetime');

const snapshot = {
  rows: [
    {
      canonicalTicker: 'NVDA',
      rank: 1,
      priceEur: 184.5,
      marketCapEur: 4474000000000,
      company: 'NVIDIA',
    },
  ],
};

const matrix = context._stockPortfolioBuildMatrix_(snapshot, {});

const tsmDuplicateSnapshot = {
  rows: [
    { canonicalTicker: 'TSM', rank: 6, priceEur: 380.18, marketCapEur: 1971770287187, company: 'TSMC' },
    { canonicalTicker: 'TPE:2330', rank: null, priceEur: 65.84, marketCapEur: 0, company: 'TPE:2330' },
  ],
};
const tsmDuplicateMatrix = context._stockPortfolioBuildMatrix_(tsmDuplicateSnapshot, {});
assert.deepStrictEqual(
  Array.from(tsmDuplicateMatrix.map((row) => row[0])),
  ['EUR', 'TSM'],
  'Portefeuille Action must filter the unranked TPE:2330 duplicate when ranked TSM is present'
);

assert.strictEqual(matrix.length, 2);
assert.deepStrictEqual(Array.from(matrix[0].slice(0, 5)), ['EUR', 0, 1, 0, 'Euro cash']);
assert.deepStrictEqual(Array.from(matrix[1].slice(0, 5)), ['NVDA', 1, 184.5, 4474000000000, 'NVIDIA']);
assert.match(matrix[1][5], /^=IFERROR\(/, 'F must be a sheet formula for Total');
// Total = % Cible / 100 * F1 / price (same as Action Rebalancing E4), NOT % théo.
// Using % théo here inflates the Total by 2x vs AR (NVDA: PA 1,12 vs AR 0,59).
assert.strictEqual(
  matrix[1][5],
  '=IFERROR(N4/100*$H$1/C4;0)',
  'F (Total) must reference % Cible (N4), not % théo (L4), and shifted total spot H1'
);
assert.match(matrix[1][6], /^=\(/, 'G must be a sheet formula for Spot');
assert.match(matrix[1][7], /^=SUMPRODUCT\(/, 'H must be the new Exclude formula (Rebalancing!F$7:F)');
assert.match(matrix[1][8], /^=IF\(H\d+<>0;0;SUMPRODUCT\(/, 'I must be the Include formula, gated by the new Exclude column');
// % théo (L) must keep the Action Rebalancing J formula shape after the PA column shift:
// AR F (Spot) becomes PA G, and AR I (dominance) becomes PA K.
assert.match(matrix[1][11], /^=IF\(H\d+<>0;0;IF\(M\d+>0;/,
  'L (% théo) must ignore Exclude rows before applying the Action Rebalancing J formula');
assert.match(matrix[1][11], /IF\(AND\(B\d+>\$X\$1;G\d+>=\$D\$1\/2\)/,
  'L (% théo) must mirror Action Rebalancing J, with row-1 controls shifted by A1/B1');

// % Stable override (M) must still look up ticker -> stable flag in Rebalancing!G:H.
// Shifting this to H:I makes EUR lose its 11.11 stable target, which makes R mark EUR as V.
assert.match(matrix[0][12], /VLOOKUP\(A3;Rebalancing!G:H;2;FALSE\)/,
  'M (% Stable override) must read Rebalancing!G:H, not shifted H:I');
assert.ok(
  matrix[0][12].indexOf('Rebalancing!H:I') === -1,
  'M (% Stable override) must not use Rebalancing!H:I'
);
assert.match(matrix[1][18], /^=IF\(H\d+<>0;"";IF\(MAX\(L\d+;O\d+\)>=\$G\$1\*100\/2;"X";""\)\)$/,
  'S marker gate must ignore Exclude rows so R matches Action Rebalancing without excluded tickers');

// Samsung: WCORE priceEur is already per Bitpanda SSU unit (25 ordinary shares).
// The legacy x25 multiplier must NOT be reapplied in the Spot formula.
assert.ok(
  matrix[1][6].indexOf('IF(A4="KRX:005930";25;1)') === -1,
  'Spot formula must not reapply the x25 Samsung multiplier (price is already per SSU unit)'
);

// EUR row: Spot must be the Action Rebalancing EUR cash formula (Bitpanda EUR/BCPEUR
// across the 4 sheets, minus EURC details, minus Budget), not the generic stock VLOOKUP.
assert.match(matrix[0][6], /BCPEUR/, 'EUR Spot must aggregate Bitpanda BCPEUR/EUR cash');
assert.match(matrix[0][6], /Budget!\$1:\$133/, 'EUR Spot must subtract the Budget HLOOKUP');
assert.match(matrix[0][6], /Portefeuille Crypto Details/, 'EUR Spot must subtract EURC held in Details');

// % Cible: numerator = theoretical target (L), denominator = $J$1 (=sumproduct of K column
// = sum of dominance, matching Action Rebalancing L3 = J3/$J$1*100 semantic).
// After the Exclude column shift, the dominance column is K (was J), but $J$1 still refers
// to the row-1 cell that sums K (dominance), so the reference is unchanged from the old PA.
assert.strictEqual(matrix[1][13], '=L4/$L$1*100', '% Cible must divide by shifted $L$1 after A1/B1 controls');

assert.strictEqual(typeof context._stockPortfolioBuildSourceMatrix_, 'function');
assert.strictEqual(typeof context._stockPortfolioBuildFormulaMatrix_, 'function');
assert.deepStrictEqual(Array.from(context._stockPortfolioBuildSourceMatrix_(matrix)[1]), ['NVDA', 1, 184.5, 4474000000000, 'NVIDIA'], 'source refresh matrix must be A:E only');
assert.strictEqual(context._stockPortfolioBuildFormulaMatrix_(matrix)[1].length, 14, 'formula refresh matrix must cover F:S only');
assert.match(context._stockPortfolioBuildFormulaMatrixForRows_(2)[0][1], /BCPEUR/,
  'formula repair must preserve the special EUR cash Spot formula in G3');
assert.doesNotMatch(context._stockPortfolioBuildFormulaMatrixForRows_(2)[1][1], /BCPEUR/,
  'formula repair must use generic stock Spot formulas after the EUR row');

assert.match(source, /_stockPortfolioWriteSourceRows_\(ss\.getId\(\), sourceMatrix\)/,
  'refresh must write Action source cells through the Sheets API, not SpreadsheetApp ranges under active filters');
assert.match(source, /_stockPortfolioClearSourceTail_\(ss\.getId\(\), sourceMatrix\.length\)/,
  'refresh must clear stale Action source cells through the Sheets API, not SpreadsheetApp ranges under active filters');
assert.match(source, /function _stockPortfolioWriteControlCells_\(/,
  'refresh must write A1/B1 controls through a dedicated helper');
assert.match(source, /valueInputOption:\s*"RAW"[\s\S]{0,220}STOCK_PORTFOLIO_CONFIG\.REFRESH_CELL/,
  'A1 checkbox reset must use RAW boolean false, not locale-dependent text');
assert.doesNotMatch(updateBodyForFormatGuard, /\.clearContent\s*\(\s*\)|\.setValues\s*\(/,
  'refresh must not use SpreadsheetApp clearContent/setValues on filtered portfolio ranges');
assert.doesNotMatch(source, /getRange\s*\(\s*STOCK_PORTFOLIO_CONFIG\.FIRST_DATA_ROW\s*,\s*1\s*,\s*clearRows\s*,\s*STOCK_PORTFOLIO_CONFIG\.MANAGED_LAST_COLUMN\s*\)\.clearContent\s*\(\s*\)/,
  'refresh must not clear formula columns F:S');
assert.doesNotMatch(source, /getRange\s*\(\s*STOCK_PORTFOLIO_CONFIG\.FIRST_DATA_ROW\s*,\s*6\s*,[\s\S]{0,120}\.setValues\s*\(\s*formulaMatrix\s*\)/,
  'refresh must not rewrite formula columns F:S after initial setup/repair');
assert.doesNotMatch(source, /\.setNumberFormat\("@"\)\.setValue|\.setValue\([^\n]+\)\.setNumberFormat/,
  'status/value writes must not chain formatting calls');

const updateStart = source.indexOf('function UPDATE_STOCK_PORTFOLIO()');
const updateEnd = source.indexOf('function _stockPortfolioEnsureRows_', updateStart);
assert.ok(updateStart >= 0 && updateEnd > updateStart, 'UPDATE_STOCK_PORTFOLIO body must be present');
const updateBody = source.slice(updateStart, updateEnd);
assert.doesNotMatch(updateBody, /_stockPortfolioEnsureLayout_\(sh\)/,
  'refresh must not rewrite Portefeuille Action layout implicitly');
assert.doesNotMatch(updateBody, /_stockPortfolioBuildRow1_\(/,
  'refresh must not rewrite Portefeuille Action row 1 formulas implicitly');
assert.doesNotMatch(updateBody, /REPAIR_STOCK_PORTFOLIO_FORMULAS\(/,
  'refresh must not repair Portefeuille Action formulas implicitly');

const row1 = context._stockPortfolioBuildRow1_();
assert.strictEqual(row1[0], false, 'A1 must be the refresh checkbox value');
assert.strictEqual(row1[1], '', 'B1 is reserved for the last update timestamp');
assert.strictEqual(row1[2], 'Bornes :');
assert.match(row1[3], /^=MAX\(/, 'D1 must keep the Action Rebalancing bound formula after A1/B1 shift');
assert.match(row1[4], /^=SUMPRODUCT\(D3:D/, 'E1 must sum market cap using the shifted Market Cap column');
assert.match(row1[4], /\(H3:H=0\)/, 'E1 market cap universe must ignore Exclude rows');
assert.match(row1[9], /^=IFERROR\(INDEX\(FILTER\(B3:B6000/, 'J1 must be a dynamic rank formula, not a manual control');
assert.match(row1[9], />=F1/, 'J1 must target Portefeuille Action F1 asset count');
assert.match(row1[9], /SCAN\(0;\(A3:A6000<>""\)\*\(B3:B6000>0\)\*\(H3:H6000=0\)\*\(I3:I6000=0\)/,
  'J1 must cumulatively count only non-excluded, non-include ranked rows at their actual position');
assert.match(row1[9], /SUMPRODUCT\(\(A3:A6000<>""\)\*\(H3:H6000=0\)\*\(I3:I6000>0\)\*\(J3:J6000=0\)\)/,
  'J1 must add non-excluded non-stable include rows exactly once');
assert.doesNotMatch(row1[9], /Strat!F1|Strat!F18|MAP\(/,
  'J1 must use local F1 and avoid slow per-row MAP loops');
assert.match(row1[7], /^=SUMPRODUCT\(G3:G\)/, 'H1 must sum Spot after A1/B1 shift');
assert.match(row1[15], /^=IFERROR\(IF\(AND\(XLOOKUP\("V";R:R;P:P\)/, 'P1 must keep the shifted buy/sell guard, IFERROR-wrapped (R=P+1 post Exclude)');

// Row-1 lookups must never surface #N/A while the data rows are being rewritten
// (clearContent -> setValues window) or when no V/X marker exists in column R.
assert.match(row1[6], /^=IFERROR\(/, 'G1 ratio must be IFERROR-wrapped');
assert.match(row1[16], /^=IFERROR\(XLOOKUP\("V"/i, 'Q1 sell lookup must be IFERROR-wrapped');
assert.match(row1[18], /^=IFERROR\(XLOOKUP\("X"/i, 'S1 buy lookup must be IFERROR-wrapped');
assert.strictEqual(row1[21], '=IFERROR(XLOOKUP(J1;B3:B;K3:K)/AA1;0)',
  'V1 must lookup shifted dominance K (Action Rebalancing I), not % théo L');
assert.match(row1[25], /^=IFERROR\(/, 'Z1 ratio must be IFERROR-wrapped');
assert.strictEqual(
  row1[26],
  '=(SUMPRODUCT((H3:H=0)*1;(B3:B<=J1)*1;K3:K)+SUMPRODUCT((H3:H=0)*1;(B3:B>J1)*1;(I3:I=1)*1;K3:K))',
  'Y1 must sum shifted dominance K (Action Rebalancing I), not % théo L, and ignore Exclude rows'
);
assert.strictEqual(row1.length, 28, 'Row 1 width must be 28 (A:B controls + former A:Z metrics shifted to C:AB)');

const existingRow1 = Array(28).fill('');
existingRow1[9] = 9;
const dynamicRow1 = context._stockPortfolioBuildRow1_(existingRow1);
assert.match(dynamicRow1[9], /^=IFERROR\(INDEX\(FILTER\(B3:B6000/,
  'J1 must be regenerated by explicit setup/repair as a dynamic formula');

context.PropertiesService = {
  getScriptProperties: () => ({
    getProperty: (key) => ({
      WCORE_WEB_API_URL: 'https://api.example.test',
      GSHEET_API_TOKEN: 'token',
    }[key]),
  }),
};
context.UrlFetchApp = { fetch: () => null };
assert.throws(
  () => context._stockPortfolioFetchSnapshot_(),
  /WCORE stock portfolio HTTP blocked or empty response/,
  'null UrlFetchApp responses must become an explicit stock portfolio error'
);

console.log('Stock portfolio sheet layout guard OK');
