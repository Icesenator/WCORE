// v4.15.72 - Top 300 World Market Cap dynamic updater (companiesmarketcap.com)
//
// Remplit l'onglet "Google Finance" avec le Top 300 mondial des capitalisations.
// Source: companiesmarketcap.com (CSV public, pas de cle API).
//
// Pour chaque entreprise, ecrit:
//   A = ticker (syntaxe Google Finance quand le marche est supporte)
//   I = supply (shares outstanding = marketcap_usd / price_usd du CSV)
//   J = market cap USD (CSV, fallback fiable quand GOOGLEFINANCE n'a pas le titre)
//   K = pays
//   L = nom de l'entreprise
//   M = Ignore (checkbox) - exclut la ligne d'Action Rebalancing
// Les formules B,C,D,E,F,G,H sont (re)posees par le script et reprennent
// la logique existante de l'onglet, avec un fallback CSV->EUR dans G pour les
// marches non couverts par GOOGLEFINANCE (Tadawul, A-shares chinoises, Abu Dhabi...).
//
// Mise a jour: UPDATE_TOP_MARKETCAP() (manuel) ou trigger hebdomadaire
// installe via INSTALL_TOP_MARKETCAP_TRIGGER().

var TOP_MARKETCAP_VERSION = "4.15.72";

var TOP_MC_CONFIG = {
  SHEET_NAME: "Google Finance",
  ACTION_SHEET_NAME: "Action Rebalancing",
  CSV_URL: "https://companiesmarketcap.com/?download=csv",
  FIRST_ROW: 12,        // premiere ligne de donnees (A12) - table FX en A1:C10
  ACTION_FIRST_ROW: 4,  // ligne 3 = EUR, lignes suivantes = Top actions
  COUNT: 300,           // Top 300 (couvre aussi les actions Bitpanda hors Top 100/200)
  TRIGGER_FN: "UPDATE_TOP_MARKETCAP",
  TRIGGER_DAY: ScriptApp.WeekDay ? null : null // configure dans l'installer
};

/**
 * Table de mapping suffixe boursier (Yahoo/companiesmarketcap) -> prefixe GOOGLEFINANCE.
 * - valeur string : prefixe Google Finance (ex "KRX")
 * - valeur null    : marche NON supporte par GOOGLEFINANCE -> fallback CSV USD
 */
var TOP_MC_EXCHANGE_MAP = {
  "KS": "KRX",     // Coree (KOSPI)
  "KQ": "KOSDAQ",  // Coree (KOSDAQ)
  "SS": "SHA",     // Shanghai (A-shares, couverture GF incertaine -> fallback)
  "SZ": "SHE",     // Shenzhen (A-shares, couverture GF incertaine -> fallback)
  "HK": "HKG",     // Hong Kong
  "SW": "SWX",     // SIX Swiss
  "PA": "EPA",     // Euronext Paris
  "AS": "AMS",     // Euronext Amsterdam
  "BR": "EBR",     // Euronext Brussels
  "LS": "ELI",     // Euronext Lisbon
  "DE": "ETR",     // XETRA
  "F":  "FRA",     // Frankfurt
  "T":  "TYO",     // Tokyo
  "TW": "TPE",     // Taiwan
  "TWO":"TPE",
  "L":  "LON",     // London
  "MC": "BME",     // Madrid
  "MI": "BIT",     // Milan
  "ST": "STO",     // Stockholm
  "CO": "CPH",     // Copenhagen
  "HE": "HEL",     // Helsinki
  "OL": "OSL",     // Oslo
  "AX": "ASX",     // Australia
  "TO": "TSE",     // Toronto
  "V":  "CVE",     // TSX Venture
  "SR": null,      // Tadawul (Arabie Saoudite) - non supporte
  "AE": null,      // Abu Dhabi - non supporte
  "SAU":null
};

/**
 * Overrides explicites symbole CSV -> ticker Google Finance.
 * Pour les cas ou la cap GOOGLEFINANCE est fausse (OTC/ADR) ou le format differe.
 */
var TOP_MC_TICKER_OVERRIDES = {
  "BRK-B": "NYSE:BRK.B",
  "BRK-A": "NYSE:BRK.A",
  // CompaniesMarketCap expose Toyota via l'ADR NYSE TM (~10 actions ordinaires).
  // Bitpanda utilise l'action ordinaire japonaise (~15 EUR), donc on mappe vers Tokyo.
  "TM":    "TYO:7203",
  "GOOG":  "GOOG",
  "GOOGL": "GOOGL"
};

var TOP_MC_SUPPLY_MULTIPLIER = {
  // CSV price(TM) = ADR price, mais ticker Google Finance = action ordinaire.
  // 1 ADR TM ~= 10 actions ordinaires 7203.T.
  "TM": 10
};

/**
 * Convertit un symbole companiesmarketcap vers la syntaxe GOOGLEFINANCE.
 * @return {{ticker:string, gfSupported:boolean}}
 */
function _topMcMapTicker_(sym) {
  sym = String(sym || "").trim();
  if (!sym) return { ticker: "", gfSupported: false };

  if (TOP_MC_TICKER_OVERRIDES.hasOwnProperty(sym)) {
    return { ticker: TOP_MC_TICKER_OVERRIDES[sym], gfSupported: true };
  }

  var dot = sym.lastIndexOf(".");
  if (dot < 0) {
    // Ticker US/ADR simple
    return { ticker: sym, gfSupported: true };
  }

  var base = sym.substring(0, dot);
  var suf = sym.substring(dot + 1).toUpperCase();

  if (!TOP_MC_EXCHANGE_MAP.hasOwnProperty(suf)) {
    // Suffixe inconnu -> on garde le symbole brut, fallback CSV
    return { ticker: sym, gfSupported: false };
  }

  var pre = TOP_MC_EXCHANGE_MAP[suf];
  if (pre === null) {
    // Marche non supporte -> fallback CSV obligatoire
    return { ticker: sym, gfSupported: false };
  }

  return { ticker: pre + ":" + base, gfSupported: true };
}

/**
 * Parse une ligne CSV avec champs entre guillemets.
 */
function _topMcParseCsvLine_(line) {
  var out = [];
  var cur = "";
  var inQ = false;
  for (var i = 0; i < line.length; i++) {
    var ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === "," && !inQ) {
      out.push(cur); cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/**
 * Telecharge et parse le Top N depuis companiesmarketcap.com.
 * @return {Array<{rank:number,name:string,symbol:string,marketcap:number,price:number,country:string}>}
 */
function _topMcFetchRanking_(count) {
  var resp = UrlFetchApp.fetch(TOP_MC_CONFIG.CSV_URL, {
    muteHttpExceptions: true,
    followRedirects: true,
    headers: { "User-Agent": "Mozilla/5.0 (compatible; WCORE/1.0)" }
  });
  var code = resp.getResponseCode();
  if (code !== 200) {
    throw new Error("companiesmarketcap CSV HTTP " + code);
  }
  var text = resp.getContentText();
  var lines = text.split("\n");
  var rows = [];
  // ligne 0 = header
  for (var i = 1; i < lines.length && rows.length < count; i++) {
    var raw = lines[i];
    if (!raw || !raw.trim()) continue;
    var f = _topMcParseCsvLine_(raw);
    if (f.length < 6) continue;
    var rank = parseInt(f[0], 10);
    var mc = parseFloat(f[3]);
    var px = parseFloat(f[4]);
    if (!isFinite(rank) || !isFinite(mc)) continue;
    rows.push({
      rank: rank,
      name: f[1],
      symbol: f[2],
      marketcap: mc,        // USD
      price: isFinite(px) ? px : 0,
      country: f[5]
    });
  }
  return rows;
}

function _topMcBitpandaAlias1Formula_(row) {
  // v4.15.72: le connecteur Bitpanda canonise deja TSFA->TSM, BROA->AVGO,
  // BRK->BRKB, SMSN->SSU, NOVN->NVS, RDSA->SHEL, TCTZF->TCEHY et *-US->base.
  // Les alias ici ne couvrent donc plus que les tickers AR qui differaient du
  // symbole canonique Bitpanda (suffixes marche EPA:/SWX:/TYO:/NYSE: + Samsung).
  return "SWITCH(A" + row + ";" +
    "\"GOOG\";\"GOOGL\";\"META\";\"FB\";" +
    "\"NYSE:BRK.B\";\"BRKB\";\"KRX:005930\";\"SSU\";" +
    "\"KRX:000660\";\"HYXS\";\"EPA:MC\";\"MC\";" +
    "\"EPA:OR\";\"OR\";" +
    "\"NVO\";\"NOVO\";\"CPH:NOVO-B\";\"NOVO\";" +
    "\"SWX:NESN\";\"NESN\";\"SWX:RO\";\"ROG\";\"TYO:7203\";\"TM\";\"\")";
}

function _topMcBitpandaAlias2Formula_(row) {
  return "SWITCH(A" + row + ";\"KRX:005930\";\"SMSN\";\"005930\";\"SMSN\";\"\")";
}

function _topMcBitpandaLookupFormula_(sheetName, row) {
  var a1 = _topMcBitpandaAlias1Formula_(row);
  var a2 = _topMcBitpandaAlias2Formula_(row);
  return "IFERROR(VLOOKUP(A" + row + ";'" + sheetName + "'!A:B;2;FALSE);" +
    "IFERROR(VLOOKUP(REGEXREPLACE(A" + row + ";\"^.*:\";\"\");'" + sheetName + "'!A:B;2;FALSE);" +
    "IFERROR(VLOOKUP(" + a1 + ";'" + sheetName + "'!A:B;2;FALSE);" +
    "IFERROR(VLOOKUP(" + a2 + ";'" + sheetName + "'!A:B;2;FALSE);0))))";
}

function _topMcActionSpotFormula_(row) {
  // Actions uniquement: ne pas chercher dans Crypto/Commodity/Fiat, sinon collisions
  // dangereuses (ex: CAT/STX peuvent matcher des cryptos).
  // v4.15.68: l'onglet "Bitpanda Spot Action" a ete supprime; toutes les actions
  // (y compris ex-Action) apparaissent desormais dans "CEX - Bitpanda Stocks".
  var qty = _topMcBitpandaLookupFormula_("CEX - Bitpanda Stocks", row);
  // Bitpanda SSU/SMSN est un receipt Samsung qui represente ~25 actions ordinaires
  // KRX:005930. On garde KRX:005930 pour le ranking market cap, mais on convertit
  // la quantite Bitpanda en equivalent actions ordinaires pour la valorisation.
  return "=(" + qty + ")*IF(A" + row + "=\"KRX:005930\";25;1)*D" + row;
}

function _topMcActionFormulaRow_(row) {
  var activeRank = row - TOP_MC_CONFIG.ACTION_FIRST_ROW + 1;
  return [
    activeRank,
    "=IF(B" + row + "=0;0;IFERROR(IFERROR(VLOOKUP(A" + row + ";'Google Finance'!A:G;7;FALSE);VLOOKUP(A" + row + ";'Portefeuille Crypto'!A:E;4;FALSE));0))",
    "=IFERROR(VLOOKUP(A" + row + ";'Google Finance'!A:D;4;FALSE);0)",
    "=IFERROR(L" + row + "/100*$F$1/D" + row + ";0)",
    _topMcActionSpotFormula_(row),
    "=SUMPRODUCT((Rebalancing!G:G=A" + row + ")*1)",
    "=IFERROR(IF(AND(OR(VLOOKUP(A" + row + ";Rebalancing!G:H;2;FALSE)=\"X\";VLOOKUP(A" + row + ";Rebalancing!G:H;2;FALSE)=\"Y\");HLOOKUP(MAX(Strat!$2:$2);Strat!$2:$84;83)>0);IF($S$1=\"X\";HLOOKUP(MAX(Strat!$2:$2)-1;Strat!$2:$80;79);HLOOKUP(MAX(Strat!$2:$2);Strat!$2:$80;79))+IF(AND(A" + row + "=\"EUR\";$S$1=\"X\");HLOOKUP(MAX(Strat!$2:$2)-1;Strat!$2:$90;89);0);0);0)",
    "=SQRT(100*C" + row + "/$C$1)",
    "=IF(K" + row + ">0;K" + row + ";IF(AND(B" + row + ">$V$1;F" + row + ">=$B$1/2);$E$1*100;IF(B" + row + "<=$H$1;100*I" + row + "/$I$1;IF(B" + row + "<=$H$1+$U$1;MAX(100*I" + row + "/$I$1*1/$U$1*($U$1+$H$1-B" + row + ");$E$1*100);0))))",
    "=IFERROR(IF(VLOOKUP(A" + row + ";Rebalancing!G:H;2;FALSE)=\"Y\";MAX(H" + row + ";J" + row + ");IF(VLOOKUP(A" + row + ";Rebalancing!G:H;2;FALSE)=\"X\";H" + row + ";0));0)",
    "=J" + row + "/$J$1*100",
    "=F" + row + "/$F$1*100",
    "=F" + row + "-E" + row + "*D" + row,
    "=IFERROR(N" + row + "/D" + row + ";0)",
    "=IF(N" + row + "=MAXIFS($N$3:N;$Q$3:Q;\"X\");\"V\";IF(N" + row + "=MINIFS($N$3:N;$Q$3:Q;\"X\");\"X\";\"\"))",
    "=IF(MAX(J" + row + ";M" + row + ")>=$E$1*100/2;\"X\";\"\")"
  ];
}

/**
 * v4.15.70: repare UNIQUEMENT la colonne F (quantite spot Bitpanda) d'Action
 * Rebalancing, sans fetch CSV ni recalcul des 18 colonnes. Leger -> tient dans
 * le timeout 30s/6min. A utiliser quand les formules spot pointent encore vers
 * l'ancien onglet "Bitpanda Spot Action" supprime.
 */
function REPAIR_ACTION_REBALANCING_SPOT() {
  var ss = SpreadsheetApp.openById("1kxidZZoEM6fXubFpp54fKvzJeXFCSCWCfyMTPNwYRB4");
  var sh = ss.getSheetByName(TOP_MC_CONFIG.ACTION_SHEET_NAME);
  if (!sh) throw new Error("Sheet '" + TOP_MC_CONFIG.ACTION_SHEET_NAME + "' introuvable");
  var first = TOP_MC_CONFIG.ACTION_FIRST_ROW;
  var lastRow = sh.getLastRow();
  if (lastRow < first) return "NO_ROWS";
  var n = lastRow - first + 1;
  var tickers = sh.getRange(first, 1, n, 1).getValues();
  var out = [];
  var fixed = 0;
  for (var i = 0; i < n; i++) {
    var ticker = String(tickers[i][0] || "").trim();
    if (!ticker) { out.push([""]); continue; }
    out.push([_topMcActionSpotFormula_(first + i)]);
    fixed++;
  }
  // Colonne F = 6e colonne (A=1 ... F=6)
  sh.getRange(first, 6, n, 1).setValues(out);
  return "OK_SPOT_REPAIRED rows=" + fixed;
}

function _topMcUpdateActionRebalancing_(ss, tickers) {
  var names = arguments.length > 2 ? arguments[2] : [];
  var sh = ss.getSheetByName(TOP_MC_CONFIG.ACTION_SHEET_NAME);
  if (!sh) return;
  var first = TOP_MC_CONFIG.ACTION_FIRST_ROW;
  var data = [];
  for (var i = 0; i < tickers.length; i++) {
    var row = first + i;
    data.push([tickers[i]].concat(_topMcActionFormulaRow_(row)).concat([names[i] || ""]));
  }
  sh.getRange(first, 1, data.length, 18).setValues(data);
  sh.getRange(2, 18).setValue("Name");
  var clearStart = first + data.length;
  var lastRow = sh.getLastRow();
  if (lastRow >= clearStart) {
    sh.getRange(clearStart, 1, lastRow - clearStart + 1, 18).clearContent();
  }
}

function _topMcIsIgnoredValue_(v) {
  if (v === true) return true;
  var s = String(v || "").toUpperCase().trim();
  return s === "TRUE" || s === "X" || s === "YES" || s === "1" || s === "IGNORE";
}

function _topMcReadIgnoreMap_(sh) {
  var lastRow = sh.getLastRow();
  var out = {};
  if (lastRow < TOP_MC_CONFIG.FIRST_ROW) return out;
  var n = lastRow - TOP_MC_CONFIG.FIRST_ROW + 1;
  // A=ticker, L=name, M=Ignore
  var values = sh.getRange(TOP_MC_CONFIG.FIRST_ROW, 1, n, 13).getValues();
  for (var i = 0; i < values.length; i++) {
    if (!_topMcIsIgnoredValue_(values[i][12])) continue;
    var ticker = String(values[i][0] || "").trim();
    var name = String(values[i][11] || "").trim();
    if (ticker) out["T:" + ticker] = true;
    if (name) out["N:" + name] = true;
  }
  return out;
}

/**
 * Met a jour l'onglet Google Finance avec le Top 300 mondial.
 * Fonction principale (manuelle ou trigger).
 */
function UPDATE_TOP_MARKETCAP() {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (e) { Logger.log("TOP_MC: lock busy"); return "BUSY"; }

  try {
    var ss = SpreadsheetApp.openById("1kxidZZoEM6fXubFpp54fKvzJeXFCSCWCfyMTPNwYRB4");
    var sh = ss.getSheetByName(TOP_MC_CONFIG.SHEET_NAME);
    if (!sh) throw new Error("Sheet '" + TOP_MC_CONFIG.SHEET_NAME + "' introuvable");

    var rows = _topMcFetchRanking_(TOP_MC_CONFIG.COUNT);
    if (!rows.length) throw new Error("Aucune donnee CSV");
    var ignoreMap = _topMcReadIgnoreMap_(sh);

    var first = TOP_MC_CONFIG.FIRST_ROW;
    var n = rows.length;

    // Buffers par colonne
    var colA = [];   // ticker
    var colE = [];   // formule marketcap (GF) ou vide
    var colI = [];   // supply
    var colJ = [];   // marketcap USD (CSV fallback)
    var colK = [];   // pays
    var colL = [];   // nom entreprise
    var colM = [];   // ignore checkbox
    // formules B,C,D,F,G,H construites par ligne

    var fB = [], fC = [], fD = [], fF = [], fG = [], fH = [];

    for (var idx = 0; idx < n; idx++) {
      var r = rows[idx];
      var row = first + idx;
      var m = _topMcMapTicker_(r.symbol);
      var ignored = !!(ignoreMap["T:" + m.ticker] || ignoreMap["N:" + r.name]);

      // Supply = shares outstanding (marketcap USD / prix USD)
      var supplyMultiplier = TOP_MC_SUPPLY_MULTIPLIER[r.symbol] || 1;
      var supply = (r.price > 0) ? (r.marketcap / r.price * supplyMultiplier) : "";

      colA.push([m.ticker]);
      colI.push([supply === "" ? "" : supply]);
      colJ.push([r.marketcap]);          // USD
      colK.push([r.country]);
      colL.push([r.name]);
      colM.push([ignored]);

      // B: prix live
      fB.push(["=IFERROR(GOOGLEFINANCE(A" + row + ");\"\")"]);
      // C: devise live
      fC.push(["=IFERROR(GOOGLEFINANCE(A" + row + ";\"currency\");\"USD\")"]);
      // D: prix EUR - dispo pour TOUTES les lignes
      //    1) prix live B -> conversion via table FX (incl. CNY ligne 10)
      //    2) si pas de prix live -> derive du CSV: (J_capUSD / I_supply) / EUR-USD
      //    IFERROR retombe sur la derivation si la conversion FX echoue (#N/A taux)
      fD.push(["=IFERROR(IF(N(B" + row + ")>0;IF(C" + row + "=\"EUR\";B" + row +
               ";B" + row + "/XLOOKUP(C" + row + ";$C$2:$C$10;$B$2:$B$10));" +
               "IF(AND(N(J" + row + ")>0;N(I" + row + ")>0);(J" + row + "/I" + row + ")/$B$2;\"\"));" +
               "IF(AND(N(J" + row + ")>0;N(I" + row + ")>0);(J" + row + "/I" + row + ")/$B$2;\"\"))"]);
      // E: marketcap GF (info, peut etre vide/faux sur OTC)
      colE.push(["=IFERROR(GOOGLEFINANCE(A" + row + ";\"marketcap\");\"\")"]);
      // F: devise (= C)
      fF.push(["=C" + row]);
      // G: marketcap EUR
      //    1) si supply I dispo ET prix EUR D dispo -> I*D (coherent avec D)
      //    2) sinon fallback CSV USD (J) converti via EUR-USD ($B$2)
      fG.push(["=IFERROR(IF(AND(N(I" + row + ")>0;N(D" + row + ")>0);I" + row + "*D" + row +
               ";J" + row + "/$B$2);IFERROR(J" + row + "/$B$2;\"\"))"]);
      // H: rang (Top) - protege contre #N/A
      fH.push(["=IFERROR(IF(A" + row + "=\"\";0;SUMPRODUCT(($G$12:G" + row + ">=G" + row +
               ")*1;($G$12:G" + row + "<>\"\")*1));\"\")"]);
    }

    // Ecriture par bloc (1 setValues par colonne)
    sh.getRange(first, 1, n, 1).setValues(colA);   // A
    sh.getRange(first, 2, n, 1).setFormulas(fB);    // B
    sh.getRange(first, 3, n, 1).setFormulas(fC);    // C
    sh.getRange(first, 4, n, 1).setFormulas(fD);    // D
    sh.getRange(first, 5, n, 1).setFormulas(colE);  // E
    sh.getRange(first, 6, n, 1).setFormulas(fF);    // F
    sh.getRange(first, 7, n, 1).setFormulas(fG);    // G
    sh.getRange(first, 8, n, 1).setFormulas(fH);    // H
    sh.getRange(first, 9, n, 1).setValues(colI);    // I supply
    sh.getRange(first, 10, n, 1).setValues(colJ);   // J marketcap USD
    sh.getRange(first, 11, n, 1).setValues(colK);   // K pays
    sh.getRange(first, 12, n, 1).setValues(colL);   // L name
    sh.getRange(first, 13, n, 1).setValues(colM);   // M ignore

    // En-tetes colonnes ajoutees (J,K) si absentes
    sh.getRange(11, 10).setValue("MarketCap USD");
    sh.getRange(11, 11).setValue("Country");
    sh.getRange(11, 12).setValue("Name");
    sh.getRange(11, 13).setValue("Ignore");
    sh.getRange(first, 13, n, 1)
      .setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());

    // Nettoyage des anciennes lignes au-dela du Top N (si la liste a retreci)
    var lastRow = sh.getLastRow();
    var endData = first + n - 1;
    if (lastRow > endData) {
      sh.getRange(endData + 1, 1, lastRow - endData, 13).clearContent();
    }

    var tickers = [];
    var names = [];
    for (var ti = 0; ti < rows.length; ti++) {
      if (colM[ti][0] === true) continue;
      tickers.push(_topMcMapTicker_(rows[ti].symbol).ticker);
      names.push(rows[ti].name);
    }
    _topMcUpdateActionRebalancing_(ss, tickers, names);

    var stamp = Utilities.formatDate(new Date(), "Europe/Paris", "yyyy-MM-dd HH:mm");
    sh.getRange(11, 14).setValue("MAJ: " + stamp + " (" + n + ", active " + tickers.length + ")");
    Logger.log("TOP_MC: " + n + " entreprises mises a jour @ " + stamp);
    return "OK " + n + " @ " + stamp;

  } catch (err) {
    Logger.log("TOP_MC ERROR: " + err);
    return "ERROR: " + err;
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

/**
 * Installe le trigger hebdomadaire (lundi ~06h).
 */
function INSTALL_TOP_MARKETCAP_TRIGGER() {
  // Supprime les anciens triggers de cette fonction
  var trs = ScriptApp.getProjectTriggers();
  for (var i = 0; i < trs.length; i++) {
    if (trs[i].getHandlerFunction() === TOP_MC_CONFIG.TRIGGER_FN) {
      ScriptApp.deleteTrigger(trs[i]);
    }
  }
  ScriptApp.newTrigger(TOP_MC_CONFIG.TRIGGER_FN)
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(6)
    .create();
  Logger.log("TOP_MC: trigger hebdomadaire installe (lundi 06h)");
  return "Trigger installe (lundi 06h)";
}

/**
 * Diagnostic: affiche le mapping des tickers sans ecrire dans la sheet.
 */
function DIAG_TOP_MARKETCAP() {
  var rows = _topMcFetchRanking_(TOP_MC_CONFIG.COUNT);
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var m = _topMcMapTicker_(r.symbol);
    out.push(r.rank + "\t" + r.symbol + "\t-> " + m.ticker +
             (m.gfSupported ? "" : " [CSV_FALLBACK]") + "\t" + r.country);
  }
  var txt = out.join("\n");
  Logger.log(txt);
  return txt;
}
