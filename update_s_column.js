const formulas = [];
for (let row = 3; row <= 6012; row++) {
  formulas.push([`=IF(OR(H${row}<>0;T${row}="X");"";IF(R${row}="V";"X";IF(MAX(L${row};O${row})>=$G$1*100/2;"X";""))`]);
}

const chunkSize = 1000;
const chunks = [];
for (let i = 0; i < formulas.length; i += chunkSize) {
  const chunk = formulas.slice(i, i + chunkSize);
  const startRow = i + 3;
  const endRow = Math.min(i + chunkSize + 2, 6012);
  chunks.push({ range: `Portefeuille Crypto!S${startRow}:S${endRow}`, values: chunk });
}

console.log(JSON.stringify({ chunks }));