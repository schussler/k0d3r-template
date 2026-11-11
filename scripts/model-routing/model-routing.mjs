#!/usr/bin/env node
// Roteamento de modelo e esforço dos agents.
//
// A fonte única é `.claude/model-routing.json`. Este script deriva dela as linhas `model:` e `effort:` do
// frontmatter de cada agent e a chave `advisorModel` do `.claude/settings.json`:
//   check  confere, não escreve nada; é portão (sai com 1 e uma linha por problema no stderr).
//   apply  valida tudo e só então escreve; com qualquer problema de validação, não escreve arquivo nenhum.
//
// Spec: docs/in-progress/processo/roteamento-de-modelos.md.

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
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

const USAGE = 'uso: node scripts/model-routing/model-routing.mjs <check|apply> [--root <dir>]';

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isValidModel = (m) => MODEL_ALIASES.includes(m) || m === INHERIT || (typeof m === 'string' && FULL_MODEL_ID.test(m));

// --- leitura ------------------------------------------------------------------------

function readJson(root, rel) {
  const file = path.join(root, rel);
  if (!existsSync(file)) return { missing: true };
  const text = readFileSync(file, 'utf8');
  try {
    return { text, value: JSON.parse(text) };
  } catch (err) {
    return { text, problem: `${rel}: JSON inválido (${err.message})` };
  }
}

/**
 * Separa o frontmatter em linhas, sem normalizar nada. `rest` começa na linha `---` que fecha o frontmatter e
 * leva o corpo inteiro: é devolvido intocado, para que um `model:` ou um `---` no corpo nunca seja lido como
 * campo. Devolve null quando o arquivo não abre com `---` ou quando o frontmatter nunca fecha.
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
    if (line.replace(/\r?\n$/, '') === '---') {
      return { head: open[0], eol: open[1], fields, rest: text.slice(pos) };
    }
    fields.push(line);
    pos = end;
  }
  return null;
}

const fieldPattern = (key) => new RegExp(`^${key}:[ \\t]*(.*?)[ \\t]*(\\r?\\n)?$`);

export function fieldValue(fields, key) {
  for (const line of fields) {
    const match = fieldPattern(key).exec(line);
    if (match) return match[1].replace(/^(['"])(.*)\1$/, '$2');
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

function readAgents(root) {
  const dir = path.join(root, AGENTS_DIR);
  if (!existsSync(dir)) return [];
  // Ordenado: a ordem do readdir muda de um sistema de arquivos para outro, e a saída tem de ser a mesma.
  const names = readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
  return names.map((file) => {
    const rel = `${AGENTS_DIR}/${file}`;
    // latin1 é ida e volta sem perda para qualquer byte: o corpo do agent volta ao disco byte a byte, mesmo
    // que não seja UTF-8 válido. As chaves e os valores que este script lê e escreve são ASCII.
    const text = readFileSync(path.join(dir, file), 'latin1');
    const parsed = splitFrontmatter(text);
    const name = parsed ? fieldValue(parsed.fields, 'name') : undefined;
    return { rel, text, parsed, name };
  });
}

function loadState(root) {
  return {
    routing: readJson(root, ROUTING_FILE),
    settings: readJson(root, SETTINGS_FILE),
    agents: readAgents(root),
  };
}

// --- validação ----------------------------------------------------------------------

function levelProblems(niveis) {
  if (!isPlainObject(niveis)) return [`${ROUTING_FILE}: \`niveis\` precisa ser um objeto nível → { model, effort }`];
  return Object.entries(niveis).flatMap(([level, def]) => {
    if (!isPlainObject(def)) return [`nível \`${level}\`: precisa ser um objeto { model, effort }`];
    const problems = [];
    if (!isValidModel(def.model)) {
      problems.push(`nível \`${level}\`: model \`${def.model}\` não é aceito (${MODEL_ALIASES.join(', ')}, ${INHERIT} ou um ID claude-*)`);
    }
    if (!EFFORT_LEVELS.includes(def.effort)) {
      problems.push(`nível \`${level}\`: effort \`${def.effort}\` não é aceito (${EFFORT_LEVELS.join(', ')})`);
    }
    return problems;
  });
}

function referenceProblems(routing) {
  const niveis = isPlainObject(routing.niveis) ? routing.niveis : {};
  const problems = [];
  for (const key of ['agents', 'nativos']) {
    if (!isPlainObject(routing[key])) problems.push(`${ROUTING_FILE}: \`${key}\` precisa ser um objeto nome → nível`);
  }
  for (const [agent, level] of Object.entries(isPlainObject(routing.agents) ? routing.agents : {})) {
    if (!(level in niveis)) problems.push(`agent \`${agent}\`: o nível \`${level}\` não existe em niveis`);
  }
  for (const [native, level] of Object.entries(isPlainObject(routing.nativos) ? routing.nativos : {})) {
    if (!(level in niveis)) {
      problems.push(`nativo \`${native}\`: o nível \`${level}\` não existe em niveis`);
    } else if (isValidModel(niveis[level]?.model) && !MODEL_ALIASES.includes(niveis[level].model)) {
      // O parâmetro `model` da chamada de agent só aceita alias; ID completo e `inherit` não passam.
      problems.push(`nativo \`${native}\`: o nível \`${level}\` tem model \`${niveis[level].model}\`, que não é alias (${MODEL_ALIASES.join(', ')})`);
    }
  }
  if (!(routing.orquestrador in niveis)) {
    problems.push(`${ROUTING_FILE}: orquestrador \`${routing.orquestrador}\` não é um nível de niveis`);
  }
  if (routing.conselheiro !== null && !ADVISOR_ALIASES.includes(routing.conselheiro)) {
    problems.push(`${ROUTING_FILE}: conselheiro \`${routing.conselheiro}\` não é aceito (${ADVISOR_ALIASES.join(', ')} ou null)`);
  }
  return problems;
}

function agentProblems(routing, agents) {
  const levels = isPlainObject(routing.agents) ? routing.agents : {};
  const problems = [];
  for (const agent of agents) {
    if (!agent.parsed) problems.push(`${agent.rel}: sem frontmatter (o arquivo precisa abrir com \`---\` e fechá-lo)`);
    else if (!agent.name) problems.push(`${agent.rel}: frontmatter sem \`name:\``);
    else if (!(agent.name in levels)) problems.push(`agent \`${agent.name}\` (${agent.rel}): falta o nível em agents de ${ROUTING_FILE}`);
  }
  const present = new Set(agents.map((a) => a.name));
  for (const name of Object.keys(levels)) {
    if (!present.has(name)) problems.push(`agent \`${name}\`: tem nível em agents, mas não tem arquivo em ${AGENTS_DIR}/`);
  }
  return problems;
}

function settingsProblems(routing, settings) {
  if (settings.problem) return [settings.problem];
  if (settings.missing) {
    return routing.conselheiro === null ? [] : [`${SETTINGS_FILE}: ausente; é onde o conselheiro vira \`advisorModel\``];
  }
  return isPlainObject(settings.value) ? [] : [`${SETTINGS_FILE}: precisa ser um objeto JSON`];
}

/** Tudo o que impede o `apply` de escrever. O `check` soma a isto a comparação com o que está no disco. */
export function validate(state) {
  const { routing, settings, agents } = state;
  if (routing.missing) return [`${ROUTING_FILE}: ausente`];
  if (routing.problem) return [routing.problem];
  if (!isPlainObject(routing.value)) return [`${ROUTING_FILE}: precisa ser um objeto JSON`];
  return [
    ...levelProblems(routing.value.niveis),
    ...referenceProblems(routing.value),
    ...agentProblems(routing.value, agents),
    ...settingsProblems(routing.value, settings),
  ];
}

// --- o que o arquivo manda × o que está no disco ---------------------------------------

function expectedFor(routing, agent) {
  const level = routing.agents?.[agent.name];
  const def = routing.niveis?.[level];
  return agent.parsed && def ? { model: def.model, effort: def.effort } : null;
}

const currentAdvisor = (settings) => (settings.missing ? undefined : settings.value?.advisorModel);
const expectedAdvisor = (routing) => routing.conselheiro ?? undefined;

export function drift(state) {
  const routing = state.routing.value;
  const problems = [];
  for (const agent of state.agents) {
    const expected = expectedFor(routing, agent);
    if (!expected) continue;
    for (const key of ['model', 'effort']) {
      const found = fieldValue(agent.parsed.fields, key);
      if (found !== expected[key]) {
        problems.push(`agent \`${agent.name}\` (${agent.rel}): ${key}: encontrado \`${found ?? ABSENT}\`, esperado \`${expected[key]}\``);
      }
    }
  }
  const found = currentAdvisor(state.settings);
  const expected = expectedAdvisor(routing);
  if (found !== expected) {
    problems.push(`${SETTINGS_FILE}: advisorModel: encontrado \`${found ?? ABSENT}\`, esperado \`${expected ?? ABSENT}\``);
  }
  return problems;
}

function renderSettings(settings, advisor) {
  const { advisorModel: _removed, ...rest } = settings.value;
  const next = advisor === undefined ? rest : { ...settings.value, advisorModel: advisor };
  // Reescreve no formato que o arquivo já tem, para o diff mostrar só a chave que mudou.
  const indent = /^\{\r?\n([ \t]+)"/.exec(settings.text)?.[1] ?? DEFAULT_JSON_INDENT;
  const eol = settings.text.includes('\r\n') ? '\r\n' : '\n';
  const body = JSON.stringify(next, null, indent).replace(/\n/g, eol);
  return /\n$/.test(settings.text) ? body + eol : body;
}

/** As escritas que deixam o disco igual ao que o arquivo manda. Lista vazia quando já está igual. */
export function plannedWrites(state) {
  const routing = state.routing.value;
  const writes = [];
  for (const agent of state.agents) {
    const expected = expectedFor(routing, agent);
    if (!expected) continue;
    const { head, eol, fields, rest } = agent.parsed;
    const next = withField(withField(fields, 'model', expected.model, eol), 'effort', expected.effort, eol);
    const text = head + next.join('') + rest;
    if (text !== agent.text) writes.push({ rel: agent.rel, text, encoding: 'latin1' });
  }
  if (currentAdvisor(state.settings) !== expectedAdvisor(routing)) {
    writes.push({ rel: SETTINGS_FILE, text: renderSettings(state.settings, expectedAdvisor(routing)), encoding: 'utf8' });
  }
  return writes;
}

// --- subcomandos --------------------------------------------------------------------

export function runCheck(root) {
  const state = loadState(root);
  const invalid = validate(state);
  // Com o arquivo de roteamento ilegível não há o que comparar: a comparação só soma ruído.
  const unreadable = state.routing.missing || state.routing.problem || !isPlainObject(state.routing.value);
  return unreadable ? invalid : [...invalid, ...drift(state)];
}

export function runApply(root) {
  const state = loadState(root);
  const problems = validate(state);
  if (problems.length) return { problems, written: [] };
  const writes = plannedWrites(state);
  for (const write of writes) writeFileSync(path.join(root, write.rel), write.text, write.encoding);
  return { problems: [], written: writes.map((w) => w.rel) };
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
    process.stdout.write('model-routing apply: nada foi escrito\n');
    process.exit(1);
  }
  if (!written.length) process.stdout.write('model-routing apply: nada a alterar\n');
  else process.stdout.write(`model-routing apply: ${written.length} arquivo(s) alterado(s)\n${written.map((rel) => `- ${rel}`).join('\n')}\n`);
  process.exit(0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
