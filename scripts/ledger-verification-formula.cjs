// Projection vectorisee de la semantique legacy V/X, sans scan ni prix modifies.
function legacyVerificationFormula(details, column = 'H') {
  if (!['Portefeuille Crypto Details','Portefeuille Action Details'].includes(details) || !['H','J'].includes(column)) throw new Error('Perimetre non autorise');
  return `=LET(n;MAX(3;IFERROR(MAX(FILTER(ROW(B3:B);B3:B<>""));3));k;IFERROR(FILTER('${details}'!E2:E&"|"&'${details}'!G2:G;'${details}'!E2:E<>"");"");MAP(A3:INDEX(A:A;n);B3:INDEX(B:B;n);D3:INDEX(D:D;n);E3:INDEX(E:E;n);F3:INDEX(F:F;n);LAMBDA(a;b;d;e;f;IF(e<>"";IF(OR(f="";REGEXMATCH(b;"^REALTOKEN");AND(a="Ledger - Gnosis";b="xDAI";d="native");IFERROR(MATCH(a&"|"&d;k;0)>0;FALSE));"V";"X");""))))`;
}
module.exports={legacyVerificationFormula};
