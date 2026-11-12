#!/usr/bin/env node
// Docs check: keeps the docs tied to the code they describe and points at the ones left behind.
// Read-only: it never writes a file.
//
// Usage (from the repository root):
//   node scripts/docs-check/docs-check.mjs links
//   node scripts/docs-check/docs-check.mjs diff  [--base <ref>]
//   node scripts/docs-check/docs-check.mjs stale [--area <area>] [--limit N] [--json]
//
// A doc is tied to code by its frontmatter `codigo:` list and by the repository paths it cites in the
// text (with or without a `#symbol`, inside or outside backticks). Only paths that `git ls-files` knows
// count, compared whole (never by basename). Files under docs/ are never code. `conferido-em:` means only
// "the cited code has not changed since this date" — not "the doc is right"
// (docs/implemented/processo/verificacao-de-docs.md). A doc whose frontmatter has `docs-check: ignore` (a
// template) is left out of `diff` and `stale`; folder README.md indexes are always left out.
//
// Exit codes: links and diff exit 1 when they find a problem; stale is a report and exits 0.
// Any usage or git error exits 2.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DOC_STATES_FOR_DIFF = ['docs/implemented/', 'docs/in-progress/'];
const STALE_ROOT = 'docs/implemented/';
// Folder indexes describe the tree, not code; they are never audited.
const INDEX_FILE = 'README.md';
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------

/**
 * The fields this check reads from a doc's YAML frontmatter (`codigo:`, `conferido-em:` and
 * `docs-check: ignore`), and the body after it. Tolerant: a doc without frontmatter, or without a field,
 * parses to empty values.
 */
export function parseDocFrontmatter(text) {
  const src = String(text ?? '').replace(/\r\n/g, '\n');
  const empty = { codigo: [], conferidoEm: null, ignore: false, body: src, bodyOffset: 0 };
  if (!src.startsWith('---\n')) return empty;
  const end = src.indexOf('\n---', 4);
  if (end === -1) return empty;
  const lines = src.slice(4, end).split('\n');
  const codigo = [];
  let conferidoEm = null;
  let ignore = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^docs-check:\s*['"]?ignore['"]?\s*(?:#.*)?$/.test(lines[i])) ignore = true;
    const conf = lines[i].match(/^conferido-em:\s*['"]?([^'"\s#]*)['"]?\s*(?:#.*)?$/);
    if (conf) conferidoEm = conf[1] || null;
    if (/^codigo:\s*$/.test(lines[i])) {
      while (i + 1 < lines.length && /^\s+-\s+/.test(lines[i + 1])) {
        codigo.push(lines[++i].replace(/^\s+-\s+/, '').replace(/^['"]|['"]$/g, '').trim());
      }
    }
  }
  const afterClose = src.indexOf('\n', end + 1);
  const bodyStart = afterClose === -1 ? src.length : afterClose + 1;
  return { codigo, conferidoEm, ignore, body: src.slice(bodyStart), bodyOffset: bodyStart };
}

/**
 * Path-looking tokens of a text, each with an optional `#symbol`. Over-collects on purpose: the caller
 * keeps only the tokens that are real repository paths.
 */
export function extractPathTokens(text) {
  const out = [];
  for (const m of String(text ?? '').matchAll(/[A-Za-z0-9_.\-/~]+(?:#[A-Za-z0-9_$.:\-]+)?/g)) {
    const raw = m[0].replace(/[.:,;]+$/, '');
    const hash = raw.indexOf('#');
    const p = (hash === -1 ? raw : raw.slice(0, hash)).replace(/[.:,;]+$/, '');
    const symbol = hash === -1 ? null : raw.slice(hash + 1).replace(/[.:,;]+$/, '') || null;
    if (p.includes('/') || /\.[A-Za-z0-9]+$/.test(p)) out.push({ path: p, symbol });
  }
  return out;
}

/** Normalize a repo-relative path (`./a/../b` → `b`), or null if it leaves the repository. */
function normRel(p) {
  const n = path.posix.normalize(p.replace(/^\.\//, ''));
  return n.startsWith('../') || n === '..' || path.posix.isAbsolute(n) ? null : n;
}

/** Whether a repository path is code (anything not under docs/). */
export function isCodePath(p) {
  return !p.startsWith('docs/');
}

/**
 * The code a doc is tied to: its `codigo:` list (kept even when missing, to report it) plus every cited
 * token that resolves, from the repo root or from the doc's folder, to a known code path.
 * @returns {{codigo:string[], mentions:{path:string, symbol:?string}[], linked:string[]}}
 */
export function linkedCode(docPath, text, knownPaths) {
  const fm = parseDocFrontmatter(text);
  const dir = path.posix.dirname(docPath);
  const mentions = [];
  const seen = new Set();
  for (const t of extractPathTokens(fm.body)) {
    const candidates = [normRel(t.path), normRel(path.posix.join(dir, t.path))].filter(Boolean);
    const hit = candidates.find((c) => knownPaths.has(c) && isCodePath(c));
    if (!hit) continue;
    const key = `${hit}#${t.symbol ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    mentions.push({ path: hit, symbol: t.symbol });
  }
  const codigo = fm.codigo.map((c) => normRel(c) ?? c);
  const linked = [...new Set([...codigo.filter((c) => knownPaths.has(c) && isCodePath(c)), ...mentions.map((m) => m.path)])].sort();
  return { codigo, mentions, linked };
}

/**
 * The text of a code file with comment lines removed, for the textual symbol check. Strips block
 * comments (`/* … *\/`) and lines whose first non-blank characters are `//`, `#`, `--` or `*`.
 * Limitation: this is a text search, so a symbol left only inside a string still passes.
 */
export function stripCommentLines(code) {
  return String(code ?? '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|#|--|\*)/.test(line))
    .join('\n');
}

/** Whether `symbol` appears as a whole word in the non-comment text of a code file. */
export function symbolInCode(code, symbol) {
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z0-9_$])${escaped}($|[^A-Za-z0-9_$])`).test(stripCommentLines(code));
}

/** GitHub-style heading slug, plus explicit `{#id}` anchors. */
export function markdownAnchors(text) {
  const anchors = new Set();
  const src = String(text ?? '').replace(/```[\s\S]*?```/g, '');
  for (const m of src.matchAll(/^#{1,6}\s+(.+)$/gm)) {
    const explicit = m[1].match(/\{#([^}]+)\}/);
    if (explicit) anchors.add(explicit[1]);
    anchors.add(
      m[1].replace(/\{#[^}]+\}/, '').trim().toLowerCase().replace(/[`*_]/g, '')
        .replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s/g, '-'),
    );
  }
  return anchors;
}

/** Relative markdown link targets of a text, outside code fences and inline code. */
export function markdownLinks(text) {
  const src = String(text ?? '').replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  const out = [];
  for (const m of src.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    if (/^(https?:|mailto:|#$)/.test(m[1])) continue;
    out.push(m[1]);
  }
  return out;
}

/** Today as `YYYY-MM-DD` in local time: the date a person writes in `conferido-em`. */
export function localToday(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Whether a doc tied to the changed code is resolved: its `conferido-em:` is today (in the diff or not), or it
 * changed in the diff AND its `conferido-em:` differs from the base version (or the doc is new and has one).
 * The "is today" case exists because a doc already conferred today cannot move its date again; its cost (code
 * changed on the day of a conference goes undetected) is written in verificacao-de-docs.md.
 */
export function isResolved(changedSet, docPath, baseText, currentText, today = localToday()) {
  const now = parseDocFrontmatter(currentText).conferidoEm;
  if (!now) return false;
  if (now === today) return true;
  if (!changedSet.has(docPath)) return false;
  if (baseText == null) return true;
  return parseDocFrontmatter(baseText).conferidoEm !== now;
}

/**
 * Classify one doc for `stale`. `lastDates` maps a path to its commit dates (YYYY-MM-DD, committer
 * date), newest first.
 */
export function classifyStale({ doc, conferidoEm, linked, missing, lines }, lastDates) {
  const files = linked.map((p) => ({ path: p, last: (lastDates.get(p) || [])[0] || null }));
  if (!conferidoEm || !DATE.test(conferidoEm)) {
    return { doc, status: 'never', conferidoEm: conferidoEm || null, files, missing, lines, commitsSince: null };
  }
  const changed = files.filter((f) => f.last && f.last > conferidoEm);
  const commitsSince = linked.reduce((n, p) => n + (lastDates.get(p) || []).filter((d) => d > conferidoEm).length, 0);
  return {
    doc,
    status: changed.length ? 'stale' : 'current',
    conferidoEm,
    files,
    changed: changed.map((f) => f.path),
    missing,
    lines,
    commitsSince,
  };
}

/** Order: stale docs from the oldest conferido-em to the newest, then the never-conferred ones. */
export function orderStale(results) {
  const stale = results.filter((r) => r.status === 'stale').sort((a, b) => a.conferidoEm.localeCompare(b.conferidoEm) || a.doc.localeCompare(b.doc));
  const never = results.filter((r) => r.status === 'never').sort((a, b) => a.doc.localeCompare(b.doc));
  return [...stale, ...never];
}

/** Map path -> commit dates, newest first, from `git log --format=%x00%cs --name-only` output. */
export function parseNameOnlyLog(out) {
  const dates = new Map();
  let current = null;
  for (const line of String(out ?? '').split('\n')) {
    if (line.startsWith('\0')) { current = line.slice(1).trim(); continue; }
    const p = line.trim();
    if (!p || !current) continue;
    if (!dates.has(p)) dates.set(p, []);
    dates.get(p).push(current);
  }
  return dates;
}

// ---------------------------------------------------------------------------
// git and filesystem (impure)
// ---------------------------------------------------------------------------

function git(root, args, timeoutMs) {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...(timeoutMs ? { timeout: timeoutMs } : {}),
  });
}

function gitOrNull(root, args, timeoutMs) {
  try {
    return git(root, args, timeoutMs);
  } catch {
    return null;
  }
}

/** Tracked files plus untracked, not-ignored ones: what the repository knows right now. */
function knownFiles(root, timeoutMs) {
  const out = git(root, ['ls-files', '--cached', '--others', '--exclude-standard'], timeoutMs);
  return new Set(out.split('\n').map((s) => s.trim()).filter(Boolean).filter((p) => fs.existsSync(path.join(root, p))));
}

function readText(root, rel) {
  try {
    return fs.readFileSync(path.join(root, rel), 'utf8');
  } catch {
    return null;
  }
}

function docsUnder(known, prefix) {
  return [...known].filter((p) => p.startsWith(prefix) && p.endsWith('.md') && path.posix.basename(p) !== INDEX_FILE).sort();
}

// ---------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------

/** links: relative links resolve, `codigo:` paths exist, and every `path#symbol` symbol is in the file. */
export function runLinks(root) {
  const known = knownFiles(root);
  const problems = [];
  for (const md of [...known].filter((p) => p.endsWith('.md')).sort()) {
    const text = readText(root, md) ?? '';
    const dir = path.posix.dirname(md);
    for (const target of markdownLinks(text)) {
      const [rawPath, anchor] = target.split('#');
      const rel = rawPath ? normRel(path.posix.join(dir, decodeURI(rawPath))) : md;
      if (!rel || !fs.existsSync(path.join(root, rel))) {
        problems.push(`${md}: link to ${target} (file not found)`);
        continue;
      }
      if (anchor && rel.endsWith('.md') && !markdownAnchors(readText(root, rel)).has(anchor)) {
        problems.push(`${md}: link to ${target} (anchor not found)`);
      }
    }
    if (!md.startsWith('docs/')) continue;
    const { codigo, mentions } = linkedCode(md, text, known);
    for (const c of codigo) if (!known.has(c)) problems.push(`${md}: codigo: ${c} does not exist`);
    for (const m of mentions) {
      if (!m.symbol) continue;
      const code = readText(root, m.path) ?? '';
      const ok = m.path.endsWith('.md') ? markdownAnchors(code).has(m.symbol) : symbolInCode(code, m.symbol);
      if (!ok) problems.push(`${md}: ${m.path}#${m.symbol} (symbol not found outside comments)`);
    }
  }
  return problems;
}

/** The base for `diff`: --base, else origin/main if it exists, else main. */
function resolveBase(root, base) {
  if (base) return base;
  return gitOrNull(root, ['rev-parse', '--verify', '--quiet', 'origin/main']) ? 'origin/main' : 'main';
}

/** diff: docs tied to the code changed on this branch (and in the working tree), resolved or not. */
export function runDiff(root, baseArg) {
  const base = resolveBase(root, baseArg);
  const branch = (gitOrNull(root, ['rev-parse', '--abbrev-ref', 'HEAD']) || '').trim();
  const onBase = branch === base || `origin/${branch}` === base;
  const ref = onBase ? 'HEAD' : git(root, ['merge-base', base, 'HEAD']).trim();
  const tracked = git(root, ['diff', '--name-only', ref]).split('\n').map((s) => s.trim()).filter(Boolean);
  const untracked = git(root, ['ls-files', '--others', '--exclude-standard']).split('\n').map((s) => s.trim()).filter(Boolean);
  const changed = new Set([...tracked, ...untracked]);
  const changedCode = [...changed].filter(isCodePath);
  // Deleted code still ties: a doc citing a removed file must be looked at.
  const known = new Set([...knownFiles(root), ...changedCode]);
  const rows = [];
  for (const doc of [...known].filter((p) => DOC_STATES_FOR_DIFF.some((s) => p.startsWith(s)) && p.endsWith('.md') && path.posix.basename(p) !== INDEX_FILE).sort()) {
    const text = readText(root, doc);
    if (text == null || parseDocFrontmatter(text).ignore) continue;
    const { linked } = linkedCode(doc, text, known);
    const by = linked.filter((p) => changed.has(p));
    if (!by.length) continue;
    const baseText = gitOrNull(root, ['show', `${ref}:${doc}`]);
    rows.push({ doc, by, resolved: isResolved(changed, doc, baseText, text) });
  }
  return { base, ref, onBase, changedCode, rows };
}

/** stale: per doc of docs/implemented, whether its tied code changed after `conferido-em`. */
export function runStale(root, { area, timeoutMs } = {}) {
  const known = knownFiles(root, timeoutMs);
  const prefix = area ? `${STALE_ROOT}${area.replace(/\/+$/, '')}/` : STALE_ROOT;
  const docs = docsUnder(known, prefix).filter((doc) => !parseDocFrontmatter(readText(root, doc) ?? '').ignore);
  // One pass over history for every path, instead of one git log per doc.
  const log = git(root, ['log', '--format=%x00%cs', '--name-only'], timeoutMs);
  const lastDates = parseNameOnlyLog(log);
  const results = docs.map((doc) => {
    const text = readText(root, doc) ?? '';
    const { conferidoEm } = parseDocFrontmatter(text);
    const { codigo, linked } = linkedCode(doc, text, known);
    return classifyStale({ doc, conferidoEm, linked, missing: codigo.filter((c) => !known.has(c)), lines: text.split('\n').length }, lastDates);
  });
  return { results, ordered: orderStale(results) };
}

/** The counts the SessionStart hook prints: stale and never-conferred docs. */
export function staleCounts(root, { timeoutMs } = {}) {
  const { results } = runStale(root, { timeoutMs });
  return {
    stale: results.filter((r) => r.status === 'stale').length,
    never: results.filter((r) => r.status === 'never').length,
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') opts.json = true;
    else if (a.startsWith('--')) opts[a.slice(2)] = argv[++i];
    else opts._.push(a);
  }
  return opts;
}

function renderStale(ordered, results) {
  const lines = [];
  const L = (s) => lines.push(s);
  const stale = ordered.filter((r) => r.status === 'stale');
  const never = ordered.filter((r) => r.status === 'never');
  const current = results.filter((r) => r.status === 'current');
  L(`docs-check stale: ${stale.length} desatualizado(s), ${never.length} nunca conferido(s), ${current.length} em dia`);
  for (const r of stale) {
    L(`- [desatualizado] ${r.doc} (conferido-em ${r.conferidoEm}; código alterado em ${r.commitsSince} commit(s) desde então: ${r.changed.join(', ')}; ${r.lines} linhas)`);
  }
  for (const r of never) {
    L(`- [nunca conferido] ${r.doc} (${r.files.length} arquivo(s) de código ligado(s); ${r.lines} linhas)`);
  }
  for (const r of current) L(`- [em dia] ${r.doc} (conferido-em ${r.conferidoEm})`);
  for (const r of results) for (const m of r.missing) L(`- [codigo: inexistente] ${r.doc}: ${m}`);
  return `${lines.join('\n')}\n`;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const root = (gitOrNull(process.cwd(), ['rev-parse', '--show-toplevel']) || '').trim();
  if (!root) {
    process.stderr.write('docs-check: not inside a git repository\n');
    process.exit(2);
  }
  const mode = opts._[0];
  if (mode === 'links') {
    const problems = runLinks(root);
    if (problems.length === 0) process.stdout.write('docs-check links: ok\n');
    else process.stdout.write(`docs-check links: ${problems.length} problema(s)\n${problems.map((p) => `- ${p}`).join('\n')}\n`);
    process.exit(problems.length ? 1 : 0);
  }
  if (mode === 'diff') {
    const r = runDiff(root, opts.base);
    const open = r.rows.filter((x) => !x.resolved);
    process.stdout.write(`docs-check diff (base ${r.base}${r.onBase ? ', só o working tree' : ''}): ${r.changedCode.length} arquivo(s) de código alterado(s), ${r.rows.length} doc(s) ligado(s), ${open.length} sem resolver\n`);
    for (const x of r.rows) process.stdout.write(`- [${x.resolved ? 'resolvido' : 'SEM RESOLVER'}] ${x.doc} ← ${x.by.join(', ')}\n`);
    if (open.length) process.stdout.write('Resolva cada doc: atualize-o ou confira-o e mude o `conferido-em` (.claude/rules/common/docs-writing.md).\n');
    process.exit(open.length ? 1 : 0);
  }
  if (mode === 'stale') {
    const { results, ordered } = runStale(root, { area: opts.area });
    const limit = opts.limit ? Number.parseInt(opts.limit, 10) : null;
    const shown = limit && limit > 0 ? ordered.slice(0, limit) : ordered;
    if (opts.json) process.stdout.write(`${JSON.stringify({ ordered: shown, results }, null, 2)}\n`);
    else process.stdout.write(renderStale(shown, results));
    process.exit(0);
  }
  process.stderr.write('Usage: docs-check.mjs <links|diff [--base <ref>]|stale [--area <area>] [--limit N] [--json]>\n');
  process.exit(2);
}

// Os dois lados passam pelo caminho real: chamado por um caminho com link simbólico (um worktree, `/tmp` no
// macOS), `import.meta.url` já vem resolvido e `process.argv[1]` não, e a comparação crua saía com 0 sem rodar.
// Se o caminho real não puder ser lido, roda: não rodar é o lado que deixa um portão verde ou um hook aberto.
function isEntrypoint() {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return true;
  }
}

if (isEntrypoint()) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`docs-check: ${err.message}\n`);
    process.exit(2);
  }
}
