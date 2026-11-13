#!/usr/bin/env node
// Roteamento de modelo e esforço dos agents.
//
// A fonte única é `.claude/model-routing.json`. Este script deriva dela as linhas `model:` e `effort:` do
// frontmatter de cada agent e a chave `advisorModel` do `.claude/settings.json`:
//   check  confere, não escreve nada; é portão (sai com 1 e uma linha por problema no stderr).
//   apply  valida tudo e só então escreve; com qualquer problema de validação, não escreve arquivo nenhum.
//
// O portão só vale se falhar fechado: tudo o que o script não consegue ler ou entender vira problema, nunca
// um agent pulado em silêncio.
//
// Spec: docs/implemented/processo/roteamento-de-modelos.md.

import { accessSync, constants, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROUTING_FILE = '.claude/model-routing.json';
const AGENTS_DIR = '.claude/agents';
const SETTINGS_FILE = '.claude/settings.json';

const MODEL_ALIASES = ['fable', 'opus', 'sonnet', 'haiku'];
// O Claude Code só aceita estas famílias como conselheiro por alias (documentação do advisor).
const ADVISOR_ALIASES = ['fable', 'opus', 'sonnet'];
const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'];
const FULL_MODEL_ID = /^claude-\S+$/;
const INHERIT = 'inherit';
const ABSENT = 'ausente';
const DEFAULT_JSON_INDENT = '  ';
// Os campos do frontmatter que este script lê. `model` e `effort` são os que ele escreve.
const READ_KEYS = ['name', 'model', 'effort'];
const WRITTEN_KEYS = ['model', 'effort'];

const USAGE = 'uso: node scripts/model-routing/model-routing.mjs <check|apply> [--root <dir>]';

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
// `in` enxerga o protótipo: `'toString' in {}` é verdadeiro, e um nível chamado `toString` passaria por existente.
const has = (obj, key) => typeof key === 'string' && Object.hasOwn(obj, key);
const asObject = (v) => (isPlainObject(v) ? v : {});
const show = (v) => (typeof v === 'string' ? v : JSON.stringify(v));
const isValidModel = (m) => typeof m === 'string' && (MODEL_ALIASES.includes(m) || m === INHERIT || FULL_MODEL_ID.test(m));

// --- leitura ------------------------------------------------------------------------

function readJson(root, rel) {
  let text;
  try {
    text = readFileSync(path.join(root, rel), 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return { missing: true };
    return { problem: `${rel}: não foi possível ler (${err.code})` };
  }
  try {
    return { text, value: JSON.parse(text) };
  } catch (err) {
    return { text, problem: `${rel}: JSON inválido (${err.message})` };
  }
}

/**
 * Separa o frontmatter em linhas, sem normalizar nada. `rest` começa na linha `---` que fecha o frontmatter e
 * leva o corpo inteiro: é devolvido intocado, para que um `model:` ou um `---` no corpo nunca seja lido como
 * campo. Devolve null quando o arquivo não abre com `---`, quando o frontmatter nunca fecha, ou quando a linha
 * que o fecha tem espaço no fim: um parser tolerante fecharia ali, e este script leria o corpo como campo.
 */
export function splitFrontmatter(text) {
  const open = /^---(\r?\n)/.exec(text);
  if (!open) return null;
  const fields = [];
  let pos = open[0].length;
  while (pos < text.length) {
    const newline = text.indexOf('\n', pos);
    const end = newline === -1 ? text.length : newline + 1;
    const line = text.slice(pos, end);
    const content = line.replace(/\r?\n$/, '');
    if (content === '---') return { head: open[0], eol: open[1], fields, rest: text.slice(pos) };
    if (content.trimEnd() === '---') return null;
    fields.push(line);
    pos = end;
  }
  return null;
}

// Em YAML a chave pede espaço depois dos dois-pontos: `model:sonnet` é um texto, não um campo.
const fieldPattern = (key) => new RegExp(`^${key}:(?:[ \\t]+(.*?))?[ \\t]*(\\r?\\n)?$`);
const gluedPattern = (key) => new RegExp(`^${key}:\\S`);

export function fieldValue(fields, key) {
  for (const line of fields) {
    const match = fieldPattern(key).exec(line);
    if (match) return (match[1] ?? '').replace(/^(['"])(.*)\1$/, '$2');
  }
  return undefined;
}

/** Devolve uma lista nova: troca o campo no lugar, com o fim de linha que a linha já tinha, ou o acrescenta. */
export function withField(fields, key, value, eol) {
  const index = fields.findIndex((line) => fieldPattern(key).test(line));
  if (index === -1) return [...fields, `${key}: ${value}${eol}`];
  const lineEol = /\r?\n$/.exec(fields[index])?.[0] ?? eol;
  return fields.map((line, i) => (i === index ? `${key}: ${value}${lineEol}` : line));
}

/**
 * Lista os arquivos `.md` sob o diretório de agents, em subdiretórios e atrás de links simbólicos também:
 * um agent que o script não enxerga é um agent que roda fora do roteamento com o portão verde.
 */
function listAgentFiles(root) {
  const files = [];
  const problems = [];
  const visited = new Set();
  const walk = (dir, rel) => {
    let entries;
    try {
      const real = realpathSync(dir);
      if (visited.has(real)) return; // link simbólico em ciclo
      visited.add(real);
      // Ordenado: a ordem do readdir muda de um sistema de arquivos para outro, e a saída tem de ser a mesma.
      entries = readdirSync(dir).sort();
    } catch (err) {
      if (err.code !== 'ENOENT' || rel !== AGENTS_DIR) problems.push(`${rel}: não foi possível listar (${err.code})`);
      return;
    }
    for (const name of entries) {
      const childRel = `${rel}/${name}`;
      let stat;
      try {
        stat = statSync(path.join(dir, name));
      } catch (err) {
        problems.push(`${childRel}: não foi possível ler (${err.code})`);
        continue;
      }
      if (stat.isDirectory()) walk(path.join(dir, name), childRel);
      else if (name.toLowerCase().endsWith('.md')) files.push(childRel);
    }
  };
  walk(path.join(root, AGENTS_DIR), AGENTS_DIR);
  return { files, problems };
}

function readAgent(root, rel) {
  let text;
  try {
    // latin1 é ida e volta sem perda para qualquer byte: o corpo do agent volta ao disco byte a byte, mesmo
    // que não seja UTF-8 válido. As chaves e os valores que este script escreve são ASCII.
    text = readFileSync(path.join(root, rel), 'latin1');
  } catch (err) {
    return { rel, problem: `${rel}: não foi possível ler (${err.code})` };
  }
  const parsed = splitFrontmatter(text);
  const rawName = parsed ? fieldValue(parsed.fields, 'name') : undefined;
  // O nome é comparado com as chaves do JSON, que foi lido como UTF-8.
  const name = rawName ? Buffer.from(rawName, 'latin1').toString('utf8') : rawName;
  return { rel, text, parsed, name };
}

function loadState(root) {
  const listing = listAgentFiles(root);
  return {
    routing: readJson(root, ROUTING_FILE),
    settings: readJson(root, SETTINGS_FILE),
    agents: listing.files.map((rel) => readAgent(root, rel)),
    listingProblems: listing.problems,
  };
}

// --- validação ----------------------------------------------------------------------

function levelProblems(niveis) {
  if (!isPlainObject(niveis)) return [`${ROUTING_FILE}: \`niveis\` precisa ser um objeto nível → { model, effort }`];
  return Object.entries(niveis).flatMap(([level, def]) => {
    if (!isPlainObject(def)) return [`nível \`${level}\`: precisa ser um objeto { model, effort }`];
    const problems = [];
    if (!isValidModel(def.model)) {
      problems.push(`nível \`${level}\`: model \`${show(def.model)}\` não é aceito (${MODEL_ALIASES.join(', ')}, ${INHERIT} ou um ID claude-*)`);
    }
    if (!EFFORT_LEVELS.includes(def.effort)) {
      problems.push(`nível \`${level}\`: effort \`${show(def.effort)}\` não é aceito (${EFFORT_LEVELS.join(', ')})`);
    }
    return problems;
  });
}

function referenceProblems(routing) {
  const niveis = asObject(routing.niveis);
  const problems = [];
  for (const key of ['agents', 'nativos']) {
    if (!isPlainObject(routing[key])) problems.push(`${ROUTING_FILE}: \`${key}\` precisa ser um objeto nome → nível`);
  }
  for (const [agent, level] of Object.entries(asObject(routing.agents))) {
    if (!has(niveis, level)) problems.push(`agent \`${agent}\`: o nível \`${show(level)}\` não existe em niveis`);
  }
  for (const [native, level] of Object.entries(asObject(routing.nativos))) {
    if (!has(niveis, level)) {
      problems.push(`nativo \`${native}\`: o nível \`${show(level)}\` não existe em niveis`);
    } else if (isValidModel(niveis[level]?.model) && !MODEL_ALIASES.includes(niveis[level].model)) {
      // O parâmetro `model` da chamada de agent só aceita alias; ID completo e `inherit` não passam.
      problems.push(`nativo \`${native}\`: o nível \`${level}\` tem model \`${niveis[level].model}\`, que não é alias (${MODEL_ALIASES.join(', ')})`);
    }
  }
  if (!has(niveis, routing.orquestrador)) {
    problems.push(`${ROUTING_FILE}: orquestrador \`${show(routing.orquestrador)}\` não é um nível de niveis`);
  }
  if (routing.conselheiro !== null && !has(niveis, routing.conselheiro)) {
    problems.push(`${ROUTING_FILE}: conselheiro \`${show(routing.conselheiro)}\` não é um nível de niveis (ou null): ele aponta para um nível e usa o model dele`);
  } else if (routing.conselheiro !== null && !ADVISOR_ALIASES.includes(niveis[routing.conselheiro]?.model)) {
    problems.push(`${ROUTING_FILE}: conselheiro aponta para o nível \`${routing.conselheiro}\`, cujo model \`${show(niveis[routing.conselheiro]?.model)}\` não pode ser conselheiro (${ADVISOR_ALIASES.join(', ')})`);
  }
  return problems;
}

/** O que impede de ler o frontmatter de um jeito só: campo repetido e chave colada no valor. */
function frontmatterProblems(agent) {
  const problems = [];
  for (const key of READ_KEYS) {
    const count = agent.parsed.fields.filter((line) => fieldPattern(key).test(line)).length;
    if (count > 1) problems.push(`${agent.rel}: \`${key}:\` aparece ${count} vezes no frontmatter; o agent rodaria com a última`);
    for (const line of agent.parsed.fields.filter((l) => gluedPattern(key).test(l))) {
      problems.push(`${agent.rel}: linha \`${line.trim()}\` sem espaço depois dos dois-pontos; em YAML isso não é o campo \`${key}\``);
    }
  }
  return problems;
}

function agentProblems(routing, agents) {
  const levels = asObject(routing.agents);
  const problems = [];
  const filesByName = new Map();
  for (const agent of agents) {
    if (agent.problem) problems.push(agent.problem);
    else if (!agent.parsed) problems.push(`${agent.rel}: sem frontmatter válido (o arquivo abre com \`---\` e o fecha com \`---\`, sem espaço no fim)`);
    else {
      problems.push(...frontmatterProblems(agent));
      if (!agent.name) problems.push(`${agent.rel}: frontmatter sem \`name:\``);
      else {
        filesByName.set(agent.name, [...(filesByName.get(agent.name) ?? []), agent.rel]);
        if (!has(levels, agent.name)) problems.push(`agent \`${agent.name}\` (${agent.rel}): falta o nível em agents de ${ROUTING_FILE}`);
      }
    }
  }
  for (const [name, files] of filesByName) {
    if (files.length > 1) problems.push(`agent \`${name}\`: o mesmo name: está em ${files.join(' e ')}; um sombreia o outro`);
  }
  for (const name of Object.keys(levels)) {
    if (!filesByName.has(name)) problems.push(`agent \`${name}\`: tem nível em agents, mas não tem arquivo em ${AGENTS_DIR}/`);
  }
  return problems;
}

const currentAdvisor = (settings) => (settings.missing ? undefined : settings.value?.advisorModel);
// O conselheiro aponta para um nível e usa só o model dele: o Claude Code não tem esforço para o conselheiro.
const expectedAdvisor = (routing) =>
  has(asObject(routing.niveis), routing.conselheiro) ? routing.niveis[routing.conselheiro]?.model : undefined;

/** O texto do settings com outro conteúdo, no recuo, no fim de linha e na quebra final que o arquivo já tem. */
function renderLike(text, value) {
  const indent = /^\{\r?\n([ \t]+)"/.exec(text)?.[1] ?? DEFAULT_JSON_INDENT;
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const body = JSON.stringify(value, null, indent).replace(/\n/g, eol);
  return /\n$/.test(text) ? body + eol : body;
}

function settingsProblems(routing, settings) {
  if (settings.problem) return [settings.problem];
  if (settings.missing) {
    return routing.conselheiro === null ? [] : [`${SETTINGS_FILE}: ausente; é onde o conselheiro vira \`advisorModel\``];
  }
  if (!isPlainObject(settings.value)) return [`${SETTINGS_FILE}: precisa ser um objeto JSON`];
  const expected = expectedAdvisor(routing);
  // Trocar a chave reescreve o arquivo pelo JSON.stringify. Se o arquivo não está nesse formato, a reescrita
  // mudaria o que não é desta chave (arrays em uma linha, ordem de chaves, inteiro grande que perde precisão).
  if (currentAdvisor(settings) !== expected && renderLike(settings.text, settings.value) !== settings.text) {
    const acao = expected === undefined ? 'remova a chave `advisorModel`' : `ponha \`"advisorModel": "${expected}"\``;
    return [`${SETTINGS_FILE}: não está no formato que o apply escreve, e reescrevê-lo mudaria mais que a chave advisorModel; ${acao} à mão`];
  }
  return [];
}

/** Tudo o que impede o `apply` de escrever. O `check` soma a isto a comparação com o que está no disco. */
export function validate(state) {
  const { routing, settings, agents, listingProblems } = state;
  if (routing.missing) return [`${ROUTING_FILE}: ausente`];
  if (routing.problem) return [routing.problem];
  if (!isPlainObject(routing.value)) return [`${ROUTING_FILE}: precisa ser um objeto JSON`];
  return [
    ...levelProblems(routing.value.niveis),
    ...referenceProblems(routing.value),
    ...listingProblems,
    ...agentProblems(routing.value, agents),
    ...settingsProblems(routing.value, settings),
  ];
}

// --- o que o arquivo manda × o que está no disco ---------------------------------------

function expectedFor(routing, agent) {
  if (!agent.parsed || !agent.name) return null;
  const levels = asObject(routing.agents);
  const niveis = asObject(routing.niveis);
  if (!has(levels, agent.name) || !has(niveis, levels[agent.name])) return null;
  const def = niveis[levels[agent.name]];
  return isValidModel(def?.model) && EFFORT_LEVELS.includes(def?.effort) ? { model: def.model, effort: def.effort } : null;
}

export function drift(state) {
  const routing = state.routing.value;
  const problems = [];
  for (const agent of state.agents) {
    const expected = expectedFor(routing, agent);
    if (!expected) continue; // sem nível válido: a validação já disse por quê
    for (const key of WRITTEN_KEYS) {
      const found = fieldValue(agent.parsed.fields, key);
      if (found !== expected[key]) {
        problems.push(`agent \`${agent.name}\` (${agent.rel}): ${key}: encontrado \`${found ?? ABSENT}\`, esperado \`${expected[key]}\``);
      }
    }
  }
  if (isPlainObject(state.settings.value) || state.settings.missing) {
    const found = currentAdvisor(state.settings);
    const expected = expectedAdvisor(routing);
    if (found !== expected) {
      problems.push(`${SETTINGS_FILE}: advisorModel: encontrado \`${found ?? ABSENT}\`, esperado \`${expected ?? ABSENT}\``);
    }
  }
  return problems;
}

/** As escritas que deixam o disco igual ao que o arquivo manda. Lista vazia quando já está igual. */
export function plannedWrites(state) {
  const routing = state.routing.value;
  const writes = [];
  for (const agent of state.agents) {
    const expected = expectedFor(routing, agent);
    if (!expected) continue;
    const { head, eol, fields, rest } = agent.parsed;
    const next = WRITTEN_KEYS.reduce((acc, key) => withField(acc, key, expected[key], eol), fields);
    const text = head + next.join('') + rest;
    if (text !== agent.text) writes.push({ rel: agent.rel, text, encoding: 'latin1' });
  }
  const advisor = expectedAdvisor(routing);
  if (currentAdvisor(state.settings) !== advisor) {
    const { advisorModel: _removed, ...rest } = state.settings.value;
    const next = advisor === undefined ? rest : { ...state.settings.value, advisorModel: advisor };
    writes.push({ rel: SETTINGS_FILE, text: renderLike(state.settings.text, next), encoding: 'utf8' });
  }
  return writes;
}

// --- subcomandos --------------------------------------------------------------------

function checkState(state) {
  const invalid = validate(state);
  // Com o arquivo de roteamento ilegível não há o que comparar: a comparação só soma ruído.
  const unreadable = state.routing.missing || state.routing.problem || !isPlainObject(state.routing.value);
  return unreadable ? invalid : [...invalid, ...drift(state)];
}

export function runCheck(root) {
  return checkState(loadState(root));
}

function unwritable(root, writes) {
  return writes.flatMap((write) => {
    try {
      accessSync(path.join(root, write.rel), constants.W_OK);
      return [];
    } catch (err) {
      return [`${write.rel}: sem permissão de escrita (${err.code})`];
    }
  });
}

export function runApply(root) {
  const state = loadState(root);
  const invalid = validate(state);
  if (invalid.length) return { problems: invalid, written: [] };
  const writes = plannedWrites(state);
  // A permissão é conferida para todos antes da primeira escrita: uma falha no meio deixaria parte dos
  // agents no nível novo e parte no antigo.
  const blocked = unwritable(root, writes);
  if (blocked.length) return { problems: blocked, written: [] };
  const written = [];
  for (const write of writes) {
    try {
      writeFileSync(path.join(root, write.rel), write.text, write.encoding);
      written.push(write.rel);
    } catch (err) {
      const pending = writes.map((w) => w.rel).filter((rel) => !written.includes(rel));
      return { problems: [`${write.rel}: falha ao escrever (${err.code}); não escritos: ${pending.join(', ')}`], written };
    }
  }
  // O `apply` só diz que aplicou se o `check` concorda: relê o disco em vez de confiar no que planejou.
  const remaining = runCheck(root);
  if (remaining.length) return { problems: ['o apply escreveu, mas o disco ainda diverge do arquivo:', ...remaining], written };
  return { problems: [], written };
}

function parseArgs(argv) {
  const opts = { command: undefined, root: process.cwd(), error: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--root') {
      const value = argv[i + 1];
      // Uma flag não é valor de outra flag: `--root --x` é erro de uso, não uma raiz chamada `--x`.
      if (value === undefined || value.startsWith('--')) return { ...opts, error: '--root pede um diretório' };
      opts.root = path.resolve(value);
      i += 1;
    } else if (arg.startsWith('--')) {
      return { ...opts, error: `opção desconhecida: ${arg}` };
    } else if (opts.command === undefined) {
      opts.command = arg;
    } else {
      return { ...opts, error: `argumento a mais: ${arg}` };
    }
  }
  return opts;
}

function reportProblems(command, problems) {
  for (const problem of problems) process.stderr.write(`${problem}\n`);
  process.stdout.write(`model-routing ${command}: ${problems.length} problema(s)\n`);
}

const listWritten = (written) => written.map((rel) => `- ${rel}`).join('\n');

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.error || !['check', 'apply'].includes(opts.command)) {
    if (opts.error) process.stderr.write(`${opts.error}\n`);
    process.stderr.write(`${USAGE}\n`);
    process.exit(2);
  }
  if (opts.command === 'check') {
    const problems = runCheck(opts.root);
    if (problems.length) {
      reportProblems('check', problems);
      process.exit(1);
    }
    process.stdout.write('model-routing check: ok\n');
    process.exit(0);
  }
  const { problems, written } = runApply(opts.root);
  if (problems.length) {
    reportProblems('apply', problems);
    if (written.length) process.stdout.write(`model-routing apply: escritos antes da falha\n${listWritten(written)}\n`);
    else process.stdout.write('model-routing apply: nada foi escrito\n');
    process.exit(1);
  }
  if (!written.length) process.stdout.write('model-routing apply: nada a alterar\n');
  else process.stdout.write(`model-routing apply: ${written.length} arquivo(s) alterado(s)\n${listWritten(written)}\n`);
  process.exit(0);
}

// Os dois lados passam pelo caminho real: chamado por um caminho com link simbólico (um worktree, `/tmp` no
// macOS), `import.meta.url` já vem resolvido e `process.argv[1]` não, e a comparação crua saía com 0 sem rodar.
function isEntrypoint() {
  if (!process.argv[1]) return false;
  let self;
  try {
    self = realpathSync(fileURLToPath(import.meta.url));
  } catch {
    // O próprio arquivo ilegível: roda, porque não rodar é o lado que deixa um portão verde ou um hook aberto.
    return true;
  }
  try {
    return realpathSync(process.argv[1]) === self;
  } catch {
    // A linha de comando não aponta para um arquivo (`node -e`, `node -`, um glob no `--test`): quem rodou como
    // programa foi outro, e este módulo só foi importado.
    return false;
  }
}

if (isEntrypoint()) {
  main();
}
