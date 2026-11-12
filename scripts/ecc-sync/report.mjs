#!/usr/bin/env node
// ECC -> project toolset sync helper (READ-ONLY for .claude/ content).
//
// Computes the upstream delta for the curated `.claude/` slice (and any other file listed in the
// manifest, such as a vendored hook) that was taken from ECC (affaan-m/ECC), and classifies every
// item so a human-in-the-loop `/sync-ecc-tools` run can plan the update. This script NEVER writes
// into `.claude/` except the two generated files it owns: the provenance manifest (`bootstrap`) and
// the catalog of everything ECC offers (`catalog`). Landing changes is done by the agent under the
// slash command, with approval - see docs/implemented/processo/ecc-sync.md.
//
// Usage:
//   node scripts/ecc-sync/report.mjs report    --ecc <path> [--to <ref>] [--manifest <p>] [--claude-md <p>] [--json <p>]
//   node scripts/ecc-sync/report.mjs catalog   --ecc <path> [--to <ref>] [--manifest <p>] [--out <p>]
//   node scripts/ecc-sync/report.mjs inventory --ecc <path> [--to <ref>] [--manifest <p>] [--out <p>]
//   node scripts/ecc-sync/report.mjs bootstrap --ecc <path> [--to <ref>] [--out <manifest>]
//
// --ecc defaults to ../ECC (a sibling of the project). Without --to, the target of report, inventory and
// bootstrap is the newest commit of the ECC main branch that is at least MIN_TARGET_AGE_DAYS old; a newer
// --to is allowed, but only as the human's explicit choice, recorded in the sync log.
// Exit codes: 0 ok, 1 usage/IO error.

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..'); // scripts/ecc-sync -> repo root
const DEFAULT_MANIFEST = path.join(REPO_ROOT, '.claude', 'ecc-sync', 'manifest.json');
const DEFAULT_CATALOG = path.join(REPO_ROOT, '.claude', 'ecc-sync', 'catalog.json');
const DEFAULT_CLAUDE_MD = path.join(REPO_ROOT, 'CLAUDE.md');
const CLAUDE_DIR = path.join(REPO_ROOT, '.claude');
const ECC_REPO = 'affaan-m/ECC';

// Exclusion by policy: ECC items this project never adopts, matched by name. The catalog leaves them out
// and the report lists them in their own section, never among the stack candidates.
export const POLICY_EXCLUSIONS = [
  { pattern: /healthcare|hipaa/i, reason: 'health domain (clinical/PHI/HIPAA), out of scope for this template' },
];
// Terms that show an ECC item was written for, or mentions, another AI coding tool. They are the
// tool terms of the template's residue check, kept here in one place: `catalog` stores the matches of each
// item (`citesOtherTools`) and `report` prints them next to each candidate. A match is a flag for the
// human ("adopt as track or adapt?"), never a reason to drop the item.
export const OTHER_TOOL_TERMS = [
  ['Codex', /\bcodex\b/i],
  ['Cursor', /\bcursor\b/i],
  ['Copilot', /\bcopilot\b/i],
  ['Gemini', /\bgemini\b/i],
  ['OpenAI', /\bopenai\b/i],
  ['~/.codex', /~\/\.codex\b/i],
  ['.agents/', /(?:^|[^\w.])\.agents\//im],
  ['AGENTS.md', /\bagents\.md\b/i],
];
// The default sync target must be at least this old: the same two-week rule the project uses for pinned
// npm versions. Fresh upstream commits get time to be fixed or reverted before they land here.
export const MIN_TARGET_AGE_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
// One report line per candidate; the full text lives in catalog.json.
const CANDIDATE_DESCRIPTION_MAX = 180;

// ---------------------------------------------------------------------------
// Pure core (exported for tests) - operates on plain strings, no git/fs.
// ---------------------------------------------------------------------------

/** Normalize text for content comparison: LF line endings, single trailing newline. */
export function normalize(text) {
  if (text == null) return null;
  return text.replace(/\r\n/g, '\n').replace(/\n+$/, '\n');
}

/** True only when both sides are present and normalize-equal. */
export function contentsMatch(a, b) {
  if (a == null || b == null) return false;
  return normalize(a) === normalize(b);
}

/**
 * Paths of the extra upstream origins (`alsoTracks`) whose content changed between the item's
 * lastSyncedRef and the target. A path that disappeared upstream counts as changed.
 * @param {{path:string, base:?string, target:?string}[]} also
 */
export function changedAlsoTracks(also = []) {
  return also.filter((o) => !contentsMatch(o.base, o.target)).map((o) => o.path);
}

/**
 * Classify one manifest item against the three relevant versions.
 * @param {{policy:string}} item
 * @param {{downstream:?string, base:?string, target:?string, also?:{path:string, base:?string, target:?string}[]}} v
 *   downstream = current local content; base = ECC@lastSyncedRef; target = ECC@to;
 *   also = the same pair for each extra origin the item pasted code from (`alsoTracks`).
 * @returns {{status:string, action:string}}
 */
export function classifyItem(item, v) {
  if (item.policy === 'local') {
    return { status: 'local', action: 'skip' };
  }
  const alsoChanged = changedAlsoTracks(v.also).length > 0;
  if (item.policy === 'adapt') {
    if (v.target == null) return { status: 'removed-upstream', action: 'review' };
    if (contentsMatch(v.base, v.target) && !alsoChanged) return { status: 'unchanged', action: 'none' };
    return { status: 'review', action: 'port-by-hand' }; // never auto-edited
  }
  // policy === 'track'
  if (v.target == null) return { status: 'removed-upstream', action: 'review' };
  if (v.downstream == null) return { status: 'missing-downstream', action: 'review' };
  if (!contentsMatch(v.downstream, v.base)) {
    return { status: 'drifted', action: 'review' }; // tracked file was edited locally
  }
  // An extra origin changed: overwriting the main file alone would leave the pasted code stale.
  if (alsoChanged) return { status: 'review', action: 'port-by-hand' };
  if (contentsMatch(v.base, v.target)) return { status: 'unchanged', action: 'none' };
  return { status: 'update', action: 'overwrite' };
}

/** The cutoff for the default target: `now` minus MIN_TARGET_AGE_DAYS, as an ISO timestamp for `git --before`. */
export function targetCutoff(now) {
  return new Date(now.getTime() - MIN_TARGET_AGE_DAYS * DAY_MS).toISOString();
}

/** Whole days between a commit date (`YYYY-MM-DD`) and `now`, or null when the date is not valid. */
export function targetAgeDays(commitDate, now) {
  if (typeof commitDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(commitDate)) return null;
  const then = Date.parse(`${commitDate}T00:00:00Z`);
  return Number.isNaN(then) ? null : Math.floor((now.getTime() - then) / DAY_MS);
}

/** Report header line for the target: its date, its age, and a warning when it breaks the 14-day rule. */
export function targetHeader(shortSha, commitDate, now, isDefault) {
  const age = targetAgeDays(commitDate, now);
  const ageText = age === null ? 'data desconhecida' : `${age} dias`;
  const origin = isDefault ? `alvo padrão: commit mais recente do main com pelo menos ${MIN_TARGET_AGE_DAYS} dias` : 'alvo escolhido com --to';
  const base = `- Target: \`${shortSha}\` (commit de ${commitDate || '?'}, ${ageText}; ${origin})`;
  if (age !== null && age >= MIN_TARGET_AGE_DAYS) return base;
  return `${base}\n- **[!] Alvo com menos de ${MIN_TARGET_AGE_DAYS} dias: só com escolha explícita da pessoa, registrada nas notas do log em docs/implemented/processo/ecc-sync.md.**`;
}

/** Labels of the OTHER_TOOL_TERMS found in an item's text, in list order; [] when none. */
export function citesOtherTools(text) {
  if (typeof text !== 'string') return [];
  return OTHER_TOOL_TERMS.filter(([, re]) => re.test(text)).map(([label]) => label);
}

/** The marker a candidate carries in the report and the --adopt short list, or '' when it cites none. */
export function otherToolsMarker(terms) {
  return terms && terms.length ? `cita outra ferramenta: ${terms.join(', ')}` : '';
}

/** The policy reason that excludes an ECC item by name, or null when it is not excluded. */
export function policyExclusion(name) {
  const rule = POLICY_EXCLUSIONS.find((r) => r.pattern.test(name || ''));
  return rule ? rule.reason : null;
}

/** Split candidates into those excluded by policy and the ones left for the stack split. */
export function partitionByPolicy(candidates) {
  const excluded = [];
  const kept = [];
  for (const c of candidates) {
    (policyExclusion(c.name || path.basename(c.source, '.md')) ? excluded : kept).push(c);
  }
  return { excluded, kept };
}

/** Sources present in `inventory` but absent from the manifest = adoption candidates. */
export function findNewUpstream(manifestSources, inventory) {
  const known = new Set(manifestSources.filter(Boolean));
  return inventory.filter((e) => !known.has(e.source));
}

/**
 * Split the upstream inventory into adopted / discarded / available by source.
 * `available` = upstream tools neither adopted nor explicitly discarded (the undecided tail).
 */
export function partitionInventory(inventory, adoptedSources, discardedSources) {
  const adopted = new Set(adoptedSources.filter(Boolean));
  const discarded = new Set(discardedSources.filter(Boolean));
  return {
    adopted: inventory.filter((e) => adopted.has(e.source)),
    discardedPresent: inventory.filter((e) => discarded.has(e.source)),
    available: inventory.filter((e) => !adopted.has(e.source) && !discarded.has(e.source)),
  };
}

function unquote(value) {
  const v = value.trim();
  if (v.startsWith('"') && v.endsWith('"') && v.length >= 2) {
    try {
      return JSON.parse(v);
    } catch {
      return v.slice(1, -1);
    }
  }
  if (v.startsWith("'") && v.endsWith("'") && v.length >= 2) return v.slice(1, -1).replace(/''/g, "'");
  return v;
}

/**
 * Top-level scalar keys of a Markdown file's YAML frontmatter (`---` ... `---`). Handles plain, quoted
 * and block (`>`, `>-`, `|`, `|-`) values; nested keys are ignored. Returns {} without frontmatter.
 */
export function parseFrontmatter(text) {
  if (typeof text !== 'string') return {};
  const src = text.replace(/\r\n/g, '\n');
  if (!src.startsWith('---\n')) return {};
  const end = src.indexOf('\n---', 4);
  if (end === -1) return {};
  const lines = src.slice(4, end).split('\n');
  const out = {};
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) continue;
    const [, key, raw] = m;
    if (/^[>|][+-]?$/.test(raw.trim())) {
      const block = [];
      while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1]) || lines[i + 1].trim() === '')) {
        block.push(lines[++i].trim());
      }
      out[key] = raw.trim().startsWith('>') ? block.filter(Boolean).join(' ') : block.join('\n').trim();
    } else {
      out[key] = unquote(raw);
    }
  }
  return out;
}

/** One-line description of an ECC file: frontmatter `description`, else its first `# ` heading. */
export function describe(text) {
  const fm = parseFrontmatter(text);
  const fromFm = typeof fm.description === 'string' ? fm.description : '';
  const heading = typeof text === 'string' ? (text.match(/^#\s+(.+)$/m) || [])[1] || '' : '';
  return (fromFm || heading).replace(/\s+/g, ' ').trim();
}

/**
 * The project's stack as written in the `## Stack` section of CLAUDE.md, with everything that is not
 * stack content removed: blockquotes (notes and triggers), HTML comments, `<placeholder>` spans,
 * lines left with only a label, and the `Label:` prefix of each line.
 * Returns '' when the section is missing or holds only placeholders.
 */
export function extractStackSection(claudeMd) {
  if (typeof claudeMd !== 'string') return '';
  const src = claudeMd.replace(/\r\n/g, '\n').replace(/<!--[\s\S]*?-->/g, '');
  const m = src.match(/^## Stack[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m);
  if (!m) return '';
  return m[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('>'))
    .map((line) => line.replace(/^[-*]\s+/, '').replace(/<[^>]*>/g, '').trim())
    // A line left with only a label ("Linguagens:") was a placeholder.
    .filter((line) => line && !/^[^:]*:$/.test(line))
    // The label names the slot, not the stack: "Testes: go test" contributes "go test".
    .map((line) => line.replace(/^[^:]{1,40}:\s*/, ''))
    .join('\n')
    .trim();
}

const STACK_STOPWORDS = new Set([
  'a', 'o', 'os', 'as', 'e', 'de', 'da', 'do', 'das', 'dos', 'em', 'no', 'na', 'com', 'para', 'por', 'via',
  'the', 'and', 'with', 'for', 'of', 'on', 'in', 'to', 'or', 'ou', 'um', 'uma', 'version', 'versao',
  // Generic stack vocabulary: it names a category, and would match every language's items of that category.
  'test', 'tests', 'testing', 'teste', 'testes', 'runner', 'e2e', 'unit', 'framework', 'frameworks', 'library',
  'linguagem', 'linguagens', 'language', 'languages', 'banco', 'dados', 'database', 'infra', 'infraestrutura',
]);
const STACK_ALIASES = {
  go: ['golang'], golang: ['go'],
  ts: ['typescript'], typescript: ['ts'],
  js: ['javascript'], javascript: ['js'],
  'node.js': ['node', 'nodejs'], nodejs: ['node'], node: ['nodejs'],
  postgres: ['postgresql'], postgresql: ['postgres'],
  k8s: ['kubernetes'], kubernetes: ['k8s'],
  'c#': ['csharp', 'dotnet'], '.net': ['dotnet', 'csharp'], dotnet: ['csharp'],
  'c++': ['cpp'], cpp: ['c++'],
  py: ['python'], 'next.js': ['nextjs'], nextjs: ['next.js'], 'nuxt.js': ['nuxt'],
};

function tokenize(text) {
  return String(text)
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .map((t) => (t === '.net' ? t : t.replace(/^\.+/, '').replace(/\.+$/, '')))
    .filter(Boolean);
}

/** Keywords that identify the stack: tokens of the section plus a few well-known aliases. */
export function stackKeywords(stackText) {
  const keywords = new Set();
  for (const token of tokenize(stackText)) {
    if (STACK_STOPWORDS.has(token) || /^[\d.]+$/.test(token) || (token.length < 2 && token !== 'c' && token !== 'r')) continue;
    keywords.add(token);
    for (const alias of STACK_ALIASES[token] || []) keywords.add(alias);
  }
  return keywords;
}

/**
 * Split the new upstream candidates into those related to the stack and all the others. Nothing is
 * ever dropped: `related.length + others.length === candidates.length`.
 * @param {{source:string, name?:string, description?:string}[]} candidates
 * @param {Set<string>} keywords - empty when the `## Stack` section is empty
 */
export function splitCandidatesByStack(candidates, keywords) {
  const related = [];
  const others = [];
  for (const c of candidates) {
    const hay = new Set([
      ...tokenize((c.name || path.basename(c.source, '.md')).replace(/[-_/]/g, ' ')),
      ...tokenize(c.description || ''),
    ]);
    const hit = keywords.size > 0 && [...keywords].some((k) => hay.has(k));
    (hit ? related : others).push(c);
  }
  return { related, others };
}

const TYPE_ORDER = { agent: 0, command: 1, rule: 2, skill: 3 };

/** Display name of an ECC source path: skill dir, agent/command basename, or `<dir>/<file>` for rules. */
export function catalogName(type, source) {
  if (type === 'skill') return source.replace(/^skills\//, '');
  if (type === 'rule') return source.replace(/^rules\//, '').replace(/\.md$/, '');
  return path.basename(source, '.md');
}

/**
 * The catalog of everything ECC offers at `ref`, minus the excluded domains. Deterministic: sorted by
 * type then name, no timestamp, so regenerating at the same ref yields the same bytes.
 * `text` is the item's main file (description); `body` is everything the item ships (a skill's whole dir),
 * scanned for OTHER_TOOL_TERMS and defaulting to `text`.
 * @param {{eccRepo:string, ref:string, entries:{type:string, source:string, text:?string, body?:?string}[], adoptedSources:string[]}} input
 */
export function buildCatalog({ eccRepo, ref, entries, adoptedSources }) {
  const adopted = new Set(adoptedSources.filter(Boolean));
  const items = entries
    .map((e) => {
      const item = {
        name: catalogName(e.type, e.source),
        type: e.type,
        description: describe(e.text),
        source: e.source,
        adopted: adopted.has(e.source),
      };
      const terms = citesOtherTools(e.body ?? e.text);
      return terms.length ? { ...item, citesOtherTools: terms } : item;
    })
    .filter((i) => !policyExclusion(i.name))
    .sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.name.localeCompare(b.name, 'en'));
  return {
    eccRepo,
    ref,
    note: 'Generated by `node scripts/ecc-sync/report.mjs catalog`. Do not hand-edit; regenerate when targetRef moves.',
    items,
  };
}

/** Render the candidate section of the report; never hides a candidate. */
export function renderCandidates(newUpstream, stackText) {
  const keywords = stackKeywords(stackText);
  const { excluded, kept } = partitionByPolicy(newUpstream);
  const { related, others } = splitCandidatesByStack(kept, keywords);
  const lines = [];
  const L = (s = '') => lines.push(s);
  const line = (c) => {
    const d = c.description || '';
    const short = d.length > CANDIDATE_DESCRIPTION_MAX ? `${d.slice(0, CANDIDATE_DESCRIPTION_MAX - 3)}...` : d;
    const marker = otherToolsMarker(c.citesOtherTools);
    return `- \`${c.source}\` (${c.kind})${short ? ` - ${short}` : ''}${marker ? ` [${marker}]` : ''}`;
  };
  const group = (title, rows, render = line) => {
    L(`### ${title} (${rows.length})`);
    L('');
    if (rows.length === 0) L('_Nenhum._');
    else for (const c of rows) L(render(c));
    L('');
  };
  L(`## New upstream candidates (${newUpstream.length}) - NOT adopted automatically`);
  L('');
  if (keywords.size === 0) {
    L('**A `## Stack` do CLAUDE.md está vazia: preencha `## Stack` e use `/sync-ecc-tools --adopt`; abaixo está o catálogo completo.**');
  } else {
    L(`_Palavras da \`## Stack\` do CLAUDE.md: ${[...keywords].sort().map((k) => `\`${k}\``).join(', ')}._`);
  }
  L('');
  group('Ligados à sua stack', related);
  group('Outros', others);
  group('Excluídos por política', excluded, (c) => `- \`${c.source}\` (${c.kind}) - ${policyExclusion(c.name || c.source)}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// git helpers (impure)
// ---------------------------------------------------------------------------

function git(ecc, args) {
  return execFileSync('git', ['-C', ecc, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function gitOrNull(ecc, args) {
  try {
    // Silence stderr: a missing path/ref is an expected, handled outcome here.
    return execFileSync('git', ['-C', ecc, ...args], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

/** Read a file blob at a ref, or null if it does not exist there. */
function showFile(ecc, ref, file) {
  return gitOrNull(ecc, ['show', `${ref}:${file}`]);
}

/** List tracked files under a dir at a ref (paths relative to repo root). */
function lsDir(ecc, ref, dir) {
  const out = gitOrNull(ecc, ['ls-tree', '-r', '--name-only', ref, '--', dir]);
  if (!out) return [];
  return out.split('\n').map((s) => s.trim()).filter(Boolean);
}

/**
 * Build a single comparable string for any source entry at a ref.
 * file -> normalized content; dir -> stable join of relpath + content.
 * Returns null when the entry is absent at that ref.
 */
function readEntry(ecc, ref, source, type) {
  if (type === 'dir') {
    const files = lsDir(ecc, ref, source);
    if (files.length === 0) return null;
    return files
      .sort()
      .map((f) => `${f.slice(source.length + 1)}\t${normalize(showFile(ecc, ref, f))}`)
      .join('\n---\n');
  }
  const content = showFile(ecc, ref, source);
  return content == null ? null : normalize(content);
}

/** Read the same entry from the downstream working tree. */
function readDownstream(downstreamRel, type) {
  const abs = path.join(REPO_ROOT, downstreamRel);
  if (!fs.existsSync(abs)) return null;
  if (type === 'dir') {
    const files = walk(abs).sort();
    if (files.length === 0) return null;
    return files
      .map((f) => `${path.relative(abs, f)}\t${normalize(fs.readFileSync(f, 'utf8'))}`)
      .join('\n---\n');
  }
  return normalize(fs.readFileSync(abs, 'utf8'));
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

/** Latest commit SHA whose `source` content matches `wantedSig`, or null. */
function findMatchingRef(ecc, source, type, wantedSig) {
  const log = gitOrNull(ecc, ['log', '--format=%H', '--', source]);
  if (!log) return null;
  for (const sha of log.split('\n').map((s) => s.trim()).filter(Boolean)) {
    if (readEntry(ecc, sha, source, type) === wantedSig) return sha;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Source mapping / inventory
// ---------------------------------------------------------------------------

/** Map a downstream `.claude/...` path to its ECC source path (top-level, no `.claude/`). */
function toSource(downstreamRel) {
  return downstreamRel.replace(/^\.claude\//, '');
}

/** Enumerate the curated downstream items as {downstream, source, type}. */
function enumerateDownstream() {
  const items = [];
  const add = (rel, type) => items.push({ downstream: rel, source: toSource(rel), type });
  for (const f of safeList(path.join(CLAUDE_DIR, 'agents'))) {
    if (f.endsWith('.md')) add(`.claude/agents/${f}`, 'file');
  }
  for (const f of safeList(path.join(CLAUDE_DIR, 'commands'))) {
    if (f.endsWith('.md')) add(`.claude/commands/${f}`, 'file');
  }
  for (const d of safeList(path.join(CLAUDE_DIR, 'skills'))) {
    if (fs.statSync(path.join(CLAUDE_DIR, 'skills', d)).isDirectory()) {
      add(`.claude/skills/${d}`, 'dir');
    }
  }
  for (const d of safeList(path.join(CLAUDE_DIR, 'rules'))) {
    const sub = path.join(CLAUDE_DIR, 'rules', d);
    if (!fs.statSync(sub).isDirectory()) continue;
    for (const f of safeList(sub)) if (f.endsWith('.md')) add(`.claude/rules/${d}/${f}`, 'file');
  }
  return items;
}

/** All ECC agents/commands/skills/rules at a ref, for new-tool detection and the catalog. */
function upstreamInventory(ecc, ref) {
  const inv = [];
  for (const line of lsDir(ecc, ref, 'agents')) {
    if (/^agents\/[^/]+\.md$/.test(line)) inv.push({ kind: 'agent', source: line, file: line });
  }
  for (const line of lsDir(ecc, ref, 'commands')) {
    if (/^commands\/[^/]+\.md$/.test(line)) inv.push({ kind: 'command', source: line, file: line });
  }
  for (const line of lsDir(ecc, ref, 'rules')) {
    if (/^rules\/[^/]+\/[^/]+\.md$/.test(line)) inv.push({ kind: 'rule', source: line, file: line });
  }
  const skillDirs = new Set();
  for (const line of lsDir(ecc, ref, 'skills')) {
    const m = line.match(/^skills\/([^/]+)\//);
    if (m) skillDirs.add(`skills/${m[1]}`);
  }
  for (const s of [...skillDirs].sort()) inv.push({ kind: 'skill', source: s, file: `${s}/SKILL.md` });
  return inv;
}

function withDescriptions(ecc, ref, entries) {
  return entries.map((e) => {
    const text = showFile(ecc, ref, e.file);
    const body = e.kind === 'skill' ? readEntry(ecc, ref, e.source, 'dir') : text;
    return { ...e, text, name: catalogName(e.kind, e.source), description: describe(text), citesOtherTools: citesOtherTools(body) };
  });
}

function safeList(dir) {
  try {
    return fs.readdirSync(dir).sort();
  } catch {
    return [];
  }
}

function readManifest(opts) {
  const manifestPath = opts.manifest || DEFAULT_MANIFEST;
  if (!fs.existsSync(manifestPath)) fail(`Manifest not found: ${manifestPath}\nRun "bootstrap" first.`);
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

/** The default target: newest first-parent commit of origin/<branch> at least MIN_TARGET_AGE_DAYS old. */
function defaultTarget(ecc, branch, now = new Date()) {
  const sha = (gitOrNull(ecc, ['rev-list', '-1', '--first-parent', `--before=${targetCutoff(now)}`, `origin/${branch}`]) || '').trim();
  if (!sha) fail(`No commit on origin/${branch} is at least ${MIN_TARGET_AGE_DAYS} days old (fetch the ECC clone, or pass --to explicitly).`);
  return sha;
}

function resolveTarget(ecc, opts, manifest, fallback) {
  if (opts.to) return git(ecc, ['rev-parse', opts.to]).trim();
  if (fallback) return git(ecc, ['rev-parse', fallback]).trim();
  return defaultTarget(ecc, manifest.eccBranch || 'main');
}

function commitDate(ecc, ref) {
  return (gitOrNull(ecc, ['show', '-s', '--format=%cs', ref]) || '').trim() || null;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function bootstrap(opts) {
  const ecc = opts.ecc;
  const target = opts.to ? git(ecc, ['rev-parse', opts.to]).trim() : defaultTarget(ecc, 'main');
  const out = opts.out || DEFAULT_MANIFEST;
  // Carry over what a human recorded (policy notes, extra origins, non-.claude items such as a vendored hook).
  const previous = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : { items: [] };
  const prevByDownstream = new Map(previous.items.map((i) => [i.downstream, i]));
  const items = [];
  for (const d of enumerateDownstream()) {
    const prev = prevByDownstream.get(d.downstream) || {};
    const downstreamSig = readDownstream(d.downstream, d.type);
    const presentAtTarget = readEntry(ecc, target, d.source, d.type) != null;
    if (!presentAtTarget) {
      items.push({ downstream: d.downstream, source: null, type: d.type, policy: 'local', lastSyncedRef: null });
      continue;
    }
    const matchRef = findMatchingRef(ecc, d.source, d.type, downstreamSig);
    if (matchRef) {
      items.push({ downstream: d.downstream, source: d.source, type: d.type, policy: 'track', lastSyncedRef: matchRef });
    } else {
      // Downstream matches no upstream commit -> locally adapted. Baseline is assigned
      // below to the vendoring point (NOT HEAD): the conservative choice so a future run
      // surfaces every upstream change to re-port and can never silently miss one.
      const item = { downstream: d.downstream, source: d.source, type: d.type, policy: 'adapt', lastSyncedRef: null };
      if (prev.adaptation) item.adaptation = prev.adaptation;
      if (prev.alsoTracks) item.alsoTracks = prev.alsoTracks;
      items.push(item);
    }
  }
  const enumerated = new Set(items.map((i) => i.downstream));
  for (const prev of previous.items) if (!enumerated.has(prev.downstream)) items.push(prev);
  const trackRefs = items.filter((i) => i.policy === 'track').map((i) => i.lastSyncedRef);
  // The vendoring point ~ the NEWEST per-file last-edit: the most recent commit the vendored
  // snapshot reflects. (The oldest would be misleading - a file untouched for months still
  // matches its ancient last-edit commit and would inflate the window to thousands of commits.)
  const baselineRef = newestRef(ecc, trackRefs) || target;
  // Pin each adapted item to its own upstream state as of the baseline (its last edit reachable
  // from baselineRef). So a future run's base..target diff shows exactly the upstream changes to
  // re-port - never under-reported, and without false positives for content already present.
  for (const i of items) {
    if (i.policy !== 'adapt' || i.lastSyncedRef != null) continue;
    i.lastSyncedRef = (gitOrNull(ecc, ['log', '-1', '--format=%H', baselineRef, '--', i.source]) || '').trim() || baselineRef;
  }
  const manifest = {
    eccRepo: ECC_REPO,
    eccBranch: previous.eccBranch || 'main',
    baselineRef,
    targetRef: target,
    // syncedAt = the day this conference against upstream ran (read by the staleness hook and the retro);
    // targetRefDate = the ECC commit date of targetRef, information only.
    syncedAt: new Date().toISOString().slice(0, 10),
    targetRefDate: commitDate(ecc, target),
    ...(previous.syncStaleDays ? { syncStaleDays: previous.syncStaleDays } : {}),
    note: 'policy: track|adapt|local. See docs/implemented/processo/ecc-sync.md.',
    items: items.sort((a, b) => a.downstream.localeCompare(b.downstream)),
    discarded: previous.discarded || [],
  };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`Wrote manifest: ${path.relative(REPO_ROOT, out)} (${items.length} items, baseline ${baselineRef.slice(0, 8)} -> target ${target.slice(0, 8)})\n`);
}

/** Of several refs, the most recent one (by committer date). */
function newestRef(ecc, refs) {
  const uniq = [...new Set(refs.filter(Boolean))];
  if (uniq.length === 0) return null;
  let newest = uniq[0];
  let newestTs = commitTs(ecc, newest);
  for (const r of uniq.slice(1)) {
    const ts = commitTs(ecc, r);
    if (ts > newestTs) { newest = r; newestTs = ts; }
  }
  return newest;
}

function commitTs(ecc, ref) {
  return Number((gitOrNull(ecc, ['show', '-s', '--format=%ct', ref]) || '0').trim()) || 0;
}

function report(opts) {
  const ecc = opts.ecc;
  const manifest = readManifest(opts);
  const target = resolveTarget(ecc, opts, manifest);

  const rows = [];
  for (const item of manifest.items) {
    const baseRef = item.lastSyncedRef || manifest.baselineRef;
    const base = item.source ? readEntry(ecc, baseRef, item.source, item.type) : null;
    const tgt = item.source ? readEntry(ecc, target, item.source, item.type) : null;
    const downstream = readDownstream(item.downstream, item.type);
    const also = (item.alsoTracks || []).map((p) => ({ path: p, base: showFile(ecc, baseRef, p), target: showFile(ecc, target, p) }));
    const { status, action } = classifyItem(item, { downstream, base, target: tgt, also });
    const changedOrigins = [];
    if (status === 'review' && item.source && !contentsMatch(base, tgt)) changedOrigins.push(item.source);
    if (status === 'review') changedOrigins.push(...changedAlsoTracks(also));
    const diffs = changedOrigins.map((p) => ({
      path: p,
      diff: (gitOrNull(ecc, ['diff', `${baseRef}..${target}`, '--', p]) || '').trim(),
    }));
    rows.push({ ...item, status, action, diffs });
  }

  const sources = manifest.items.map((i) => i.source);
  const allSources = [...sources, ...manifest.items.flatMap((i) => i.alsoTracks || [])].filter(Boolean);
  const newUpstream = withDescriptions(ecc, target, findNewUpstream(sources, upstreamInventory(ecc, target)))
    .map(({ kind, source, name, description, citesOtherTools: terms }) => ({ kind, source, name, description, citesOtherTools: terms }));
  const changelog = (gitOrNull(ecc, ['log', '--oneline', `${manifest.baselineRef}..${target}`, '--', ...allSources]) || '').trim();
  const claudeMdPath = opts['claude-md'] || DEFAULT_CLAUDE_MD;
  const stackText = fs.existsSync(claudeMdPath) ? extractStackSection(fs.readFileSync(claudeMdPath, 'utf8')) : '';

  const result = {
    eccRepo: manifest.eccRepo,
    baselineRef: manifest.baselineRef,
    targetRef: target,
    targetDate: commitDate(ecc, target),
    targetIsDefault: !opts.to,
    generatedAt: new Date().toISOString(),
    stack: stackText,
    rows,
    newUpstream,
    changelogLines: changelog ? changelog.split('\n') : [],
  };
  if (opts.json) {
    fs.mkdirSync(path.dirname(opts.json), { recursive: true });
    fs.writeFileSync(opts.json, `${JSON.stringify(result, null, 2)}\n`);
  }
  process.stdout.write(renderMarkdown(result));
}

function catalog(opts) {
  const ecc = opts.ecc;
  const manifest = readManifest(opts);
  const target = resolveTarget(ecc, opts, manifest, manifest.targetRef);
  const entries = upstreamInventory(ecc, target).map((e) => ({
    type: e.kind,
    source: e.source,
    text: showFile(ecc, target, e.file),
    body: e.kind === 'skill' ? readEntry(ecc, target, e.source, 'dir') : undefined,
  }));
  const result = buildCatalog({
    eccRepo: manifest.eccRepo,
    ref: target,
    entries,
    adoptedSources: manifest.items.map((i) => i.source),
  });
  const out = opts.out || DEFAULT_CATALOG;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
  const adopted = result.items.filter((i) => i.adopted).length;
  process.stdout.write(`Wrote catalog: ${path.relative(REPO_ROOT, out)} (${result.items.length} items, ${adopted} adopted, ref ${target.slice(0, 8)})\n`);
}

// ---------------------------------------------------------------------------
// inventory: adopted vs discarded vs available (generated doc)
// ---------------------------------------------------------------------------

function kindOf(downstream) {
  if (downstream.startsWith('.claude/agents/')) return 'agent';
  if (downstream.startsWith('.claude/commands/')) return 'command';
  if (downstream.startsWith('.claude/skills/')) return 'skill';
  if (downstream.startsWith('.claude/rules/')) return 'rule';
  return 'other';
}

/** Short display name for an adopted item (basename without .md, or skill/rule path tail). */
function leaf(downstream) {
  const k = kindOf(downstream);
  if (k === 'skill') return downstream.replace('.claude/skills/', '');
  if (k === 'rule') return downstream.replace('.claude/', '');
  if (k === 'other') return downstream;
  return downstream.split('/').pop().replace(/\.md$/, '');
}

function inventory(opts) {
  const ecc = opts.ecc;
  const manifest = readManifest(opts);
  const target = resolveTarget(ecc, opts, manifest);
  const inv = upstreamInventory(ecc, target);
  const discarded = manifest.discarded || [];
  const { available, discardedPresent } = partitionInventory(
    inv,
    manifest.items.map((i) => i.source),
    discarded.map((d) => d.source),
  );
  const discardedSourcesPresent = new Set(discardedPresent.map((e) => e.source));
  const md = renderInventory({ manifest, target, available, discarded, discardedSourcesPresent });
  if (opts.out) {
    fs.mkdirSync(path.dirname(opts.out), { recursive: true });
    fs.writeFileSync(opts.out, md);
    process.stdout.write(`Wrote ${path.relative(REPO_ROOT, opts.out)}\n`);
  } else {
    process.stdout.write(md);
  }
}

function renderInventory({ manifest, target, available, discarded, discardedSourcesPresent }) {
  const L = [];
  const w = (s = '') => L.push(s);
  const items = manifest.items;
  const byPolicy = (p) => items.filter((i) => i.policy === p);
  const groupKinds = (rows) => {
    const g = { agent: [], command: [], skill: [], rule: [], other: [] };
    for (const r of rows) g[kindOf(r.downstream)].push(leaf(r.downstream));
    return g;
  };
  const fmtKinds = (rows) => {
    const g = groupKinds(rows);
    const out = [];
    for (const k of ['agent', 'command', 'skill', 'rule', 'other']) {
      if (g[k].length) out.push(`  - ${k}s (${g[k].length}): ${g[k].sort().map((n) => `\`${n}\``).join(', ')}`);
    }
    return out;
  };

  w('# ECC tool inventory - adopted vs discarded vs available');
  w('');
  w('> Generated by `node scripts/ecc-sync/report.mjs inventory`. Source of truth: `.claude/ecc-sync/manifest.json`.');
  w('');
  w(`- Upstream: \`${manifest.eccRepo}\` @ \`${target.slice(0, 8)}\``);
  w(`- Adopted: **${items.length}** | explicitly discarded: **${discarded.length}** | available (undecided): **${available.length}**`);
  w('');

  w(`## Adopted (${items.length})`);
  w('');
  const tracks = byPolicy('track');
  w(`### Vendored clean - \`track\` (${tracks.length}) - overwritten from upstream on change`);
  for (const line of fmtKinds(tracks)) w(line);
  w('');
  const adapts = byPolicy('adapt');
  w(`### Adapted - \`adapt\` (${adapts.length}) - never auto-overwritten; upstream changes flagged for hand-port`);
  for (const r of adapts) {
    w(`  - \`${leaf(r.downstream)}\` (${kindOf(r.downstream)})`);
    if (r.adaptation) w(`    - ${r.adaptation}`); // what was changed from upstream, and why
    if (r.alsoTracks) w(`    - also tracks: ${r.alsoTracks.map((p) => `\`${p}\``).join(', ')}`);
  }
  w('');
  const locals = byPolicy('local');
  w(`### Project-local - \`local\` (${locals.length}) - no upstream source`);
  for (const r of locals) w(`  - \`${leaf(r.downstream)}\` (${kindOf(r.downstream)})`);
  w('');

  w(`## Deliberately discarded (${discarded.length}) - considered and rejected, with reason`);
  w('');
  if (discarded.length === 0) {
    w('_None recorded._');
  } else {
    w('| Upstream | Reason |');
    w('|---|---|');
    for (const d of discarded) {
      const gone = discardedSourcesPresent.has(d.source) ? '' : ' _(no longer upstream)_';
      w(`| \`${d.source}\`${gone} | ${d.reason} |`);
    }
  }
  w('');

  const av = { agent: 0, skill: 0, command: 0, rule: 0 };
  for (const e of available) av[e.kind] = (av[e.kind] || 0) + 1;
  w(`## Available - upstream, not adopted, not explicitly rejected (${available.length})`);
  w('');
  w('Not individually decided. The project adopts what fits the `## Stack` section of its CLAUDE.md;');
  w('`.claude/ecc-sync/catalog.json` describes every item, and `/sync-ecc-tools --adopt` adopts them.');
  w('');
  w(`- agents: ${av.agent} | skills: ${av.skill} | commands: ${av.command} | rules: ${av.rule}`);
  w('');
  return `${L.join('\n')}\n`;
}

function renderMarkdown(r) {
  const by = (s) => r.rows.filter((x) => x.status === s);
  const lines = [];
  const L = (s = '') => lines.push(s);
  L('# ECC -> project toolset sync report');
  L('');
  L(`- ECC repo: \`${r.eccRepo}\``);
  L(`- Baseline (vendoring-point estimate, changelog only): \`${r.baselineRef.slice(0, 8)}\` -> target: \`${r.targetRef.slice(0, 8)}\``);
  L(targetHeader(r.targetRef.slice(0, 8), r.targetDate, new Date(r.generatedAt), r.targetIsDefault));
  L('- Each item is classified against its own recorded `lastSyncedRef`, independent of the baseline above.');
  L(`- Generated: ${r.generatedAt}`);
  L('');
  L(`## Upstream changelog (${r.changelogLines.length} commits touching the vendored slice)`);
  L('');
  if (r.changelogLines.length === 0) L('_No upstream commits to the vendored paths since baseline - clean tools are current._');
  else for (const c of r.changelogLines) L(`- ${c}`);
  L('');
  section(L, 'Updates - track items to overwrite from upstream', by('update'), true);
  section(L, '[!] Needs review - adapted items, or items with pasted code, whose upstream changed (port by hand, never auto-edited)', by('review'), true, true);
  section(L, '[!] Drifted - tracked files edited locally (decide: re-track or mark adapt)', by('drifted'), true);
  section(L, 'Removed upstream - source no longer exists at target', by('removed-upstream'), true);
  section(L, 'Missing downstream - tracked item deleted locally', by('missing-downstream'), false);
  section(L, 'Unchanged - already current', by('unchanged'), false);
  section(L, 'Project-local - skipped (no upstream source)', by('local'), false);
  L(renderCandidates(r.newUpstream, r.stack));
  L('## Next steps');
  L('');
  L('1. Overwrite the **Updates** from `targetRef` and bump their `lastSyncedRef`.');
  L('2. For **Needs review** / **Drifted**, read the diffs above and port by hand.');
  L('3. Decide on **New upstream candidates** (default: leave unadopted; adoption is a human decision).');
  L('4. Update `.claude/ecc-sync/manifest.json` (`baselineRef`/`targetRef`/`syncedAt`), regenerate `catalog.json`, and append a row to `docs/implemented/processo/ecc-sync.md`.');
  L('');
  return lines.join('\n');
}

function section(L, title, rows, showAlways, withDiffs = false) {
  if (rows.length === 0 && !showAlways) return;
  L(`## ${title} (${rows.length})`);
  L('');
  if (rows.length === 0) L('_None._');
  for (const x of rows) {
    L(`- \`${x.downstream}\`${x.source ? ` <- \`${x.source}\`` : ''}`);
    if (!withDiffs) continue;
    for (const d of x.diffs || []) {
      L(`  - changed origin \`${d.path}\`:`);
      L('');
      L('```diff');
      L(d.diff || '(no textual diff: file added or removed upstream)');
      L('```');
      L('');
    }
  }
  L('');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) opts[a.slice(2)] = argv[++i];
    else opts._.push(a);
  }
  return opts;
}

function fail(msg) {
  process.stderr.write(`[ecc-sync] ${msg}\n`);
  process.exit(1);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const cmd = opts._[0];
  if (!opts.ecc) opts.ecc = path.resolve(REPO_ROOT, '..', 'ECC');
  if (!fs.existsSync(path.join(opts.ecc, '.git'))) fail(`Not a git repo: ${opts.ecc} (pass --ecc <path to an ECC clone>)`);
  // A shallow clone hides history below its floor, which would silently corrupt baseline
  // detection (and mask upstream commits). Refuse rather than report against partial history.
  if (gitOrNull(opts.ecc, ['rev-parse', '--is-shallow-repository'])?.trim() === 'true') {
    fail(`ECC clone is shallow - baseline detection needs full history.\n  Run: git -C ${opts.ecc} fetch --unshallow`);
  }
  if (cmd === 'bootstrap') return bootstrap(opts);
  if (cmd === 'report') return report(opts);
  if (cmd === 'catalog') return catalog(opts);
  if (cmd === 'inventory') return inventory(opts);
  fail('Usage: report.mjs <report|catalog|inventory|bootstrap> --ecc <path> [--to <ref>] [--manifest <p>] [--claude-md <p>] [--json <p>] [--out <p>]');
}

// Os dois lados passam pelo caminho real: chamado por um caminho com link simbólico (um worktree, `/tmp` no
// macOS), `import.meta.url` já vem resolvido e `process.argv[1]` não, e a comparação crua saía com 0 sem rodar.
function isEntrypoint() {
  if (!process.argv[1]) return false;
  let self;
  try {
    self = fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    // O próprio arquivo ilegível: roda, porque não rodar é o lado que deixa um portão verde ou um hook aberto.
    return true;
  }
  try {
    return fs.realpathSync(process.argv[1]) === self;
  } catch {
    // A linha de comando não aponta para um arquivo (`node -e`, `node -`, um glob no `--test`): quem rodou como
    // programa foi outro, e este módulo só foi importado.
    return false;
  }
}

if (isEntrypoint()) {
  main();
}
