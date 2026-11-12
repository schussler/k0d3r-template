import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, extractCommand, stripQuoted } from './guard-shell.mjs';

test('does not treat quoted text (commit messages, echo) as a piped command', () => {
  assert.equal(evaluate('git commit -m "fix: npm test | tail hid the exit code"'), null);
  assert.equal(evaluate('echo "make typecheck | head -3"'), null);
});

test('still blocks a piped gate when quotes appear elsewhere in the command', () => {
  assert.equal(evaluate('npm test "$TMPDIR/x" | tail -5')?.id, 'verification-pipe');
});

test('still blocks destructive commands even when wrapped in quotes', () => {
  assert.equal(evaluate('sh -c "rm -rf dist"')?.id, 'destructive');
});

test('stripQuoted removes double and single quoted spans', () => {
  assert.equal(stripQuoted('a "b c" d \'e f\' g'), 'a "" d "" g');
});

test('blocks a verification gate of any runner piped into tail, head or grep', () => {
  assert.equal(evaluate('npm run typecheck | tail -3')?.id, 'verification-pipe');
  assert.equal(evaluate('make test 2>&1 | grep FAIL')?.id, 'verification-pipe');
  assert.equal(evaluate('npm run test:unit | head -30')?.id, 'verification-pipe');
  assert.equal(evaluate('go test ./... | tail')?.id, 'verification-pipe');
  assert.equal(evaluate('cargo check | tail')?.id, 'verification-pipe');
  assert.equal(evaluate('CI=1 ./gradlew build | tail -20')?.id, 'verification-pipe');
});

test('a search for a gate word is not a gate: grep, rg and git pass', () => {
  assert.equal(evaluate('grep test x | head'), null);
  assert.equal(evaluate('rg -n "lint" src | head -5'), null);
  assert.equal(evaluate('git log --oneline --grep build | head -5'), null);
});

test('checkout is not check: the gate must be a whole token', () => {
  assert.equal(evaluate('git checkout main | tail'), null);
  assert.equal(evaluate('make checkout-deps | tail'), null);
  assert.equal(evaluate('npm run checks | tail'), null);
});

test('allows a verification gate redirected to a file with explicit EXIT', () => {
  const cmd = 'go test ./... > "$TMPDIR/t.log" 2>&1; echo "EXIT: $?"; tail -20 "$TMPDIR/t.log"';
  assert.equal(evaluate(cmd), null);
});

test('a gate before a separator does not taint a later, unrelated pipe', () => {
  assert.equal(evaluate('cargo test > /tmp/x.log 2>&1; ls -la | grep log'), null);
  assert.equal(evaluate('make build && git log --oneline | head -5'), null);
});

test('allows pipes on commands that are not verification gates', () => {
  assert.equal(evaluate('git log --oneline | head -5'), null);
  assert.equal(evaluate('ls -la | grep ts'), null);
  assert.equal(evaluate('node scripts/report.mjs | head'), null);
});

test('blocks destructive operations', () => {
  assert.equal(evaluate('rm -rf dist')?.id, 'destructive');
  assert.equal(evaluate('rm -fr node_modules')?.id, 'destructive');
  assert.equal(evaluate('git push origin feature --force')?.id, 'destructive');
  assert.equal(evaluate('git reset --hard HEAD~1')?.id, 'destructive');
  assert.equal(evaluate('psql -c "DROP TABLE users"')?.id, 'destructive');
});

test('allows force-with-lease and a plain rm of a single file', () => {
  assert.equal(evaluate('git push --force-with-lease origin feat'), null);
  assert.equal(evaluate('rm scratch.txt'), null);
});

test('extracts the command from either tool_input.command or a command array', () => {
  assert.equal(extractCommand({ tool_input: { command: 'ls' } }), 'ls');
  assert.equal(extractCommand({ input: { cmd: 'ls' } }), 'ls');
  assert.equal(extractCommand({ tool_input: { command: ['git', 'status'] } }), 'git status');
});

test('non-shell tools carry no command and pass through', () => {
  assert.equal(extractCommand({ tool_name: 'Edit', tool_input: { file_path: 'x' } }), null);
  assert.equal(evaluate(null), null);
});

test('blocks push or delete targeting main, in every refspec form', () => {
  const bloqueados = [
    'git push origin main',
    'git push origin HEAD:main',
    'git push origin HEAD:refs/heads/main',
    'git push origin +HEAD:main',
    'git push origin :main',
    'git push origin main:main',
    'git push origin "HEAD:main"',
    'git push --force-with-lease origin main',
    'git push origin --delete main',
    'git push --all origin',
    'git push --mirror origin',
    'git branch -D main',
    'git branch --delete main',
    'git fetch -q origin && git push origin HEAD:main',
  ];
  for (const cmd of bloqueados) {
    assert.equal(evaluate(cmd)?.id, 'protected-branch', cmd);
  }
});

test('allows push to feature branches and read-only uses of main', () => {
  const permitidos = [
    'git push origin feature',
    'git push -u origin claude/session-branch',
    'git push origin feature:main-hotfix',
    'git push origin feature && git log main',
    'git log main',
    'git branch -D feature-x',
    'git commit -m "git push origin main"',
  ];
  for (const cmd of permitidos) {
    assert.equal(evaluate(cmd), null, cmd);
  }
});

test('blocks protected targets behind git global options and combined delete flags', () => {
  assert.equal(evaluate('git -C . push origin main')?.id, 'protected-branch');
  assert.equal(evaluate('git --no-pager push origin main')?.id, 'protected-branch');
  assert.equal(evaluate('git push -d origin main')?.id, 'protected-branch');
  assert.equal(evaluate('git branch -df main')?.id, 'protected-branch');
});

test('does not split on separators inside quoted commit text, and allows similar branch names', () => {
  assert.equal(evaluate('git commit -m "fix; git push origin main"'), null);
  assert.equal(evaluate('echo "a && git push origin main"'), null);
  assert.equal(evaluate('git push origin refs/heads/main-old'), null);
});

test('blocks git push that skips the git hooks with --no-verify', () => {
  assert.equal(evaluate('git push --no-verify origin feature')?.id, 'no-verify');
  assert.equal(evaluate('git push origin feature --no-verify')?.id, 'no-verify');
  assert.equal(evaluate('git push origin feature'), null);
  assert.equal(evaluate('git commit --no-verify -m "wip"'), null);
});

test('blocks protected pushes hidden in subshells, globs, quote splits and option variants', () => {
  assert.equal(evaluate('(git push origin main)')?.id, 'protected-branch');
  assert.equal(evaluate('cd x && (git push origin main)')?.id, 'protected-branch');
  assert.equal(evaluate('echo $(git push origin main)')?.id, 'protected-branch');
  assert.equal(evaluate("git push origin 'refs/heads/*:refs/heads/*'")?.id, 'protected-branch');
  assert.equal(evaluate('git push origin ma"in"')?.id, 'protected-branch');
  assert.equal(evaluate('git --git-dir .git push origin main')?.id, 'protected-branch');
  assert.equal(evaluate('git push --no-verif origin feature')?.id, 'no-verify');
});

test('the docs-check gate is a gate: piped is blocked, a search for its name is not', () => {
  assert.equal(evaluate('node scripts/docs-check/docs-check.mjs diff | tail')?.id, 'verification-pipe');
  assert.equal(evaluate('node scripts/docs-check/docs-check.mjs links 2>&1 | head -5')?.id, 'verification-pipe');
  assert.equal(evaluate('grep docs-check README.md | head'), null, 'read-only exception');
  const safe = 'node scripts/docs-check/docs-check.mjs diff > "$TMPDIR/d.log" 2>&1; echo "EXIT: $?"; tail -20 "$TMPDIR/d.log"';
  assert.equal(evaluate(safe), null);
});

test('the model-routing script is a gate in both subcommands: piped is blocked, a search for its name is not', () => {
  assert.equal(evaluate('node scripts/model-routing/model-routing.mjs check | tail')?.id, 'verification-pipe');
  // `apply` carries no gate word of its own: only the script name makes it a gate. A masked exit 1 here
  // reads as "applied" when nothing was written.
  assert.equal(evaluate('node scripts/model-routing/model-routing.mjs apply 2>&1 | tail -5')?.id, 'verification-pipe');
  assert.equal(evaluate('grep model-routing CLAUDE.md | head'), null, 'read-only exception');
  const safe = 'node scripts/model-routing/model-routing.mjs check > "$TMPDIR/m.log" 2>&1; echo "EXIT: $?"; tail -20 "$TMPDIR/m.log"';
  assert.equal(evaluate(safe), null);
});

// --- Guarda de entrada: chamado por um caminho com link simbólico (spec guarda-de-entrada-dos-scripts.md) ---
import { spawnSync as linkSpawn } from 'node:child_process';
import { mkdtempSync as linkMkdtemp, mkdirSync as linkMkdir, writeFileSync as linkWrite, symlinkSync as linkSymlink, rmSync as linkRm } from 'node:fs';
import { tmpdir as linkTmpdir } from 'node:os';
import linkPath from 'node:path';
import { fileURLToPath as linkFileURLToPath } from 'node:url';

const LINK_SCRIPTS_DIR = linkPath.resolve(linkPath.dirname(linkFileURLToPath(import.meta.url)), '..');

/** Chama o script pelo caminho real e por um link para scripts/, com os mesmos argumentos. */
function linkBoth(args, { input, env } = {}) {
  const tmp = linkMkdtemp(linkPath.join(linkTmpdir(), 'guarda-link-'));
  const link = linkPath.join(tmp, 'scripts-link');
  linkSymlink(LINK_SCRIPTS_DIR, link, 'dir');
  const call = (base) =>
    linkSpawn(process.execPath, [linkPath.join(base, 'hooks/guard-shell.mjs'), ...args], {
      encoding: 'utf8', input, timeout: 20000, env: { ...process.env, ...env },
    });
  const result = { real: call(LINK_SCRIPTS_DIR), linked: call(link), tmp };
  return result;
}

test('guard-shell chamado por link simbólico bloqueia um comando destrutivo (código 2, [guard-shell:destructive])', () => {
  // O payload vai por stdin: o guard-shell da sessão bloquearia um comando cujo texto tivesse o padrão.
  const payload = JSON.stringify({ tool_name: 'Bash', tool_input: { command: ['rm', '-rf', '/tmp/x'].join(' ') } });
  const { real, linked, tmp } = linkBoth([], { input: payload });
  linkRm(tmp, { recursive: true, force: true });
  assert.equal(real.status, 2, 'controle (caminho real) tem de dar 2');
  assert.match(real.stderr, /\[guard-shell:destructive\]/);
  assert.equal(linked.status, 2, `pelo link: stdout=${linked.stdout} stderr=${linked.stderr}`);
  assert.match(linked.stderr, /\[guard-shell:destructive\]/);
  assert.equal(linked.stderr, real.stderr);
});

