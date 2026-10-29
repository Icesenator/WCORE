// Lanceur GAS : re-serialise les arguments en JSON et invoque clasp via argv
// (PowerShell casse les guillemets embouts quand il appelle node directement).
import { spawnSync } from 'node:child_process';

const CLASP = 'C:/Users/strau/AppData/Roaming/npm/node_modules/@google/clasp/build/src/index.js';
const [fn, ...params] = process.argv.slice(2);
if (!fn) {
  console.error('usage: node tools/run-gas.mjs <FUNCTION> [args...]');
  process.exit(1);
}
const r = spawnSync(process.execPath, [CLASP, 'run', fn, '-p', JSON.stringify(params)], {
  encoding: 'utf8',
  cwd: 'D:/ProjetIA/WCORE/wcore-gsheet',
});
process.stdout.write(r.stdout || '');
process.stderr.write(r.stderr || '');
process.exit(r.status ?? 1);
