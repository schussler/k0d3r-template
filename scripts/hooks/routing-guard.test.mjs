import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide } from './routing-guard.mjs';

const HOOK = fileURLToPath(new URL('./routing-guard.mjs', import.meta.url));
const ROUTING = {
  niveis: {
    fronteira: { model: 'fable', effort: 'high' },
    raciocinio: { model: 'opus', effort: 'high' },
    padrao: { model: 'sonnet', effort: 'medium' },
    rapido: { model: 'haiku', effort: 'low' },
  },
  agents: { 'code-reviewer': 'padrao', 'security-reviewer': 'raciocinio' },
  nativos: { Plan: 'fronteira', 'general-purpose': 'padrao', Explore: 'rapido' },
};
const call = (input, tool = 'Agent') => ({ tool_name: tool, tool_input: input });

function run(payload, routing = ROUTING) {
  const dir = mkdtempSync(join(tmpdir(), 'routing-guard-'));
  if (routing !== null) {
    mkdirSync(join(dir, '.claude'));
    writeFileSync(join(dir, '.claude', 'model-routing.json'), typeof routing === 'string' ? routing : JSON.stringify(routing));
  }
  const input = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return spawnSync(process.execPath, [HOOK], { input, env: { ...process.env, CLAUDE_PROJECT_DIR: dir }, encoding: 'utf8' });
}

// --- o desvio visto na corrida gramma ------------------------------------------------------
test('nativo general-purpose pedido em opus, sem effort, é bloqueado e a mensagem diz o nível certo', () => {
  const msg = decide(call({ subagent_type: 'general-purpose', model: 'opus', prompt: 'x' }), ROUTING);
  assert.ok(msg, 'deveria bloquear');
  assert.match(msg, /padrao/);
  assert.match(msg, /"sonnet"/);
  assert.match(msg, /"medium"/);
  assert.match(msg, /"opus"/);
});

test('nativo com o model certo e sem effort é bloqueado: a rule pede os dois', () => {
  assert.ok(decide(call({ subagent_type: 'Explore', model: 'haiku' }), ROUTING));
});

test('nativo sem model nem effort é bloqueado: herdaria o modelo da sessão', () => {
  assert.ok(decide(call({ subagent_type: 'Plan' }), ROUTING));
});

test('nativo com o model e o effort do nível passa', () => {
  assert.equal(decide(call({ subagent_type: 'general-purpose', model: 'sonnet', effort: 'medium' }), ROUTING), null);
  assert.equal(decide(call({ subagent_type: 'Explore', model: 'haiku', effort: 'low' }), ROUTING), null);
});

test('model escrito como ID completo do mesmo alias passa', () => {
  assert.equal(decide(call({ subagent_type: 'general-purpose', model: 'claude-sonnet-5-5', effort: 'medium' }), ROUTING), null);
});

// --- agents com arquivo ------------------------------------------------------------------------
test('agent com arquivo sem model nem effort passa: o frontmatter decide', () => {
  assert.equal(decide(call({ subagent_type: 'code-reviewer', prompt: 'x' }), ROUTING), null);
});

test('agent com arquivo escalado para fronteira passa', () => {
  assert.equal(decide(call({ subagent_type: 'security-reviewer', model: 'fable', effort: 'high' }), ROUTING), null);
});

test('agent com arquivo pedido num modelo fora do nível dele e fora da escalada é bloqueado', () => {
  const msg = decide(call({ subagent_type: 'code-reviewer', model: 'opus' }), ROUTING);
  assert.ok(msg);
  assert.match(msg, /frontmatter/);
  assert.match(msg, /fronteira/);
});

test('agent com arquivo com o model do próprio nível passa', () => {
  assert.equal(decide(call({ subagent_type: 'code-reviewer', model: 'sonnet' }), ROUTING), null);
});

// --- o que a guarda não confere ----------------------------------------------------------------
test('agent que o arquivo não conhece passa', () => {
  assert.equal(decide(call({ subagent_type: 'claude-code-guide', model: 'opus' }), ROUTING), null);
});

test('ferramenta que não é de subagent passa', () => {
  assert.equal(decide({ tool_name: 'Bash', tool_input: { command: 'ls' } }, ROUTING), null);
});

test('o nome antigo da ferramenta, Task, também é conferido', () => {
  assert.ok(decide(call({ subagent_type: 'general-purpose', model: 'opus' }, 'Task'), ROUTING));
});

test('nome herdado de Object.prototype não conta como nativo nem como agent', () => {
  assert.equal(decide(call({ subagent_type: 'toString', model: 'opus' }), ROUTING), null);
});

// --- processo: códigos de saída ----------------------------------------------------------------
test('bloqueio sai com 2 e a mensagem em stderr', () => {
  const r = run(call({ subagent_type: 'general-purpose', model: 'opus' }));
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /routing-guard/);
});

test('chamada certa sai com 0 e sem nada em stderr', () => {
  const r = run(call({ subagent_type: 'general-purpose', model: 'sonnet', effort: 'medium' }));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '');
});

test('payload ilegível libera com aviso: é guarda de custo, não de segurança', () => {
  const r = run('não é json');
  assert.equal(r.status, 0);
  assert.match(r.stderr, /payload ilegível/);
});

test('sem arquivo de roteamento, libera com aviso', () => {
  const r = run(call({ subagent_type: 'general-purpose', model: 'opus' }), null);
  assert.equal(r.status, 0);
  assert.match(r.stderr, /model-routing\.json/);
});

test('arquivo de roteamento inválido libera com aviso', () => {
  const r = run(call({ subagent_type: 'general-purpose', model: 'opus' }), '{ quebrado');
  assert.equal(r.status, 0);
  assert.match(r.stderr, /model-routing\.json/);
});
