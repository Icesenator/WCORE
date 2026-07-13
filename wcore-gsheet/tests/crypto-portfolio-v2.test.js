const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', '43_CRYPTO_PORTFOLIO.gs'), 'utf8');
const context = { console };

vm.createContext(context);
vm.runInContext(source, context);

const failures = [];

function test(name, fn) {
  try {
    fn();
    console.log('OK - ' + name);
  } catch (err) {
    failures.push({ name, err });
    console.error('FAIL - ' + name + ': ' + err.message);
  }
}

assert.strictEqual(typeof context._cryptoPortfolioBuildMatrix_, 'function');
assert.strictEqual(typeof context._cryptoPortfolioBuildRow1_, 'function');
assert.strictEqual(typeof context._cryptoPortfolioReadManualRows_, 'function');
assert.strictEqual(typeof context._cryptoPortfolioValidateSnapshot_, 'function');
assert.strictEqual(typeof context._cryptoPortfolioBuildSourceRows_, 'function');
assert.strictEqual(typeof context.DIAG_CRYPTO_PORTFOLIO_V2_REFRESH_STEPS, 'function');
assert.strictEqual(typeof context.REPAIR_CRYPTO_PORTFOLIO_V2_FORMATS, 'function');
assert.strictEqual(typeof context._cryptoPortfolioCurrentRunTimestamp_, 'function');

test('headers use shared stable target label', () => {
  assert.deepStrictEqual(
    Array.from(context.CRYPTO_PORTFOLIO_HEADERS.slice(0, 20)),
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
      'Duplicate',
    ]
  );
});

test('format repair is explicit and bounded away from row 1 controls', () => {
  assert.match(source, /function REPAIR_CRYPTO_PORTFOLIO_V2_FORMATS\(\)/,
    'Crypto V2 must expose an explicit format repair function');
  assert.match(source, /FIRST_DATA_ROW\s*,\s*1\s*,\s*dataRows\s*,\s*1\)\.setNumberFormat\("@"\)/,
    'format repair must start at data rows, not format whole columns or row 1');
  assert.doesNotMatch(source, /getRange\("[A-Z]+:[A-Z]+"\)\.setNumberFormat/,
    'format repair must not use whole-column formatting that can mutate row 1 controls');
  assert.deepStrictEqual(Array.from(context.PORTFOLIO_SHARED_COLUMN_WIDTHS.slice(0, 20)), [87, 131, 91, 131, 168, 91, 69, 78, 74, 83, 59, 75, 75, 75, 71, 60, 76, 67, 64, 88],
    'Crypto V2 must use the same managed column widths as Action plus T');
  assert.match(source, /setColumnWidth\(c \+ 1, PORTFOLIO_SHARED_COLUMN_WIDTHS\[c\]\)/,
    'explicit format repair must also restore managed column widths');
});

test('update refresh does not regenerate formulas or layout on existing V2 sheet', () => {
  const match = source.match(/function UPDATE_CRYPTO_PORTFOLIO_V2\(\) \{([\s\S]*?)\n\}/);
  assert.ok(match, 'UPDATE_CRYPTO_PORTFOLIO_V2 must be present');
  assert.doesNotMatch(match[1], /REPAIR_CRYPTO_PORTFOLIO_V2_FORMULAS\(/, 'refresh must not repair formulas implicitly');
  assert.doesNotMatch(match[1], /_cryptoPortfolioBuildRow1_\(/, 'refresh must not rewrite row 1 formulas implicitly');
  assert.doesNotMatch(match[1], /_cryptoPortfolioEnsureLayout_\(sh\)/, 'refresh must not rewrite layout implicitly');
  assert.doesNotMatch(match[1], /_cryptoPortfolioBuildMatrix_\(/, 'refresh must not build formula rows when it writes A:E only');
  assert.doesNotMatch(match[1], /REPAIR_CRYPTO_PORTFOLIO_V2_FORMATS\(/, 'refresh must not repair formats implicitly');
  assert.doesNotMatch(match[1], /setNumberFormat\(/, 'refresh must not directly format cells');
});

test('update refresh logs progress without writing B1 on every step', () => {
  const start = source.indexOf('function UPDATE_CRYPTO_PORTFOLIO_V2()');
  const end = source.indexOf('function DIAG_CRYPTO_PORTFOLIO_V2_REFRESH_STEPS()', start);
  assert.ok(start >= 0 && end > start, 'UPDATE_CRYPTO_PORTFOLIO_V2 body must be present');
  const body = source.slice(start, end);
  const markStart = body.indexOf('function mark(step, extra)');
  const markEnd = body.indexOf('try {', markStart + 1);
  assert.ok(markStart >= 0 && markEnd > markStart, 'refresh mark helper must be present');
  const markPrefix = body.slice(markStart, markEnd);
  assert.doesNotMatch(markPrefix, /STATUS_CELL|setValue/, 'progress mark helper must not write B1 during every refresh step');
  assert.match(body, /_cryptoPortfolioWriteControlCells_\(ss\.getId\(\), _cryptoPortfolioCurrentRunTimestamp_\(\)/,
    'refresh must still write final run timestamp to B1');
  assert.doesNotMatch(body, /_cryptoPortfolioFormatTimestamp_\(snapshot\.generatedAt\)/,
    'B1 must reflect the successful sheet refresh time, not the potentially stale upstream snapshot timestamp');
  assert.match(body, /_cryptoPortfolioCurrentRunTimestamp_\(\)/,
    'refresh must write a current run timestamp to B1 on success');
  assert.match(body, /_cryptoPortfolioWriteControlCells_\(ss\.getId\(\), "ERROR: "/, 'refresh must still write final errors to B1');
});

test('update refresh clears only stale source tail after writing fresh source rows', () => {
  assert.match(source, /_cryptoPortfolioWriteSourceRows_\(ss\.getId\(\), sourceMatrix\)/,
    'refresh must write the fresh source matrix through the Sheets API');
  assert.match(source, /_cryptoPortfolioClearSourceTail_\(ss\.getId\(\), sourceMatrix\.length\)/,
    'refresh must clear stale source rows through the Sheets API after writing fresh rows');
  assert.match(source, /Sheets\.Spreadsheets\.Values\.batchUpdate/,
    'refresh writes must use Advanced Sheets API to avoid SpreadsheetApp timeouts on calculated sheets');
  assert.match(source, /function _cryptoPortfolioWriteControlCells_\([\s\S]*valueInputOption:\s*"RAW"[\s\S]*CRYPTO_PORTFOLIO_CONFIG\.REFRESH_CELL/,
    'A1 checkbox reset must use RAW boolean false, not locale-dependent text');
});

test('current run timestamp passes milliseconds to Format.datetime', () => {
  const originalFormat = context.Format;
  context.Format = {
    datetime: (value) => {
      assert.strictEqual(typeof value, 'number', 'Format.datetime must receive epoch milliseconds, not a Date object');
      return 'OK_TS';
    },
  };
  try {
    assert.strictEqual(context._cryptoPortfolioCurrentRunTimestamp_(), 'OK_TS');
  } finally {
    context.Format = originalFormat;
  }
});

test('crypto portfolio config uses finite universe settings', () => {
  assert.strictEqual(context.CRYPTO_PORTFOLIO_CONFIG.MAX_ROWS, 6012);
  assert.strictEqual(context.CRYPTO_PORTFOLIO_CONFIG.SHEET_NAME, 'Portefeuille Crypto');
  assert.strictEqual(context.CRYPTO_PORTFOLIO_CONFIG.DETAILS_SHEET_NAME, 'Portefeuille Crypto Details');
  assert.strictEqual(context.CRYPTO_PORTFOLIO_CONFIG.OFF_UNIVERSE_RANK, 5002);
});

const snapshot = {
  rows: [
    { canonicalSymbol: 'BTC', rank: 1, priceEur: 55000, marketCapEur: 1100000000000, name: 'Bitcoin' },
    { canonicalSymbol: 'ETH', rank: 2, priceEur: 3200, marketCapEur: 390000000000, name: 'Ethereum' },
  ],
};
const manualRows = [
  { symbol: 'WCORE', rank: 5002, priceEur: 0.42, marketCapEur: 420000, name: 'WCORE Manual' },
];
const matrix = context._cryptoPortfolioBuildMatrix_(snapshot, manualRows);
const sourceRows = context._cryptoPortfolioBuildSourceRows_(snapshot.rows, manualRows);

test('rank 5002 manual rows are appended after API rows', () => {
  assert.deepStrictEqual(Array.from(matrix.map((row) => row[0])), ['BTC', 'ETH', 'WCORE']);
  assert.strictEqual(matrix[2][1], 5002);
  assert.deepStrictEqual(Array.from(matrix[2].slice(0, 5)), [
    'WCORE',
    5002,
    '=IFERROR(N(INDEX(FILTER(\'Portefeuille Crypto Details\'!D:D;UPPER(\'Portefeuille Crypto Details\'!C:C)=A5;\'Portefeuille Crypto Details\'!A:A=5002);1));0)',
    420000,
    'WCORE Manual',
  ]);
});

test('source rows are built without formula columns for fast refresh', () => {
  assert.deepStrictEqual(JSON.parse(JSON.stringify(sourceRows)), [
    ['BTC', 1, 55000, 1100000000000, 'Bitcoin'],
    ['ETH', 2, 3200, 390000000000, 'Ethereum'],
    ['WCORE', 5002, '=IFERROR(N(INDEX(FILTER(\'Portefeuille Crypto Details\'!D:D;UPPER(\'Portefeuille Crypto Details\'!C:C)=A5;\'Portefeuille Crypto Details\'!A:A=5002);1));0)', 420000, 'WCORE Manual'],
  ]);
});

test('rank 5002 source rows keep price linked to Details', () => {
  assert.match(sourceRows[2][2], /^=IFERROR\(N\(INDEX\(FILTER\('Portefeuille Crypto Details'!D:D;/);
  assert.match(sourceRows[2][2], /UPPER\('Portefeuille Crypto Details'!C:C\)=A5/);
  assert.match(sourceRows[2][2], /'Portefeuille Crypto Details'!A:A=5002/);
});

test('portfolio formulas reference Portefeuille Crypto Details', () => {
  assert.match(
    matrix[0][6],
    /'Portefeuille Crypto Details'!K:K/,
    'G formula must read the crypto details sheet'
  );
});

test('row 1 returns a formula at J1', () => {
  const row1 = context._cryptoPortfolioBuildRow1_();
  assert.strictEqual(typeof row1[9], 'string');
  assert.match(row1[9], /^=/, 'J1 must be a formula');
  assert.match(row1[9], />=F1/, 'J1 must target Portefeuille Crypto F1 asset count');
  assert.doesNotMatch(row1[9], /Strat!F1/, 'J1 must not target Strat F1');
  assert.doesNotMatch(row1[9], /Strat!F18/, 'J1 must not target the Strat F18 cash value');
  assert.match(row1[9], /B3:B6012<5002/, 'J1 must not use rank 5002 as a boundary candidate');
  assert.match(row1[9], /A3:A6012<>""/, 'J1 must ignore blank rows in the fixed 6012-row range');
  assert.match(row1[9], /SCAN\(/, 'J1 should use a linear cumulative scan, not per-rank SUMPRODUCT loops');
  assert.match(row1[9], /I3:I6012=0/, 'J1 cumulative count must avoid double-counting Include rows');
  assert.match(row1[9], /I3:I6012>0/, 'J1 must add Include rows to the active scope count');
  assert.match(row1[9], /J3:J6012=0/, 'J1 must not count Include Stable rows as active assets');
  assert.match(row1[9], /T3:T6012<>"X"/, 'J1 must ignore duplicate rows even when they are included');
  assert.doesNotMatch(row1[9], /SUMIF\(/);
  assert.doesNotMatch(row1[9], /MAP\(/, 'J1 must not use slow per-row MAP over the fixed range');
});

test('E1 formula uses J1 as the rank bound', () => {
  const row1 = context._cryptoPortfolioBuildRow1_();
  assert.match(row1[4], /B3:B<=J1/);
  assert.match(row1[4], /T3:T<>"X"/, 'E1 must ignore duplicate rows even when Include is checked');
  assert.doesNotMatch(row1[4], /B3:B<=F1/);
});

test('J1 formula accounts for include and exclude positions', () => {
  const row1 = context._cryptoPortfolioBuildRow1_();
  const formula = row1[9];
  assert.match(formula, /SCAN\(0;\(A3:A6012<>""\)\*\(B3:B6012<5002\)\*\(H3:H6012=0\)\*\(T3:T6012<>"X"\)\*\(I3:I6012=0\)/,
    'J1 must cumulatively count only non-excluded, non-include ranked rows at their actual position');
  assert.match(formula, /SUMPRODUCT\(\(A3:A6012<>""\)\*\(H3:H6012=0\)\*\(T3:T6012<>"X"\)\*\(I3:I6012>0\)\*\(J3:J6012=0\)\)/,
    'J1 must add non-excluded, non-duplicate non-stable include rows exactly once, regardless of whether they are before or after the candidate rank');
  assert.match(formula, /FILTER\(B3:B6012;A3:A6012<>"";B3:B6012<5002;H3:H6012=0;T3:T6012<>"X";/,
    'J1 candidates must be real non-excluded ranked rows, so excludes before the target push the boundary lower in rank order');
});

test('row formulas make Duplicate override Include', () => {
  const matrix = context._cryptoPortfolioBuildMatrix_({ rows: [
    { canonicalSymbol: 'EURC', rank: 86, priceEur: 1, marketCapEur: 369861698, name: 'EURC' },
  ] }, []);
  assert.match(matrix[0][9], /T3="X"/, 'stable/include row formula must return 0 on duplicates');
  assert.match(matrix[0][11], /T3="X"/, 'target formula must return 0 on duplicates before Include logic');
  assert.match(matrix[0][12], /T3="X"/, 'stable row allocation must return 0 on duplicates');
  assert.match(matrix[0][18], /T3="X"/, 'buy candidate formula must ignore duplicates');
});

test('rank 5002 rows ignore TOP5000 duplicates but detect duplicate 5002 rows', () => {
  const matrix = context._cryptoPortfolioBuildMatrix_({ rows: [
    { canonicalSymbol: 'EURC', rank: 86, priceEur: 1, marketCapEur: 369861698, name: 'EURC' },
  ] }, [
    { symbol: 'EURC', rank: 5002, priceEur: 1.03, marketCapEur: 0, name: 'EURC (BINOVA)' },
  ]);
  assert.match(matrix[1][19], /COUNTIFS\(\$A\$3:A4;A4;\$B\$3:B4;5002\)>1/, '5002 duplicate formula must compare only against prior 5002 rows');
});

test('manual rows are read from Details symbols and prices', () => {
  const detailRows = [
    ['old header'],
    ['header'],
    ['', 'X', 'eth', 999, '', '', '', '', '', '', 5],
    ['', '', 'wcore', 0.42, '', '', '', '', '', '', 100],
    ['', '', 'alpha', '', '', '', '', '', '', '', ''],
    ['', '', 'WCORE', 12.34, '', '', '', '', '', '', 200],
  ];
  let lastRange = null;
  const detailsSheet = {
    getLastRow: () => detailRows.length,
    getRange: (row, column, numRows, numColumns) => {
      lastRange = { row, column, numRows, numColumns };
      return {
        getValues: () => detailRows.slice(row - 1, row - 1 + numRows).map((sourceRow) => {
          const out = [];
          for (let i = 0; i < numColumns; i += 1) out.push(sourceRow[column - 1 + i] || '');
          return out;
        }),
      };
    },
  };
  const sh = {
    getParent: () => ({
      getSheetByName: (name) => (name === 'Portefeuille Crypto Details' ? detailsSheet : null),
    }),
  };

  const rows = context._cryptoPortfolioReadManualRows_(sh, snapshot.rows);

  assert.deepStrictEqual(lastRange, { row: 3, column: 2, numRows: 4, numColumns: 3 },
    'manual row scan must read only Details columns B:D, not the full B:K formula block');

  assert.deepStrictEqual(JSON.parse(JSON.stringify(rows)), [
    { symbol: 'ALPHA', rank: 5002, priceEur: 0, marketCapEur: 0, name: 'ALPHA' },
    { symbol: 'ETH', rank: 5002, priceEur: 999, marketCapEur: 0, name: 'ETH' },
    { symbol: 'WCORE', rank: 5002, priceEur: 0.42, marketCapEur: 0, name: 'WCORE' },
  ]);
});

test('snapshot validation accepts zero market cap but rejects negative and non-finite market caps', () => {
  context._cryptoPortfolioValidateSnapshot_({
    ok: true,
    generatedAt: '2026-07-12T10:00:00.000Z',
    rows: [
      { canonicalSymbol: 'ZERO', rank: 1, priceEur: 1.23, marketCapEur: 0, name: 'Zero Market Cap Token' },
    ],
  });

  assert.throws(
    () => context._cryptoPortfolioValidateSnapshot_({
      ok: true,
      generatedAt: '2026-07-12T10:00:00.000Z',
      rows: [
        { canonicalSymbol: 'NEG', rank: 1, priceEur: 1.23, marketCapEur: -1, name: 'Negative Market Cap Token' },
      ],
    }),
    /Invalid marketCapEur for NEG/
  );

  assert.throws(
    () => context._cryptoPortfolioValidateSnapshot_({
      ok: true,
      generatedAt: '2026-07-12T10:00:00.000Z',
      rows: [
        { canonicalSymbol: 'INF', rank: 1, priceEur: 1.23, marketCapEur: Infinity, name: 'Infinite Market Cap Token' },
      ],
    }),
    /Invalid marketCapEur for INF/
  );
});

test('CMC duplicate symbols are kept as distinct ranked portfolio rows', () => {
  const duplicateSnapshot = {
    ok: true,
    generatedAt: '2026-07-12T10:00:00.000Z',
    rows: [
      { canonicalSymbol: 'BTC', rank: 1, priceEur: 55000, marketCapEur: 1100000000000, name: 'Bitcoin' },
      { canonicalSymbol: 'USDF', rank: 205, priceEur: 0.87, marketCapEur: 1101014853, name: 'Falcon USD' },
      { canonicalSymbol: 'USDF', rank: 246, priceEur: 0.87, marketCapEur: 98921494, name: 'Aster USDF' },
    ],
  };

  assert.doesNotThrow(() => context._cryptoPortfolioValidateSnapshot_(duplicateSnapshot));

  const rows = context._cryptoPortfolioBuildSourceRows_(duplicateSnapshot.rows, []);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(rows)), [
    ['BTC', 1, 55000, 1100000000000, 'Bitcoin'],
    ['USDF', 205, 0.87, 1101014853, 'Falcon USD'],
    ['USDF', 246, 0.87, 98921494, 'Aster USDF'],
  ]);
});

if (failures.length) {
  console.error('\nCrypto portfolio V2 guard failed:');
  for (const failure of failures) {
    console.error('- ' + failure.name + ': ' + failure.err.message);
  }
  process.exit(1);
}

console.log('Crypto portfolio V2 guard OK');
