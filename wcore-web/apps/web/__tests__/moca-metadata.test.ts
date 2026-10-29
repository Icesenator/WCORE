import {test} from 'node:test';import assert from 'node:assert/strict';import {getExplorerUrl} from '../lib/explorers';
test('Moca explorer lien de lecture disponible',()=>assert.equal(getExplorerUrl('MOCA','0x0000000000000000000000000000000000000001'),'https://scan.mocachain.org/address/0x0000000000000000000000000000000000000001'));
