// Tests for docs-check. Run: node --test scripts/docs-check/docs-check.test.mjs
// Each repository test builds a throwaway git repo with controlled dates (GIT_COMMITTER_DATE /
// GIT_AUTHOR_DATE), so the date logic is checked against real git output, not against assumptions.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseDocFrontmatter,
  extractPathTokens,
  linkedCode,
  symbolInCode,
  isResolved,
  localToday,
  runLinks,
  runDiff,
  runStale,
  staleCounts,
} from './docs-check.mjs';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'docs-check.mjs');

function repo() {
  const root = mkdtempSync(path.join(tmpdir(), 'docs-check-'));
  const run = (args, env = {}) =>
    execFileSync('git', ['-C', root, ...args], {
      encoding: 'utf8',
      env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', ...env },
    });
  run(['init', '-q', '-b', 'main']);
  run(['config', 'user.email', 'test@example.com']);
  run(['config', 'user.name', 'Test']);
  run(['config', 'commit.gpgsign', 'false']);
  const write = (rel, text) => {
    mkdirSync(path.join(root, path.dirname(rel)), { recursive: true });
    writeFileSync(path.join(root, rel), text);
  };
  const commit = (msg, date, authorDate = date) => {
    run(['add', '-A']);
    run(['commit', '-q', '-m', msg], { GIT_COMMITTER_DATE: `${date}T12:00:00Z`, GIT_AUTHOR_DATE: `${authorDate}T12:00:00Z` });
  };
  return { root, run, write, commit };
}

const doc = (fm, body) => `${fm ? `---\n${fm}\n---\n` : ''}# Doc\n\n${body}\n`;

// --- pure helpers -------------------------------------------------------------------

test('parseDocFrontmatter reads codigo and conferido-em and tolerates their absence', () => {
  const p = parseDocFrontmatter('---\ncodigo:\n  - src/a.js\n  - "src/b.js"\nconferido-em: 2026-10-01\n---\n# T\nbody');
  assert.deepEqual(p.codigo, ['src/a.js', 'src/b.js']);
  assert.equal(p.conferidoEm, '2026-10-01');
  assert.equal(p.body, '# T\nbody');
  assert.deepEqual(parseDocFrontmatter('# no frontmatter').codigo, []);
  assert.equal(parseDocFrontmatter('---\ntitle: x\n---\n').conferidoEm, null);
});

test('extractPathTokens finds paths with and without #symbol, inside or outside backticks', () => {
  const t = extractPathTokens('See `src/a.js#parse`, src/b.py and (lib/c.go). Not words.');
  assert.deepEqual(t, [
    { path: 'src/a.js', symbol: 'parse' },
    { path: 'src/b.py', symbol: null },
    { path: 'lib/c.go', symbol: null },
  ]);
});

test('linkedCode: a mention and a codigo entry both tie, a bare basename does not, docs/ is never code', () => {
  const known = new Set(['src/a.js', 'src/b.js', 'lib/c.js', 'docs/other.md']);
  const r = linkedCode('docs/implemented/x.md', doc('codigo:\n  - src/b.js', 'Uses `src/a.js` and c.js, see docs/other.md.'), known);
  assert.deepEqual(r.linked, ['src/a.js', 'src/b.js'], 'c.js alone is a basename: it must not tie lib/c.js');
  assert.deepEqual(r.mentions.map((m) => m.path), ['src/a.js']);
});

test('linkedCode resolves a markdown link relative to the doc folder', () => {
  const known = new Set(['scripts/x.mjs']);
  const r = linkedCode('docs/implemented/processo/x.md', doc(null, 'See [x](../../../scripts/x.mjs).'), known);
  assert.deepEqual(r.linked, ['scripts/x.mjs']);
});

test('symbolInCode ignores comment lines in the common syntaxes', () => {
  assert.equal(symbolInCode('function parse() {}', 'parse'), true);
  assert.equal(symbolInCode('// parse was here\n# parse\n-- parse\n/* parse */\n * parse', 'parse'), false);
  assert.equal(symbolInCode('const parseAll = 1', 'parse'), false, 'whole word only');
});

test('isResolved needs the doc in the diff and a changed conferido-em', () => {
  const base = doc('conferido-em: 2026-10-01', 'x');
  const changedSet = new Set(['docs/implemented/x.md']);
  const today = '2026-11-04';
  assert.equal(isResolved(changedSet, 'docs/implemented/x.md', base, doc('conferido-em: 2026-11-01', 'x'), today), true);
  assert.equal(isResolved(changedSet, 'docs/implemented/x.md', base, doc('conferido-em: 2026-10-01', 'y'), today), false, 'old date, line not changed');
  assert.equal(isResolved(new Set(), 'docs/implemented/x.md', base, doc('conferido-em: 2026-11-01', 'x'), today), false, 'not in the diff');
  assert.equal(isResolved(changedSet, 'docs/implemented/x.md', null, doc('conferido-em: 2026-11-01', 'x'), today), true, 'new doc with a date');
});

test('same day: conferido-em = today passes in or out of the diff; an old unchanged date fails', () => {
  const inDiff = new Set(['docs/implemented/x.md']);
  const conferredToday = doc('conferido-em: 2026-11-04', 'x');
  assert.equal(isResolved(new Set(), 'docs/implemented/x.md', conferredToday, conferredToday, '2026-11-04'), true, 'today, outside the diff');
  assert.equal(isResolved(inDiff, 'docs/implemented/x.md', conferredToday, doc('conferido-em: 2026-11-04', 'x edited'), '2026-11-04'), true, 'today, in the diff');
  const old = doc('conferido-em: 2026-10-01', 'x');
  assert.equal(isResolved(inDiff, 'docs/implemented/x.md', old, doc('conferido-em: 2026-10-01', 'x edited'), '2026-11-04'), false, 'old date, line not changed');
  assert.equal(isResolved(new Set(), 'docs/implemented/x.md', old, old, '2026-11-04'), false, 'old date, outside the diff');
  assert.match(localToday(new Date(2026, 10, 4, 23, 59)), /^2026-11-04$/, 'local date, not UTC');
});

test('same day through the CLI: code changed after a conference committed today passes without touching the doc', () => {
  const r = repo();
  r.write('src/a.js', 'v1\n');
  r.write('docs/implemented/x.md', doc(`conferido-em: ${localToday()}`, '`src/a.js`'));
  r.commit('init', '2026-10-01');
  r.run(['switch', '-q', '-c', 'feat']);
  r.write('src/a.js', 'v2\n');
  const out = execFileSync(process.execPath, [SCRIPT, 'diff'], { cwd: r.root, encoding: 'utf8' }); // throws on exit != 0
  assert.match(out, /\[resolvido\] docs\/implemented\/x\.md ← src\/a\.js/);
});

// --- links ----------------------------------------------------------------------------

test('links: broken link, missing codigo path and symbol only in a comment are all reported', () => {
  const r = repo();
  r.write('src/a.js', '// helper was removed\nexport const other = 1;\n');
  r.write('docs/implemented/x.md', doc('codigo:\n  - src/gone.js', 'Calls `src/a.js#helper`. See [y](y.md).'));
  r.commit('init', '2026-10-01');
  const problems = runLinks(r.root);
  assert.ok(problems.some((p) => p.includes('y.md (file not found)')), problems.join('\n'));
  assert.ok(problems.some((p) => p.includes('codigo: src/gone.js does not exist')), problems.join('\n'));
  assert.ok(problems.some((p) => p.includes('src/a.js#helper (symbol not found outside comments)')), problems.join('\n'));
});

test('links: a clean repo exits 0 through the CLI', () => {
  const r = repo();
  r.write('src/a.js', 'export function helper() {}\n');
  r.write('docs/implemented/x.md', doc('codigo:\n  - src/a.js', 'Calls `src/a.js#helper`. See [README](../README.md).'));
  r.write('docs/README.md', '# Docs\n');
  r.commit('init', '2026-10-01');
  assert.deepEqual(runLinks(r.root), []);
  execFileSync(process.execPath, [SCRIPT, 'links'], { cwd: r.root, encoding: 'utf8' }); // throws on exit != 0
});

// --- diff -----------------------------------------------------------------------------

function diffRepo() {
  const r = repo();
  r.write('src/a.js', 'export const a = 1;\n');
  r.write('src/b.js', 'export const b = 1;\n');
  r.write('docs/implemented/by-mention.md', doc('conferido-em: 2026-10-01', 'Behaviour of `src/a.js`.'));
  r.write('docs/implemented/by-codigo.md', doc('codigo:\n  - src/b.js\nconferido-em: 2026-10-01', 'No path in the text.'));
  r.write('docs/planned/future.md', doc(null, 'Will change `src/a.js`.'));
  r.commit('init', '2026-10-01');
  r.run(['switch', '-q', '-c', 'feat']);
  return r;
}

test('diff: a doc tied to changed code is unresolved until its conferido-em changes (exit 1, then 0)', () => {
  const r = diffRepo();
  r.write('src/a.js', 'export const a = 2;\n');
  r.write('src/b.js', 'export const b = 2;\n');
  r.commit('change code', '2026-10-05');
  let d = runDiff(r.root);
  assert.deepEqual(d.rows.map((x) => [x.doc, x.resolved, x.by]), [
    ['docs/implemented/by-codigo.md', false, ['src/b.js']],
    ['docs/implemented/by-mention.md', false, ['src/a.js']],
  ], 'planned/ is not checked');
  assert.throws(() => execFileSync(process.execPath, [SCRIPT, 'diff'], { cwd: r.root, encoding: 'utf8' }), (e) => e.status === 1);

  r.write('docs/implemented/by-mention.md', doc('conferido-em: 2026-10-05', 'Behaviour of `src/a.js`.'));
  r.write('docs/implemented/by-codigo.md', doc('codigo:\n  - src/b.js\nconferido-em: 2026-10-01', 'Text edited, date kept.'));
  d = runDiff(r.root);
  assert.deepEqual(d.rows.map((x) => [x.doc, x.resolved]), [
    ['docs/implemented/by-codigo.md', false],
    ['docs/implemented/by-mention.md', true],
  ], 'resolved only when conferido-em changed, even uncommitted');

  r.write('docs/implemented/by-codigo.md', doc('codigo:\n  - src/b.js\nconferido-em: 2026-10-05', 'Text edited, date kept.'));
  const out = execFileSync(process.execPath, [SCRIPT, 'diff'], { cwd: r.root, encoding: 'utf8' });
  assert.match(out, /\[resolvido\] docs\/implemented\/by-codigo\.md ← src\/b\.js/);
});

test('diff: an untracked new code file in the working tree ties the doc that cites it', () => {
  const r = diffRepo();
  r.write('src/new.js', 'export const n = 1;\n');
  r.write('docs/implemented/by-mention.md', doc('conferido-em: 2026-10-01', 'Behaviour of `src/a.js` and `src/new.js`.'));
  const d = runDiff(r.root);
  const row = d.rows.find((x) => x.doc === 'docs/implemented/by-mention.md');
  assert.deepEqual(row?.by, ['src/new.js']);
  assert.equal(row.resolved, false);
});

test('diff: on the base branch itself, only the working tree counts', () => {
  const r = repo();
  r.write('src/a.js', 'export const a = 1;\n');
  r.write('docs/implemented/x.md', doc('conferido-em: 2026-10-01', '`src/a.js`'));
  r.commit('init', '2026-10-01');
  assert.equal(runDiff(r.root).rows.length, 0, 'committed history on main is not a diff');
  r.write('src/a.js', 'export const a = 3;\n');
  const d = runDiff(r.root);
  assert.equal(d.onBase, true);
  assert.deepEqual(d.rows.map((x) => x.doc), ['docs/implemented/x.md']);
});

// --- stale ----------------------------------------------------------------------------

test('stale: uses the commit date, not the author date', () => {
  const r = repo();
  r.write('src/a.js', 'v1\n');
  r.write('docs/implemented/x.md', doc('conferido-em: 2026-10-10', '`src/a.js`'));
  r.commit('init', '2026-10-01');
  r.write('src/a.js', 'v2\n');
  r.commit('rebased change', '2026-10-20', '2026-09-01'); // authored before the check, committed after
  const [res] = runStale(r.root).results;
  assert.equal(res.status, 'stale');
  assert.deepEqual(res.changed, ['src/a.js']);
  assert.equal(res.commitsSince, 1);
});

test('stale: current when the tied code did not change after conferido-em', () => {
  const r = repo();
  r.write('src/a.js', 'v1\n');
  r.commit('code', '2026-10-01');
  r.write('docs/implemented/x.md', doc('conferido-em: 2026-10-10', '`src/a.js`'));
  r.commit('doc', '2026-10-10');
  assert.equal(runStale(r.root).results[0].status, 'current');
});

test('stale: never conferred, missing codigo path, README skipped, order oldest stale first', () => {
  const r = repo();
  r.write('src/a.js', 'v1\n');
  r.write('src/b.js', 'v1\n');
  r.write('docs/implemented/README.md', '# index\n`src/a.js`\n');
  r.write('docs/implemented/produto/old.md', doc('conferido-em: 2026-09-01', '`src/a.js`'));
  r.write('docs/implemented/produto/newer.md', doc('conferido-em: 2026-09-15', '`src/b.js`'));
  r.write('docs/implemented/processo/never.md', doc('codigo:\n  - src/missing.js', '`src/a.js`'));
  r.commit('init', '2026-09-01');
  r.write('src/a.js', 'v2\n');
  r.write('src/b.js', 'v2\n');
  r.commit('change', '2026-10-01');
  const { ordered, results } = runStale(r.root);
  assert.deepEqual(ordered.map((x) => [x.doc, x.status]), [
    ['docs/implemented/produto/old.md', 'stale'],
    ['docs/implemented/produto/newer.md', 'stale'],
    ['docs/implemented/processo/never.md', 'never'],
  ]);
  assert.ok(!results.some((x) => x.doc.endsWith('README.md')));
  assert.deepEqual(results.find((x) => x.doc.endsWith('never.md')).missing, ['src/missing.js']);
  assert.deepEqual(runStale(r.root, { area: 'produto' }).results.map((x) => x.doc).sort(), [
    'docs/implemented/produto/newer.md',
    'docs/implemented/produto/old.md',
  ]);
  assert.deepEqual(staleCounts(r.root), { stale: 2, never: 1 });
  const json = JSON.parse(execFileSync(process.execPath, [SCRIPT, 'stale', '--json', '--limit', '1'], { cwd: r.root, encoding: 'utf8' }));
  assert.equal(json.ordered.length, 1);
});

// --- docs-check: ignore ---------------------------------------------------------------

test('docs-check: ignore leaves a doc out of stale and diff (and so of the hook line)', () => {
  const r = repo();
  r.write('src/a.js', 'v1\n');
  r.write('docs/implemented/processo/template.md', doc('docs-check: ignore  # a copy must drop this key', 'Cites `src/a.js`.'));
  r.write('docs/implemented/real.md', doc('conferido-em: 2026-10-01', 'Cites `src/a.js`.'));
  r.commit('init', '2026-10-01');
  assert.equal(parseDocFrontmatter(doc('docs-check: ignore', 'x')).ignore, true);
  assert.equal(parseDocFrontmatter(doc('conferido-em: 2026-10-01', 'x')).ignore, false);
  assert.deepEqual(runStale(r.root).results.map((x) => x.doc), ['docs/implemented/real.md']);
  assert.deepEqual(staleCounts(r.root), { stale: 0, never: 0 });
  r.run(['switch', '-q', '-c', 'feat']);
  r.write('src/a.js', 'v2\n');
  assert.deepEqual(runDiff(r.root).rows.map((x) => x.doc), ['docs/implemented/real.md']);
});
