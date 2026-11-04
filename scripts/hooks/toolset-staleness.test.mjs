import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { daysSince, staleMessage } from './toolset-staleness.mjs';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'toolset-staleness.mjs');
const NOW = new Date('2026-11-04T12:00:00Z');

/** Roda o hook como o Claude Code roda: processo próprio, raiz do projeto em CLAUDE_PROJECT_DIR. */
function runHook(manifest) {
  const root = mkdtempSync(path.join(tmpdir(), 'staleness-'));
  if (manifest) {
    mkdirSync(path.join(root, '.claude', 'ecc-sync'), { recursive: true });
    writeFileSync(path.join(root, '.claude', 'ecc-sync', 'manifest.json'), JSON.stringify(manifest));
  }
  // execFileSync lança se o código de saída não for 0: chegar ao retorno já prova o exit 0.
  return execFileSync(process.execPath, [SCRIPT], { env: { ...process.env, CLAUDE_PROJECT_DIR: root }, encoding: 'utf8' });
}

const isoDaysAgo = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

test('10 days since the last sync, limit 30: prints nothing', () => {
  assert.equal(staleMessage({ syncedAt: '2026-10-25', syncStaleDays: 30 }, NOW), null);
  assert.equal(runHook({ syncedAt: isoDaysAgo(10), syncStaleDays: 30 }), '');
});

test('45 days since the last sync, limit 30: prints one line suggesting the sync or the retro', () => {
  const msg = staleMessage({ syncedAt: '2026-09-20', syncStaleDays: 30 }, NOW);
  assert.equal(msg, '[toolset] último sync com o ECC há 45 dias (limite 30): rode /sync-ecc-tools ou /toolset-retro.');
  const out = runHook({ syncedAt: isoDaysAgo(45), syncStaleDays: 30 });
  assert.equal(out.split('\n').filter(Boolean).length, 1, 'exactly one line');
  assert.match(out, /há 45 dias \(limite 30\): rode \/sync-ecc-tools ou \/toolset-retro/);
});

test('manifest missing: exits 0 and prints nothing', () => {
  assert.equal(runHook(null), '');
});

test('the limit is read from the manifest, not hard-coded', () => {
  assert.equal(staleMessage({ syncedAt: '2026-09-20', syncStaleDays: 60 }, NOW), null);
  assert.match(staleMessage({ syncedAt: '2026-10-25', syncStaleDays: 7 }, NOW), /há 10 dias \(limite 7\)/);
});

test('exactly at the limit is still current', () => {
  assert.equal(staleMessage({ syncedAt: '2026-10-05', syncStaleDays: 30 }, NOW), null);
});

test('an invalid manifest yields one explanatory line instead of a silent pass', () => {
  assert.match(staleMessage({ syncedAt: '2026-09-20' }, NOW), /sem `syncStaleDays` válido/);
  assert.match(staleMessage({ syncedAt: 'ontem', syncStaleDays: 30 }, NOW), /sem `syncedAt` válido/);
  assert.equal(daysSince('2026-13-45', NOW), null);
});
