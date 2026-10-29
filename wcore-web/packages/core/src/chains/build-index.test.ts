import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('obsolete generator refuses to overwrite a maintained registry, even with stale upstream fixtures', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wcore-registry-'));
  try {
    const chains = join(dir, 'wcore-web/packages/core/src/chains');
    const upstream = join(dir, 'wcore-gsheet/dist/chains');
    mkdirSync(chains, { recursive: true }); mkdirSync(upstream, { recursive: true });
    writeFileSync(join(upstream, 'SUPERSEED.ts'), 'stale');
    writeFileSync(join(chains, 'index.ts'), 'maintained guard and overrides');
    copyFileSync(new URL('./build-index.mjs', import.meta.url), join(chains, 'build-index.mjs'));
    const result = spawnSync(process.execPath, [join(chains, 'build-index.mjs')], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /manually maintained|obsolete/i);
    assert.equal(readFileSync(join(chains, 'index.ts'), 'utf8'), 'maintained guard and overrides');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
