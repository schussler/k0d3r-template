import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { daysSince, staleMessage, docsMessage, docsLine } from './toolset-staleness.mjs';

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

test('an old targetRefDate with a recent syncedAt does not warn: only syncedAt counts', () => {
  const manifest = { syncedAt: '2026-11-04', targetRefDate: '2026-08-01', syncStaleDays: 30 };
  assert.equal(staleMessage(manifest, NOW), null);
  assert.equal(runHook({ ...manifest, syncedAt: isoDaysAgo(1) }), '');
});

// --- the docs line ---------------------------------------------------------------------

function gitRepo(files, date) {
  const root = mkdtempSync(path.join(tmpdir(), 'staleness-docs-'));
  const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_COMMITTER_DATE: `${date}T12:00:00Z`, GIT_AUTHOR_DATE: `${date}T12:00:00Z` };
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { env, encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(path.join(root, path.dirname(rel)), { recursive: true });
    writeFileSync(path.join(root, rel), text);
  }
  git('add', '-A');
  git('-c', 'user.email=t@example.com', '-c', 'user.name=T', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'init');
  return root;
}

test('docsMessage is one line with both counts, and null when there is nothing to say', () => {
  assert.equal(docsMessage({ stale: 2, never: 3 }), 'docs: 2 com código alterado desde a última conferência, 3 nunca conferidos (/audit-docs)');
  assert.equal(docsMessage({ stale: 0, never: 0 }), null);
  assert.equal(docsMessage(null), null);
});

test('the hook prints the docs line after the sync line, and nothing for docs that are current', () => {
  const root = gitRepo({
    'src/a.js': 'v1\n',
    'docs/implemented/never.md': '# Never\n\nDescribes `src/a.js`.\n',
    '.claude/ecc-sync/manifest.json': JSON.stringify({ syncedAt: '2026-01-01', syncStaleDays: 30 }),
  }, '2026-01-01');
  const out = execFileSync(process.execPath, [SCRIPT], { env: { ...process.env, CLAUDE_PROJECT_DIR: root }, encoding: 'utf8' });
  const lines = out.split('\n').filter(Boolean);
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^\[toolset\] último sync com o ECC há/);
  assert.equal(lines[1], 'docs: 0 com código alterado desde a última conferência, 1 nunca conferidos (/audit-docs)');

  const current = gitRepo({
    'src/a.js': 'v1\n',
    'docs/implemented/ok.md': '---\nconferido-em: 2026-01-01\n---\n# Ok\n\n`src/a.js`\n',
  }, '2026-01-01');
  assert.equal(docsLine(current), null);
});

test('the docs line never breaks the session: no git, an error or a slow count print nothing', () => {
  assert.equal(docsLine(mkdtempSync(path.join(tmpdir(), 'no-git-'))), null, 'not a git repository');
  assert.equal(docsLine('/x', 2000, () => { throw new Error('boom'); }), null, 'error');
  const slow = () => { const end = Date.now() + 30; while (Date.now() < end); return { stale: 1, never: 1 }; };
  assert.equal(docsLine('/x', 10, slow), null, 'over the time budget');
  assert.match(docsLine('/x', 1000, () => ({ stale: 1, never: 0 })), /^docs: 1 com código/);
});
