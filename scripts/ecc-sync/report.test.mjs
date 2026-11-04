// Unit tests for the pure core of the ECC sync helper.
// Run: node --test scripts/ecc-sync/report.test.mjs
//
// These cover the decision logic that drives a sync run. They are intentionally git-free:
// every function under test operates on injected strings, so the tricky cases ("track but
// behind" vs "adapted", pasted code whose origin moved, an empty stack) need no fixture repo.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalize,
  contentsMatch,
  changedAlsoTracks,
  classifyItem,
  findNewUpstream,
  partitionInventory,
  parseFrontmatter,
  describe,
  extractStackSection,
  stackKeywords,
  splitCandidatesByStack,
  renderCandidates,
  buildCatalog,
  policyExclusion,
  partitionByPolicy,
  citesOtherTools,
  otherToolsMarker,
} from './report.mjs';

// --- normalize / contentsMatch -------------------------------------------------

test('normalize collapses CRLF and trailing newlines', () => {
  assert.equal(normalize('a\r\nb\n\n\n'), 'a\nb\n');
  assert.equal(normalize(null), null);
});

test('contentsMatch ignores trailing-newline noise but not real edits', () => {
  assert.equal(contentsMatch('x\n', 'x\n\n'), true);
  assert.equal(contentsMatch('x', 'x\ny'), false);
  assert.equal(contentsMatch(null, 'x'), false, 'a missing side never matches');
});

// --- track policy --------------------------------------------------------------

test('track + unchanged upstream -> unchanged/none', () => {
  const r = classifyItem({ policy: 'track' }, { downstream: 'v1', base: 'v1', target: 'v1' });
  assert.deepEqual(r, { status: 'unchanged', action: 'none' });
});

test('track + upstream advanced -> update/overwrite', () => {
  const r = classifyItem({ policy: 'track' }, { downstream: 'old', base: 'old', target: 'new' });
  assert.deepEqual(r, { status: 'update', action: 'overwrite' });
});

test('track but locally edited (no longer matches base) -> drifted/review', () => {
  const r = classifyItem({ policy: 'track' }, { downstream: 'hand-edited', base: 'old', target: 'new' });
  assert.deepEqual(r, { status: 'drifted', action: 'review' });
});

test('track + source removed upstream -> removed-upstream/review', () => {
  const r = classifyItem({ policy: 'track' }, { downstream: 'v1', base: 'v1', target: null });
  assert.deepEqual(r, { status: 'removed-upstream', action: 'review' });
});

// --- adapt policy ----------------------------------------------------------------

test('adapt + upstream unchanged since last review -> unchanged/none', () => {
  const r = classifyItem({ policy: 'adapt' }, { downstream: 'mine', base: 'up1', target: 'up1' });
  assert.deepEqual(r, { status: 'unchanged', action: 'none' });
});

test('adapt + upstream changed -> review/port-by-hand (never overwrite)', () => {
  const r = classifyItem({ policy: 'adapt' }, { downstream: 'mine', base: 'up1', target: 'up2' });
  assert.deepEqual(r, { status: 'review', action: 'port-by-hand' });
  assert.notEqual(r.action, 'overwrite', 'adapted files are never auto-overwritten');
});

// --- alsoTracks: code pasted from other upstream files --------------------------

const hookItem = { policy: 'adapt', alsoTracks: ['scripts/lib/utils.js', 'scripts/lib/transcript-context.js'] };

test('alsoTracks: main source unchanged but one pasted origin changed -> review', () => {
  const also = [
    { path: 'scripts/lib/utils.js', base: 'u1', target: 'u2' },
    { path: 'scripts/lib/transcript-context.js', base: 't1', target: 't1' },
  ];
  const r = classifyItem(hookItem, { downstream: 'mine', base: 'h1', target: 'h1', also });
  assert.deepEqual(r, { status: 'review', action: 'port-by-hand' });
  assert.deepEqual(changedAlsoTracks(also), ['scripts/lib/utils.js'], 'only the origin that moved is reported');
});

test('alsoTracks: every origin unchanged -> unchanged', () => {
  const also = [
    { path: 'scripts/lib/utils.js', base: 'u1\n', target: 'u1\n\n' }, // trailing-newline noise only
    { path: 'scripts/lib/transcript-context.js', base: 't1', target: 't1' },
  ];
  const r = classifyItem(hookItem, { downstream: 'mine', base: 'h1', target: 'h1', also });
  assert.deepEqual(r, { status: 'unchanged', action: 'none' });
  assert.deepEqual(changedAlsoTracks(also), []);
});

test('alsoTracks: an origin removed upstream counts as changed', () => {
  assert.deepEqual(changedAlsoTracks([{ path: 'scripts/lib/utils.js', base: 'u1', target: null }]), ['scripts/lib/utils.js']);
});

test('alsoTracks on a track item: a moved origin forces review instead of a blind overwrite', () => {
  const also = [{ path: 'scripts/lib/utils.js', base: 'u1', target: 'u2' }];
  const r = classifyItem({ policy: 'track' }, { downstream: 'v1', base: 'v1', target: 'v2', also });
  assert.deepEqual(r, { status: 'review', action: 'port-by-hand' });
});

// --- local policy --------------------------------------------------------------

test('local -> always skipped regardless of versions', () => {
  const r = classifyItem({ policy: 'local' }, { downstream: 'x', base: null, target: null });
  assert.deepEqual(r, { status: 'local', action: 'skip' });
});

// --- new-upstream detection ----------------------------------------------------

test('findNewUpstream returns only sources absent from the manifest', () => {
  const manifestSources = ['skills/coding-standards', 'agents/code-reviewer.md', null];
  const inventory = [
    { kind: 'skill', source: 'skills/coding-standards' }, // known
    { kind: 'skill', source: 'skills/django-patterns' }, // new
    { kind: 'agent', source: 'agents/go-reviewer.md' }, // new
  ];
  const out = findNewUpstream(manifestSources, inventory);
  assert.deepEqual(out.map((x) => x.source), ['skills/django-patterns', 'agents/go-reviewer.md']);
});

test('partitionInventory splits adopted / discarded / available with no overlap', () => {
  const inv = [
    { kind: 'skill', source: 'skills/coding-standards' }, // adopted
    { kind: 'skill', source: 'skills/postgres-patterns' }, // discarded
    { kind: 'agent', source: 'agents/go-reviewer.md' }, // available
  ];
  const out = partitionInventory(inv, ['skills/coding-standards'], ['skills/postgres-patterns']);
  assert.deepEqual(out.adopted.map((x) => x.source), ['skills/coding-standards']);
  assert.deepEqual(out.discardedPresent.map((x) => x.source), ['skills/postgres-patterns']);
  assert.deepEqual(out.available.map((x) => x.source), ['agents/go-reviewer.md']);
});

// --- frontmatter / descriptions ------------------------------------------------

test('parseFrontmatter reads plain, quoted and folded values', () => {
  const md = [
    '---',
    'name: go-reviewer',
    'description: "Reviews Go code: idioms, errors"',
    'summary: >-',
    '  spans two',
    '  lines',
    'tools: [Read, Grep]',
    '---',
    '# Title',
  ].join('\n');
  const fm = parseFrontmatter(md);
  assert.equal(fm.name, 'go-reviewer');
  assert.equal(fm.description, 'Reviews Go code: idioms, errors');
  assert.equal(fm.summary, 'spans two lines');
  assert.deepEqual(parseFrontmatter('# no frontmatter'), {});
});

test('describe falls back to the first heading when there is no description', () => {
  assert.equal(describe('---\npaths:\n  - "**/*.go"\n---\n# Go Coding Style\n\ntext'), 'Go Coding Style');
  assert.equal(describe(null), '');
});

// --- the ## Stack section --------------------------------------------------------

const TEMPLATE_CLAUDE_MD = [
  '# CLAUDE.md',
  '',
  '## Stack',
  '',
  '> O `/sync-ecc-tools` usa esta seção para sugerir skills.',
  '<!-- preencha abaixo -->',
  '- Linguagens: <linguagens e versões>',
  '- Banco: <banco de dados>',
  '',
  '> Se esta seção estiver vazia, rode `/sync-ecc-tools --adopt`.',
  '',
  '## Portões de verificação',
  '',
  '| Portão | Comando |',
].join('\n');

test('extractStackSection: a template full of placeholders and notes is empty', () => {
  assert.equal(extractStackSection(TEMPLATE_CLAUDE_MD), '');
  assert.equal(extractStackSection('# no stack section'), '');
});

test('extractStackSection: a filled section keeps only the stack lines', () => {
  const filled = TEMPLATE_CLAUDE_MD.replace('<linguagens e versões>', 'Go 1.23').replace('<banco de dados>', 'PostgreSQL 16');
  assert.equal(extractStackSection(filled), 'Go 1.23\nPostgreSQL 16');
});

test('stackKeywords drops versions and stopwords and adds aliases', () => {
  const k = stackKeywords('Linguagens: Go 1.23\nBanco: PostgreSQL 16 com Docker');
  assert.ok(k.has('go') && k.has('golang') && k.has('postgresql') && k.has('postgres') && k.has('docker'));
  assert.ok(!k.has('1.23') && !k.has('16') && !k.has('com'));
  assert.equal(stackKeywords('').size, 0);
});

test('labels and generic category words do not become keywords', () => {
  const filled = TEMPLATE_CLAUDE_MD.replace('<linguagens e versões>', 'Go 1.23').replace('- Banco: <banco de dados>', '- Testes: go test');
  assert.deepEqual([...stackKeywords(extractStackSection(filled))].sort(), ['go', 'golang']);
});

// --- candidates are never hidden --------------------------------------------------

const CANDIDATES = [
  { kind: 'agent', source: 'agents/go-reviewer.md', name: 'go-reviewer', description: 'Expert Go code reviewer.' },
  { kind: 'skill', source: 'skills/postgres-patterns', name: 'postgres-patterns', description: 'PostgreSQL schema and query patterns.' },
  { kind: 'skill', source: 'skills/react-patterns', name: 'react-patterns', description: 'React hooks and composition.' },
  { kind: 'command', source: 'commands/checkpoint.md', name: 'checkpoint', description: '' },
];

test('with a stack, candidates split into related and others, and none is lost', () => {
  const { related, others } = splitCandidatesByStack(CANDIDATES, stackKeywords('Go 1.23, PostgreSQL'));
  assert.deepEqual(related.map((c) => c.name), ['go-reviewer', 'postgres-patterns']);
  assert.deepEqual(others.map((c) => c.name), ['react-patterns', 'checkpoint']);
  assert.equal(related.length + others.length, CANDIDATES.length);
});

test('with an empty stack, every candidate goes to others and the report says the stack is empty', () => {
  const { related, others } = splitCandidatesByStack(CANDIDATES, stackKeywords(''));
  assert.equal(related.length, 0);
  assert.equal(others.length, CANDIDATES.length);
  const md = renderCandidates(CANDIDATES, '');
  const firstLine = md.split('\n').filter(Boolean)[1];
  assert.match(firstLine, /preencha `## Stack` e use `\/sync-ecc-tools --adopt`; abaixo está o catálogo completo/);
  assert.match(md, /### Ligados à sua stack \(0\)/);
  assert.match(md, /### Outros \(4\)/);
  assert.match(md, /### Excluídos por política \(0\)/);
  for (const c of CANDIDATES) assert.ok(md.includes(c.source), `${c.source} listed`);
  assert.match(md, /`agents\/go-reviewer\.md` \(agent\) - Expert Go code reviewer\./, 'one description line each');
});

test('with a stack, the report lists both groups with every candidate', () => {
  const md = renderCandidates(CANDIDATES, 'Go');
  assert.match(md, /### Ligados à sua stack \(1\)/);
  assert.match(md, /### Outros \(3\)/);
  for (const c of CANDIDATES) assert.ok(md.includes(c.source), `${c.source} listed`);
});

// --- catalog ---------------------------------------------------------------------

const ENTRIES = [
  { type: 'skill', source: 'skills/tdd-workflow', text: '---\nname: tdd-workflow\ndescription: Tests first.\n---\n' },
  { type: 'agent', source: 'agents/go-reviewer.md', text: '---\nname: go-reviewer\ndescription: Go review.\n---\n' },
  { type: 'skill', source: 'skills/healthcare-emr-patterns', text: '---\ndescription: EMR.\n---\n' },
  { type: 'agent', source: 'agents/healthcare-reviewer.md', text: '---\ndescription: Clinical.\n---\n' },
  { type: 'skill', source: 'skills/hipaa-compliance', text: '---\ndescription: HIPAA.\n---\n' },
  { type: 'rule', source: 'rules/golang/coding-style.md', text: '---\npaths:\n  - "**/*.go"\n---\n# Go Coding Style\n' },
  { type: 'command', source: 'commands/build-fix.md', text: '---\ndescription: Fix the build.\n---\n' },
];

test('buildCatalog lists every item with its fields, adopted flag, and no health items', () => {
  const c = buildCatalog({ eccRepo: 'affaan-m/ECC', ref: 'abc', entries: ENTRIES, adoptedSources: ['skills/tdd-workflow', null] });
  assert.deepEqual(c.items.map((i) => i.name), ['go-reviewer', 'build-fix', 'golang/coding-style', 'tdd-workflow']);
  assert.deepEqual(c.items.find((i) => i.name === 'tdd-workflow'), {
    name: 'tdd-workflow', type: 'skill', description: 'Tests first.', source: 'skills/tdd-workflow', adopted: true,
  });
  assert.equal(c.items.find((i) => i.name === 'golang/coding-style').description, 'Go Coding Style');
  assert.ok(c.items.every((i) => !/healthcare|hipaa/.test(i.name)));
  assert.equal(c.items.filter((i) => i.adopted).length, 1);
});

test('buildCatalog is deterministic: input order does not matter and there is no timestamp', () => {
  const a = buildCatalog({ eccRepo: 'affaan-m/ECC', ref: 'abc', entries: ENTRIES, adoptedSources: [] });
  const b = buildCatalog({ eccRepo: 'affaan-m/ECC', ref: 'abc', entries: [...ENTRIES].reverse(), adoptedSources: [] });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.ok(!/generatedAt|syncedAt|\d{4}-\d{2}-\d{2}T/.test(JSON.stringify(a)), 'no timestamp in the body');
});

// --- exclusion by policy -----------------------------------------------------------

const WITH_HEALTH = [
  ...CANDIDATES,
  { kind: 'agent', source: 'agents/healthcare-reviewer.md', name: 'healthcare-reviewer', description: 'Clinical safety and PHI review for Go and PostgreSQL services.' },
  { kind: 'skill', source: 'skills/hipaa-compliance', name: 'hipaa-compliance', description: 'HIPAA compliance.' },
];

test('policyExclusion names the reason for health items and nothing else', () => {
  assert.match(policyExclusion('healthcare-emr-patterns'), /health/);
  assert.match(policyExclusion('hipaa-compliance'), /health/);
  assert.equal(policyExclusion('go-reviewer'), null);
  assert.equal(policyExclusion('codehealth-mcp'), null, 'a word containing "health" is not the health domain');
});

test('partitionByPolicy moves excluded items out without losing any', () => {
  const { excluded, kept } = partitionByPolicy(WITH_HEALTH);
  assert.deepEqual(excluded.map((c) => c.name), ['healthcare-reviewer', 'hipaa-compliance']);
  assert.equal(excluded.length + kept.length, WITH_HEALTH.length);
});

test('the report lists excluded items in their own section, never among stack candidates, even when they match the stack', () => {
  const md = renderCandidates(WITH_HEALTH, 'Go, PostgreSQL');
  const section = (title) => md.split(`### ${title}`)[1].split('### ')[0];
  assert.match(md, /### Ligados à sua stack \(2\)/);
  assert.match(md, /### Outros \(2\)/);
  assert.match(md, /### Excluídos por política \(2\)/);
  assert.ok(!section('Ligados à sua stack').includes('healthcare-reviewer'), 'a stack match does not pull it back');
  assert.ok(!section('Outros').includes('hipaa-compliance'));
  assert.match(section('Excluídos por política'), /`agents\/healthcare-reviewer\.md` \(agent\) - health domain/);
});

test('catalog and report share the same policy list', () => {
  const c = buildCatalog({
    eccRepo: 'affaan-m/ECC',
    ref: 'abc',
    entries: WITH_HEALTH.map((x) => ({ type: x.kind, source: x.source, text: `---\ndescription: ${x.description || 'x'}\n---\n` })),
    adoptedSources: [],
  });
  const { excluded } = partitionByPolicy(WITH_HEALTH);
  for (const e of excluded) assert.ok(!c.items.some((i) => i.source === e.source), `${e.source} not in catalog`);
  assert.equal(c.items.length, WITH_HEALTH.length - excluded.length);
});

// --- items that cite another AI coding tool ---------------------------------------

test('citesOtherTools finds each tool term once, in list order, and nothing in a clean text', () => {
  assert.deepEqual(citesOtherTools('Works in Codex and Cursor; see ~/.codex/skills and .agents/skills/. OpenAI too.'),
    ['Codex', 'Cursor', 'OpenAI', '~/.codex', '.agents/']);
  assert.deepEqual(citesOtherTools('Use GitHub Copilot or Gemini CLI; read AGENTS.md'), ['Copilot', 'Gemini', 'AGENTS.md']);
  assert.deepEqual(citesOtherTools('Run the tests with the project runner.'), []);
  assert.deepEqual(citesOtherTools('see .claude/agents/planner.md'), [], 'the .claude/agents/ dir is not .agents/');
  assert.deepEqual(citesOtherTools(null), []);
});

test('otherToolsMarker is the short-list marker, empty when nothing is cited', () => {
  assert.equal(otherToolsMarker(['Codex', '~/.codex']), 'cita outra ferramenta: Codex, ~/.codex');
  assert.equal(otherToolsMarker([]), '');
  assert.equal(otherToolsMarker(undefined), '');
});

test('the catalog flags an item by its whole body, keeps it, and omits the field when clean', () => {
  const c = buildCatalog({
    eccRepo: 'affaan-m/ECC',
    ref: 'abc',
    entries: [
      { type: 'skill', source: 'skills/search-tools', text: '---\ndescription: Search.\n---\n', body: 'SKILL.md\tCheck ~/.codex/skills' },
      { type: 'skill', source: 'skills/tdd-workflow', text: '---\ndescription: Tests first.\n---\n' },
    ],
    adoptedSources: [],
  });
  assert.deepEqual(c.items.find((i) => i.name === 'search-tools').citesOtherTools, ['Codex', '~/.codex']);
  assert.ok(!('citesOtherTools' in c.items.find((i) => i.name === 'tdd-workflow')));
  assert.equal(c.items.length, 2, 'a flagged item is never removed');
});

test('the report prints the marker on the candidate line and still lists the candidate', () => {
  const md = renderCandidates([
    { kind: 'skill', source: 'skills/search-tools', name: 'search-tools', description: 'Search.', citesOtherTools: ['Codex'] },
    { kind: 'skill', source: 'skills/tdd-workflow', name: 'tdd-workflow', description: 'Tests first.', citesOtherTools: [] },
  ], '');
  assert.match(md, /`skills\/search-tools` \(skill\) - Search\. \[cita outra ferramenta: Codex\]/);
  assert.match(md, /`skills\/tdd-workflow` \(skill\) - Tests first\.$/m);
});
