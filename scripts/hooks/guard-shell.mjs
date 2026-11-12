#!/usr/bin/env node
// PreToolUse guard do Claude Code para o shell.
//
// Lê o payload do hook em stdin e bloqueia (exit 2) os casos que causam dano ou falso verde:
//   1. portão de verificação com pipe (`<runner> test | tail`): o exit code vira o do pipe.
//   2. operação destrutiva sem confirmação (`rm -rf`, `git push --force`, `git reset --hard`...).
//   3. `git push --no-verify`, que pula os hooks do git.
//   4. push ou delete de branch protegida (`main`).
//
// Sem Node no PATH, o comando registrado em `.claude/settings.json` sai com 2 e uma mensagem: o hook
// nunca libera em silêncio.

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Palavras que identificam um portão de verificação no comando antes do pipe, como token inteiro
// (`test`, `test:unit`, `check`, `lint:fix`...) ou como nome de script sem a extensão
// (`scripts/docs-check/docs-check.mjs` → `docs-check`). AJUSTE ao preencher a tabela "Portões de
// verificação" do CLAUDE.md: acrescente os nomes dos seus portões (ex.: `pytest`, `clippy`, `vet`).
const VERIFY_GATES = ['test', 'lint', 'typecheck', 'build', 'check', 'docs-check', 'e2e', 'audit'];

// Comandos de leitura/busca: um `grep test x | head` procura o texto "test", não roda portão.
const READ_ONLY_COMMANDS = new Set([
  'grep', 'egrep', 'fgrep', 'rg', 'ag', 'ack', 'find', 'ls', 'cat', 'git', 'echo', 'printf',
  'sed', 'awk', 'head', 'tail', 'less', 'more', 'wc', 'sort', 'uniq', 'diff', 'which', 'type', 'jq',
]);

// Branches que só recebem código por PR. AJUSTE se o projeto tiver outras (ex.: `master`, `release`).
const PROTECTED_BRANCHES = ['main'];

const COMMAND_SEPARATORS = /&&|\|\||;|\||\n/;
const QUOTED_SPAN = /"(?:[^"\\]|\\.)*"|'[^']*'/g;
// Opções globais do git entre `git` e o subcomando: `-C <dir>`, `-c k=v`, `--no-pager`, `-p`.
const GIT_GLOBAL_OPTIONS = '(?:\\s+(?:-[Cc]\\s+\\S+|--(?:git-dir|work-tree|namespace)\\s+\\S+|--\\S+|-\\S+))*';
// Delete de branch ou de ref, inclusive flag curta combinada: `-d`, `-D`, `-df`, `-vd`, `--delete`.
const DELETE_FLAG = /^(--delete|-[a-zA-Z]*[dD][a-zA-Z]*)$/;
const GATE_TOKEN = new RegExp(`^(?:${VERIFY_GATES.join('|')})(?::\\S*)?$`);

/** Remove o conteúdo entre aspas: texto de mensagem de commit ou de echo não é comando a executar. */
export function stripQuoted(cmd) {
  return cmd.replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, '""');
}

/**
 * Quebra o comando nos separadores que estão FORA de aspas. Um `;` dentro de `-m "x; git push origin main"`
 * é texto de commit, não separador: a máscara troca cada span citado por espaços, de mesmo tamanho, e só
 * então os cortes são feitos no texto original.
 */
function segmentos(cmd) {
  const mascarado = cmd.replace(QUOTED_SPAN, (span) => ' '.repeat(span.length));
  const partes = [];
  let inicio = 0;
  for (const corte of mascarado.matchAll(new RegExp(COMMAND_SEPARATORS.source, 'g'))) {
    partes.push(cmd.slice(inicio, corte.index));
    inicio = corte.index + corte[0].length;
  }
  partes.push(cmd.slice(inicio));
  return partes;
}

/**
 * Verdadeiro quando algum comando simples (separado por `;`, `&&`, `||` ou quebra de linha) roda um portão
 * e manda a saída para um pipe. Olha só o texto fora de aspas, e só o trecho antes do primeiro `|`.
 */
function portaoComPipe(cmd) {
  const semAspas = stripQuoted(cmd);
  return semAspas.split(/&&|\|\||;|\n/).some((comando) => {
    const pipe = comando.indexOf('|');
    if (pipe === -1) return false;
    const tokens = comando
      .slice(0, pipe)
      .replace(/[(){}`]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .filter((token) => !/^\w+=/.test(token)); // `FOO=1 make test`: a atribuição não é o comando
    if (tokens.length === 0) return false;
    const programa = tokens[0].split('/').pop();
    if (READ_ONLY_COMMANDS.has(programa)) return false;
    return tokens.some((token) => {
      const nome = token.split('/').pop();
      return GATE_TOKEN.test(nome) || GATE_TOKEN.test(nome.replace(/\.[A-Za-z0-9]+$/, ''));
    });
  });
}

/**
 * Tokens depois de `git <sub>` no segmento, ou null se o segmento não tem esse subcomando fora de aspas.
 * A detecção olha o texto sem aspas (mensagem de commit não conta), mas os tokens saem com as aspas
 * removidas, para que `"HEAD:main"` ainda revele o destino.
 */
function gitArgs(segmento, sub) {
  if (!new RegExp(`\\bgit${GIT_GLOBAL_OPTIONS}\\s+${sub}\\b`).test(stripQuoted(segmento))) return null;
  // Aspas saem sem espaço (`ma"in"` é `main`); parênteses, chaves e crase separam (`(git push origin main)`).
  const tokens = segmento.replace(/["']/g, '').replace(/[(){}`]/g, ' ').split(/\s+/).filter(Boolean);
  const indice = tokens.indexOf(sub);
  return indice === -1 ? null : tokens.slice(indice + 1);
}

/**
 * Destino de um refspec: `HEAD:main`, `+HEAD:refs/heads/main`, `:main` (delete) e `main` caem em `main`.
 * Glob no destino (`refs/heads/*`) pode casar com main, então conta como protegido.
 */
function refspecProtegido(refspec) {
  const destino = refspec.replace(/^\+/, '').split(':').at(-1).replace(/^refs\/heads\//, '');
  return PROTECTED_BRANCHES.includes(destino) || destino.includes('*');
}

// Git aceita prefixo único de opção longa: `--no-v` e `--no-verif` são `--no-verify`.
const isNoVerifyFlag = (token) => token.length >= 6 && '--no-verify'.startsWith(token);

function pushViolaBranchProtegida(cmd) {
  return segmentos(cmd).some((segmento) => {
    const args = gitArgs(segmento, 'push');
    if (!args) return false;
    if (args.includes('--all') || args.includes('--mirror')) return true;

    const posicionais = args.filter((token) => !token.startsWith('-'));
    const apaga = args.some((token) => DELETE_FLAG.test(token));
    // O primeiro posicional é o remote; com --delete, o remote não vem e todos são refs.
    const refs = apaga ? posicionais : posicionais.slice(1);
    return refs.some(refspecProtegido);
  });
}

function deleteViolaBranchProtegida(cmd) {
  return segmentos(cmd).some((segmento) => {
    const args = gitArgs(segmento, 'branch');
    if (!args) return false;
    const apaga = args.some((token) => DELETE_FLAG.test(token));
    return apaga && args.some((token) => PROTECTED_BRANCHES.includes(token));
  });
}

const RULES = [
  {
    id: 'verification-pipe',
    test: portaoComPipe,
    message:
      'Portão de verificação com pipe mascara o exit code (o $? vira o do pipe). Use: ' +
      'comando > "$TMPDIR/x.log" 2>&1; echo "EXIT: $?"; tail -20 "$TMPDIR/x.log"',
  },
  {
    id: 'destructive',
    test: (cmd) =>
      /\brm\s+-[a-zA-Z]*r[a-zA-Z]*f|\brm\s+-[a-zA-Z]*f[a-zA-Z]*r/.test(cmd) ||
      /\bgit\s+push\b[^\n]*--force(?!-with-lease)\b/.test(cmd) ||
      /\bDROP\s+TABLE\b/i.test(cmd) ||
      /\bgit\s+reset\s+--hard\b/.test(cmd),
    message:
      'Operação destrutiva bloqueada pelo hook. Se for mesmo necessária, o usuário roda no terminal dele, ' +
      'com confirmação explícita.',
  },
  {
    // Só o push: o guard não trata commit.
    id: 'no-verify',
    test: (cmd) => segmentos(cmd).some((segmento) => gitArgs(segmento, 'push')?.some(isNoVerifyFlag)),
    message:
      'git push com --no-verify pula os hooks do git (pre-push etc.). Rode o push sem a flag; ' +
      'se um hook recusar, corrija a causa.',
  },
  {
    id: 'protected-branch',
    test: (cmd) => pushViolaBranchProtegida(cmd) || deleteViolaBranchProtegida(cmd),
    message:
      `Push ou delete em ${PROTECTED_BRANCHES.join('/')} bloqueado pelo hook: publicar nessas branches é ` +
      'decisão humana. Empurre a branch da sessão e, se a pessoa pedir, abra PR.',
  },
];

/** Extrai o comando de shell do payload do hook. */
export function extractCommand(payload) {
  const input = payload?.tool_input ?? payload?.input ?? payload?.arguments ?? {};
  const raw = input.command ?? input.cmd ?? null;
  if (Array.isArray(raw)) return raw.join(' ');
  return typeof raw === 'string' ? raw : null;
}

/** Retorna a regra violada, ou null. */
export function evaluate(command) {
  if (!command) return null;
  return RULES.find((rule) => rule.test(command)) ?? null;
}

function main() {
  let payload;
  try {
    payload = JSON.parse(readFileSync(0, 'utf8') || '{}');
  } catch {
    // Payload ilegível não deve derrubar a sessão: passa, mas deixa o motivo no stderr.
    process.stderr.write('[guard-shell] payload ilegível; comando não verificado\n');
    process.exit(0);
  }
  const violation = evaluate(extractCommand(payload));
  if (!violation) process.exit(0);
  process.stderr.write(`[guard-shell:${violation.id}] ${violation.message}\n`);
  process.exit(2);
}

const isEntrypoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntrypoint) main();
