// Gardes de frontiere ROOT/CM — proprietaire : WCORE_CM.
// But : le CM ne selectionne JAMAIS une tache produit ROOT ; un pointeur ROOT n'est pas une tache CM.
'use strict';
const B = require('./cm-boundary.cjs');
let failed = 0;
function check(id, desc, ok, detail) {
  if (!ok) failed++;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + id + '  ' + desc + (ok ? '' : '  -> ' + detail));
}

const PTR_ROW = '| WC-01 | P2 | IN_PROGRESS | pointeur vers CM/ROADMAP.md |';
const PTR_ROW_OWNER = '| WC-01 | P2 | IN_PROGRESS | etat canonique dans `CM/ROADMAP.md` (CANONICAL_OWNER=WCORE_CM) |';
const ROOT_ROW = '| WC-11 | P2 | TODO | produit |';

check('CM_QUEUE_ACCEPTS_WC01', 'WC-01 accepte', B.isCmWorkItem('WC-01') === true, JSON.stringify(B.classifyWorkItem('WC-01')));
check('CM_QUEUE_ACCEPTS_P2_CM', 'P2-CM-* et P1-GOV-CM-* acceptes',
  B.isCmWorkItem('P2-CM-DISCOVERY-RESULT-VALIDATION') === true && B.isCmWorkItem('P1-GOV-CM-PERSISTENT-OWNER') === true,
  JSON.stringify(B.classifyWorkItem('P2-CM-DISCOVERY-RESULT-VALIDATION')));
check('CM_QUEUE_REJECTS_WC11', 'WC-11 rejete (produit)',
  B.isCmWorkItem('WC-11') === false && B.classifyWorkItem('WC-11').owner === 'ROOT',
  JSON.stringify(B.classifyWorkItem('WC-11')));
check('CM_QUEUE_REJECTS_P2_OBS', 'P2-OBS-* et P1-OBS-* rejetes (produit)',
  B.isCmWorkItem('P2-OBS-FX-PARITY-WEB-SIDE') === false && B.isCmWorkItem('P1-OBS-GSHEET-HTTP-ATTRIBUTION') === false,
  JSON.stringify(B.classifyWorkItem('P2-OBS-FX-PARITY-WEB-SIDE')));
check('CM_QUEUE_REJECTS_KRAKEN', 'P1-REL-KRAKEN-* rejete (release)',
  B.isCmWorkItem('P1-REL-KRAKEN-NONCE-LOCKOUT') === false,
  JSON.stringify(B.classifyWorkItem('P1-REL-KRAKEN-NONCE-LOCKOUT')));
check('CM_QUEUE_REJECTS_WC12_AND_CHAIN', 'WC-12 et P2-CHAIN-* rejetes',
  B.isCmWorkItem('WC-12') === false && B.isCmWorkItem('P2-CHAIN-ZERO-RPC') === false,
  JSON.stringify({ wc12: B.classifyWorkItem('WC-12').owner, chain: B.classifyWorkItem('P2-CHAIN-ZERO-RPC').owner }));
check('CM_QUEUE_IGNORES_ROOT_PRODUCT_ITEMS', 'filtre : 0 selection produit depuis une file ROOT',
  (() => {
    const r = B.filterToCmWork([
      { id: 'WC-11', status: 'IN_PROGRESS' }, { id: 'P2-OBS-FX-PARITY-WEB-SIDE', status: 'TODO' },
      { id: 'P1-REL-KRAKEN-NONCE-LOCKOUT', status: 'IN_PROGRESS' }, { id: 'WC-01', status: 'IN_PROGRESS' },
    ]);
    return r.accepted.length === 1 && r.accepted[0].id === 'WC-01' && r.root_product_selection_count === 3;
  })(),
  JSON.stringify(B.filterToCmWork([{ id: 'WC-11' }, { id: 'WC-01' }])));
check('ROOT_POINTER_IS_NOT_CM_WORK_ITEM', 'pointeur ROOT non selectionnable meme si ID=WC-01',
  B.isRootPointerRow(PTR_ROW_OWNER) === true
  && B.isRootPointerRow(PTR_ROW) === true
  && B.rootRowIsCmSelectable(PTR_ROW) === false
  && B.rootPointerIsNotCmWorkItem(PTR_ROW) === true
  && B.rootRowIsCmSelectable(ROOT_ROW) === false,
  JSON.stringify({ ptr: B.isRootPointerRow(PTR_ROW), sel: B.rootRowIsCmSelectable(PTR_ROW) }));
check('UNKNOWN_IS_FAIL_CLOSED', 'un ID inconnu n est pas selectionnable',
  B.classifyWorkItem('P2-TRUC-INCONNU').accepted === false
  && B.classifyWorkItem('P2-TRUC-INCONNU').reason === 'UNCLASSIFIED_FAIL_CLOSED',
  JSON.stringify(B.classifyWorkItem('P2-TRUC-INCONNU')));
check('CM_ROADMAP_IS_CANONICAL_QUEUE', 'CM/ROADMAP.md = file canonique (WC-01 present, aucun produit)',
  (() => {
    const q = B.readCmQueue();
    return q.some((i) => i.id === 'WC-01') && q.every((i) => i.owner === 'CM');
  })(),
  JSON.stringify(B.readCmQueue().map((i) => i.id)));
check('BOUNDARY_CONSTANTS', 'ROOT_ROADMAP_IS_WORK_QUEUE=false et ROOT_PRODUCT_TASK_SELECTION_ALLOWED=false',
  B.ROOT_ROADMAP_IS_WORK_QUEUE === false && B.ROOT_PRODUCT_TASK_SELECTION_ALLOWED === false,
  'constantes');

console.log('\n' + (failed === 0 ? 'ALL PASS' : failed + ' FAIL'));
process.exit(failed === 0 ? 0 : 1);
