import {api} from './ledger-audit.mjs';
const ranges=["'Ledger - Robinhood Chain Crypto'!B1","'Ledger - Robinhood Chain Crypto'!I1:J1","'Ledger - Peaq'!H3:H4","'Ledger - Base Crypto'!H74:H75","'Ledger - Solana Action'!J3:J4"];
const r=await api('/values:batchGet?'+ranges.map(x=>'ranges='+encodeURIComponent(x)).join('&'));
console.log(JSON.stringify(r.valueRanges,null,2));
