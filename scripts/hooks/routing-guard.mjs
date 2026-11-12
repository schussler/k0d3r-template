#!/usr/bin/env node
// PreToolUse do Claude Code na chamada de subagent (ferramenta `Agent`, antes `Task`).
//
// Confere a chamada contra o `.claude/model-routing.json` e bloqueia (exit 2) dois desvios que o portão
// `model-routing check` não vê, porque estão na chamada e não no repositório:
//   1. subagent nativo (`general-purpose`, `Explore`, `Plan`) chamado sem o `model` e o `effort` do nível que a
//      chave `nativos` dá a ele;
//   2. agent com arquivo chamado com `model` ou `effort` diferentes do nível dele, fora da escalada para o nível
//      `fronteira` que a rule `model-routing.md` permite.
// Agent que o arquivo não conhece (de plugin, de `~/.claude/agents`) passa.
//
// É uma guarda de custo, não de segurança: payload ilegível, arquivo de roteamento ausente ou inválido e Node
// ausente deixam a chamada seguir, com um aviso em stderr.

import { readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROUTING_FILE = '.claude/model-routing.json';
const AGENT_TOOLS = new Set(['Agent', 'Task']);
const ESCALATION_LEVEL = 'fronteira';

const sameModel = (got, expected) => typeof got === 'string' && got.toLowerCase().includes(String(expected).toLowerCase());
const show = (v) => (v === undefined ? 'ausente' : `"${v}"`);

// Decide sobre uma chamada. Devolve null para liberar, ou a mensagem do bloqueio.
export function decide(payload, routing) {
  if (!AGENT_TOOLS.has(payload?.tool_name)) return null;
  const input = payload.tool_input ?? {};
  const type = input.subagent_type;
  const niveis = routing?.niveis ?? {};
  const nativeLevel = Object.hasOwn(routing?.nativos ?? {}, type) ? routing.nativos[type] : undefined;
  const fileLevel = Object.hasOwn(routing?.agents ?? {}, type) ? routing.agents[type] : undefined;

  if (nativeLevel !== undefined) {
    const lvl = niveis[nativeLevel];
    if (!lvl) return null;
    if (sameModel(input.model, lvl.model) && input.effort === lvl.effort) return null;
    return `[routing-guard] O subagent nativo \`${type}\` roda no nível \`${nativeLevel}\` do ${ROUTING_FILE}: `
      + `passe model "${lvl.model}" e effort "${lvl.effort}" na chamada (recebido: model ${show(input.model)}, `
      + `effort ${show(input.effort)}). Se esta parte pede mais, chame no nível pedido pela spec e diga isso na entrega.`;
  }

  if (fileLevel !== undefined) {
    if (input.model === undefined && input.effort === undefined) return null;
    const own = niveis[fileLevel];
    const up = niveis[ESCALATION_LEVEL];
    const matches = (lvl) => lvl && (input.model === undefined || sameModel(input.model, lvl.model))
      && (input.effort === undefined || input.effort === lvl.effort);
    if (matches(own) || matches(up)) return null;
    return `[routing-guard] O agent \`${type}\` tem arquivo e roda no nível \`${fileLevel}\` pelo frontmatter: não passe `
      + `model nem effort na chamada (recebido: model ${show(input.model)}, effort ${show(input.effort)}). A exceção é `
      + `a escalada para o nível \`${ESCALATION_LEVEL}\`${up ? ` (model "${up.model}", effort "${up.effort}")` : ''}, `
      + 'dita na entrega (.claude/rules/common/model-routing.md).';
  }
  return null;
}

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function main() {
  let payload;
  try {
    payload = JSON.parse(readStdin());
  } catch {
    console.error('[routing-guard] payload ilegível; a chamada segue sem conferência do roteamento.');
    process.exit(0);
  }
  const root = process.env.CLAUDE_PROJECT_DIR || payload.cwd || process.cwd();
  let routing;
  try {
    routing = JSON.parse(readFileSync(join(root, ROUTING_FILE), 'utf8'));
  } catch (err) {
    console.error(`[routing-guard] não li ${ROUTING_FILE} (${err.code ?? err.message}); a chamada segue sem conferência.`);
    process.exit(0);
  }
  const block = decide(payload, routing);
  if (block) {
    console.error(block);
    process.exit(2);
  }
  process.exit(0);
}

// Os dois lados passam pelo caminho real: chamado por um caminho com link simbólico, `import.meta.url` já vem
// resolvido e `process.argv[1]` não.
function isEntrypoint() {
  if (!process.argv[1]) return false;
  let self;
  try {
    self = realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return true;
  }
  try {
    return realpathSync(process.argv[1]) === self;
  } catch {
    return false;
  }
}

if (isEntrypoint()) main();
