// Tests for model-routing. Run: node --test scripts/model-routing/model-routing.test.mjs
// Written from the spec alone (docs/in-progress/processo/roteamento-de-modelos.md). The script is exercised
// only through its command line contract (`check|apply [--root <dir>]`) on throwaway roots, never on the real
// .claude/ of the repository. Hatch cases (apply that must not write, CRLF, text inside the body, settings
// missing or broken) come first, as the spec asks.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'model-routing.mjs');
const ROUTING = '.claude/model-routing.json';
const SETTINGS = '.claude/settings.json';
const agentPath = (name) => `.claude/agents/${name}.md`;

const roots = [];
after(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

// --- helpers ------------------------------------------------------------------------

// Without this guard a missing script makes node exit 1, which would pass every "exits 1" test by accident.
function run(args, { cwd, script = SCRIPT } = {}) {
  assert.ok(existsSync(script), `o script não existe: ${script}`);
  const r = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', cwd, timeout: 20000 });
  // An uncaught exception also exits 1 with text on stderr, which is what a refusal looks like. A stack
  // trace is never part of the contract, so it fails every test that runs the script.
  assert.doesNotMatch(r.stderr, /^\s+at .+:\d+:\d+\)?$/m, `o script quebrou em vez de responder:\n${r.stderr}`);
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}
const check = (f) => run(['check', '--root', f.root]);
const apply = (f) => run(['apply', '--root', f.root]);

const baseConfig = () => ({
  niveis: {
    fronteira: { model: 'fable', effort: 'high' },
    padrao: { model: 'sonnet', effort: 'medium' },
    rapido: { model: 'haiku', effort: 'low' },
  },
  orquestrador: 'fronteira',
  conselheiro: 'fable',
  agents: { planner: 'fronteira', reviewer: 'padrao', writer: 'padrao', finder: 'rapido' },
  nativos: { Plan: 'fronteira', Explore: 'rapido' },
});

// Bodies are chosen to stress byte fidelity: accents, CRLF, no trailing newline, "model:" text, a "---" line.
const BODIES = {
  planner: 'Corpo do planner.\n',
  reviewer: 'Revisão com acentuação: ção, ã, é.\r\nLinha CRLF no corpo.\r\nSem quebra final',
  writer: 'Exemplo de frontmatter:\n\nmodel: opus\neffort: max\n\n---\nmodel: haiku\n',
  finder: 'Busca.\n',
};

function agentText(name, { model, effort, body, eol = '\n' } = {}) {
  const lines = [`name: ${name}`, `description: Agent ${name}`, 'tools: Read, Grep'];
  if (model !== undefined) lines.push(`model: ${model}`);
  if (effort !== undefined) lines.push(`effort: ${effort}`);
  return `---${eol}${lines.join(eol)}${eol}---${eol}${body ?? BODIES[name] ?? 'Corpo.\n'}`;
}

const SETTINGS_BASE = () => ({
  permissions: { allow: ['Bash(ls:*)'], deny: ['Bash(rm:*)'] },
  hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'echo oi' }] }] },
  outraChave: { a: 1 },
});

// Builds a root. `config` mutates the default config; agents are written in sync with it unless `unsynced`.
// `settings`: object, raw string, or null (file absent). Default: base settings plus advisorModel = conselheiro.
function fixture({ config, settings, unsynced = false } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'model-routing-'));
  roots.push(root);
  const cfg = baseConfig();
  if (config) config(cfg);
  const f = {
    root,
    cfg,
    write(rel, content) {
      mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      writeFileSync(path.join(root, rel), content);
    },
    read: (rel) => readFileSync(path.join(root, rel)),
    json: (rel) => JSON.parse(readFileSync(path.join(root, rel), 'utf8')),
  };
  f.write(ROUTING, JSON.stringify(cfg, null, 2) + '\n');
  for (const [name, level] of Object.entries(cfg.agents)) {
    const lv = cfg.niveis[level] ?? baseConfig().niveis.padrao;
    f.write(agentPath(name), unsynced ? agentText(name, { model: 'opus', effort: 'max' }) : agentText(name, lv));
  }
  if (settings !== null) {
    const s = settings ?? { ...SETTINGS_BASE(), ...(cfg.conselheiro ? { advisorModel: cfg.conselheiro } : {}) };
    f.write(SETTINGS, typeof s === 'string' ? s : JSON.stringify(s, null, 2) + '\n');
  }
  return f;
}

function snapshot(root) {
  const out = new Map();
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else out.set(path.relative(root, p), readFileSync(p));
    }
  };
  walk(root);
  return out;
}

const lines = (s) => s.split('\n').filter((l) => l.trim() !== '');
// The tail is measured in bytes, not in characters: an accented body is longer in UTF-8 than its string length.
const bytesEndWith = (buf, tail) => {
  const expected = Buffer.from(tail);
  return buf.subarray(buf.length - expected.length).equals(expected);
};
// The fixture writes a file for every entry of `agents`; an "entry without a file" has to remove it afterwards.
const removeAgentFile = (f, name) => rmSync(path.join(f.root, agentPath(name)));

// --- escotilhas: apply que não pode escrever ----------------------------------------

const APPLY_REFUSES = [
  ['JSON de roteamento inválido', { after: (f) => f.write(ROUTING, '{ isto não é json') }],
  ['JSON de roteamento ausente', { after: (f) => rmSync(path.join(f.root, ROUTING)) }],
  ['agent que cita nível inexistente', { config: (c) => { c.agents.planner = 'nivel-fantasma'; } }],
  ['model fora dos valores aceitos', { config: (c) => { c.niveis.padrao.model = 'gpt-4'; } }],
  ['effort fora dos valores aceitos', { config: (c) => { c.niveis.padrao.effort = 'ultra'; } }],
  ['nativo cujo nível não tem alias', { config: (c) => { c.niveis.heredado = { model: 'inherit', effort: 'low' }; c.nativos.Plan = 'heredado'; } }],
  ['orquestrador que não é nível', { config: (c) => { c.orquestrador = 'nenhum'; } }],
  ['conselheiro que não é alias nem null', { config: (c) => { c.conselheiro = 'gpt-5'; } }],
  ['arquivo de agent sem entrada em agents', { after: (f) => f.write(agentPath('extra'), agentText('extra', {})) }],
  ['entrada em agents sem arquivo', { config: (c) => { c.agents.fantasma = 'padrao'; }, after: (f) => removeAgentFile(f, 'fantasma') }],
  ['agent sem frontmatter', { after: (f) => f.write(agentPath('finder'), '# sem frontmatter\n\nso corpo\n') }],
  ['settings.json com JSON inválido', { settings: '{ quebrado' }],
  ['settings.json ausente', { settings: null }],
];

for (const [nome, caso] of APPLY_REFUSES) {
  test(`apply com validação falhando (${nome}) sai com 1 e não escreve nem cria arquivo nenhum`, () => {
    // Arrange: agents fora de sincronia, para que um apply que escrevesse mudaria bytes
    const f = fixture({ config: caso.config, settings: caso.settings, unsynced: true });
    caso.after?.(f);
    const antes = snapshot(f.root);
    // Act
    const r = apply(f);
    // Assert
    assert.equal(r.status, 1, r.stderr);
    assert.ok(r.stderr.trim() !== '', 'o problema deve sair no stderr');
    assert.deepEqual(snapshot(f.root), antes);
  });
}

test('agent sem frontmatter: check sai com 1 e a mensagem cita o arquivo', () => {
  const f = fixture();
  f.write(agentPath('finder'), '# sem frontmatter\n');
  const r = check(f);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /finder/);
});

test('settings.json inválido: check sai com 1 e a mensagem cita o arquivo', () => {
  const f = fixture({ settings: '{ quebrado' });
  const r = check(f);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /settings\.json/);
});

test('apply em frontmatter com \\r\\n: corpo e demais linhas ficam em bytes, o campo entra e o check passa', () => {
  // Arrange
  const f = fixture({ unsynced: true });
  const original = agentText('planner', { eol: '\r\n', body: 'Corpo CRLF\r\nsegunda linha\r\n' });
  f.write(agentPath('planner'), original);
  // Act
  const r = apply(f);
  // Assert
  assert.equal(r.status, 0, r.stderr);
  const depois = f.read(agentPath('planner'));
  const texto = depois.toString('utf8');
  assert.match(texto, /^model: fable\r?$/m);
  assert.match(texto, /^effort: high\r?$/m);
  assert.ok(bytesEndWith(depois, '---\r\nCorpo CRLF\r\nsegunda linha\r\n'), 'o corpo muda');
  for (const linha of ['name: planner\r\n', 'description: Agent planner\r\n', 'tools: Read, Grep\r\n']) {
    assert.ok(depois.includes(Buffer.from(linha)), `linha original alterada: ${JSON.stringify(linha)}`);
  }
  assert.equal(check(f).status, 0);
  const antes2 = snapshot(f.root);
  assert.equal(apply(f).status, 0);
  assert.deepEqual(snapshot(f.root), antes2);
});

test('apply em frontmatter com \\r\\n e model:/effort: já existentes troca o valor e preserva o resto', () => {
  const f = fixture({ unsynced: true });
  const original = '---\r\nname: planner\r\nmodel: opus\r\ndescription: d\r\neffort: max\r\n---\r\nCorpo\r\n';
  f.write(agentPath('planner'), original);
  assert.equal(apply(f).status, 0);
  const texto = f.read(agentPath('planner')).toString('utf8');
  assert.match(texto, /^model: fable\r?$/m);
  assert.match(texto, /^effort: high\r?$/m);
  assert.equal((texto.match(/^model:/gm) ?? []).length, 1);
  assert.equal((texto.match(/^effort:/gm) ?? []).length, 1);
  assert.ok(bytesEndWith(f.read(agentPath('planner')), '---\r\nCorpo\r\n'));
});

test('model: e effort: já existentes com outro valor são trocados no lugar, sem duplicar nem mover linhas', () => {
  // Arrange
  const f = fixture();
  f.write(agentPath('reviewer'), '---\nname: reviewer\nmodel: opus\ndescription: d\neffort: max\ntools: Read\n---\nCorpo\n');
  // Act
  const r = apply(f);
  // Assert
  assert.equal(r.status, 0, r.stderr);
  assert.equal(
    f.read(agentPath('reviewer')).toString('utf8'),
    '---\nname: reviewer\nmodel: sonnet\ndescription: d\neffort: medium\ntools: Read\n---\nCorpo\n',
  );
});

test('model: e effort: ausentes são acrescentados no fim do frontmatter, depois dos campos existentes', () => {
  const f = fixture({ unsynced: true });
  f.write(agentPath('finder'), '---\nname: finder\ndescription: d\ntools: Read\n---\nBusca.\n');
  assert.equal(apply(f).status, 0);
  const texto = f.read(agentPath('finder')).toString('utf8');
  const fm = texto.split('\n---\n')[0].split('\n');
  assert.deepEqual(fm.slice(0, 4), ['---', 'name: finder', 'description: d', 'tools: Read']);
  assert.deepEqual(fm.slice(4).sort(), ['effort: low', 'model: haiku']);
  assert.ok(texto.endsWith('\n---\nBusca.\n'));
});

test('texto model:/effort: e uma linha --- dentro do corpo não são tocados, com ou sem campos no frontmatter', () => {
  // Arrange: writer tem o corpo traiçoeiro; frontmatter sem campos (unsynced escreve com valores errados)
  const f = fixture();
  f.write(agentPath('writer'), agentText('writer', {}));
  f.write(agentPath('reviewer'), agentText('reviewer', { model: 'opus', effort: 'max', body: BODIES.writer }));
  // Act
  assert.equal(apply(f).status, 0);
  // Assert
  for (const nome of ['writer', 'reviewer']) {
    const depois = f.read(agentPath(nome));
    assert.ok(bytesEndWith(depois, `---\n${BODIES.writer}`), `${nome}: corpo alterado`);
    const fm = depois.toString('utf8').split('\n---\n')[0];
    assert.match(fm, /^model: sonnet$/m);
    assert.match(fm, /^effort: medium$/m);
  }
});

// --- critério 3: troca de nível e bytes ---------------------------------------------

test('trocar o model de um nível e rodar apply muda só os agents daquele nível, e o corpo fica igual em bytes', () => {
  // Arrange
  const f = fixture();
  const antes = snapshot(f.root);
  const cfg = f.json(ROUTING);
  cfg.niveis.padrao.model = 'opus';
  f.write(ROUTING, JSON.stringify(cfg, null, 2) + '\n');
  // Act
  const r = apply(f);
  // Assert
  assert.equal(r.status, 0, r.stderr);
  for (const nome of ['reviewer', 'writer']) {
    const depois = f.read(agentPath(nome));
    assert.match(depois.toString('utf8').split('\n---\n')[0], /^model: opus$/m);
    assert.ok(bytesEndWith(depois, `---\n${BODIES[nome]}`), `${nome}: corpo alterado`);
    assert.ok(r.stdout.includes(`${nome}.md`), `${nome}.md deve constar dos arquivos alterados`);
  }
  for (const nome of ['planner', 'finder']) {
    assert.ok(f.read(agentPath(nome)).equals(antes.get(agentPath(nome))), `${nome} mudou`);
    assert.ok(!r.stdout.includes(`${nome}.md`), `${nome}.md não deveria constar como alterado`);
  }
  assert.ok(f.read(SETTINGS).equals(antes.get(SETTINGS)), 'settings.json mudou sem necessidade');
  assert.equal(check(f).status, 0);
});

// --- critério 4: idempotência -------------------------------------------------------

test('um segundo apply seguido não altera arquivo nenhum', () => {
  const f = fixture({ unsynced: true, settings: { ...SETTINGS_BASE(), advisorModel: 'opus' } });
  const primeiro = apply(f);
  assert.equal(primeiro.status, 0, primeiro.stderr);
  const depoisDoPrimeiro = snapshot(f.root);
  const segundo = apply(f);
  assert.equal(segundo.status, 0, segundo.stderr);
  assert.deepEqual(snapshot(f.root), depoisDoPrimeiro);
  for (const nome of Object.keys(f.cfg.agents)) assert.ok(!segundo.stdout.includes(`${nome}.md`));
});

// --- critério 12: advisorModel ------------------------------------------------------

test('apply grava advisorModel igual a conselheiro e mantém permissions, hooks e as outras chaves', () => {
  // Arrange: settings sem advisorModel
  const f = fixture({ settings: SETTINGS_BASE() });
  // Act
  const r = apply(f);
  // Assert
  assert.equal(r.status, 0, r.stderr);
  const s = f.json(SETTINGS);
  assert.equal(s.advisorModel, 'fable');
  assert.deepEqual(s.permissions, SETTINGS_BASE().permissions);
  assert.deepEqual(s.hooks, SETTINGS_BASE().hooks);
  assert.deepEqual(s.outraChave, SETTINGS_BASE().outraChave);
  assert.ok(r.stdout.includes('settings.json'));
  assert.equal(check(f).status, 0);
});

test('apply troca um advisorModel diferente do conselheiro, preservando o resto', () => {
  const f = fixture({ settings: { ...SETTINGS_BASE(), advisorModel: 'opus' } });
  assert.equal(apply(f).status, 0);
  const s = f.json(SETTINGS);
  assert.equal(s.advisorModel, 'fable');
  assert.deepEqual(s.permissions, SETTINGS_BASE().permissions);
  assert.deepEqual(s.hooks, SETTINGS_BASE().hooks);
});

test('com conselheiro null o apply remove a chave advisorModel e preserva permissions e hooks', () => {
  // Arrange
  const f = fixture({ config: (c) => { c.conselheiro = null; }, settings: { ...SETTINGS_BASE(), advisorModel: 'fable' } });
  // Act
  const r = apply(f);
  // Assert
  assert.equal(r.status, 0, r.stderr);
  const s = f.json(SETTINGS);
  assert.ok(!('advisorModel' in s), 'advisorModel deveria ter sumido');
  assert.deepEqual(s.permissions, SETTINGS_BASE().permissions);
  assert.deepEqual(s.hooks, SETTINGS_BASE().hooks);
  assert.equal(check(f).status, 0);
});

// --- check: tabela de problemas -----------------------------------------------------

test('check sai com 0 e stderr vazio quando tudo bate', () => {
  const f = fixture();
  const r = check(f);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '');
});

test('check não escreve nada, nem quando acha problemas', () => {
  const f = fixture({ unsynced: true });
  const antes = snapshot(f.root);
  const r = check(f);
  assert.equal(r.status, 1);
  assert.deepEqual(snapshot(f.root), antes);
});

test('check aceita inherit e ID claude-* em nível de agent, e effort xhigh e max', () => {
  const f = fixture({
    config: (c) => {
      c.niveis.heredado = { model: 'inherit', effort: 'xhigh' };
      c.niveis.fixo = { model: 'claude-opus-4-1', effort: 'max' };
      c.agents.writer = 'heredado';
      c.agents.finder = 'fixo';
    },
  });
  const r = check(f);
  assert.equal(r.status, 0, r.stderr);
});

test('problema: agent sem entrada em agents, a mensagem cita o agent e sai 1', () => {
  const f = fixture();
  f.write(agentPath('orfao'), agentText('orfao', { model: 'sonnet', effort: 'medium' }));
  const r = check(f);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /orfao/);
});

test('problema: entrada em agents sem arquivo, a mensagem cita o nome e sai 1', () => {
  const f = fixture({ config: (c) => { c.agents.fantasma = 'padrao'; } });
  removeAgentFile(f, 'fantasma');
  const r = check(f);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /fantasma/);
});

test('problema: model do frontmatter diferente do nível cita o agent, o valor encontrado e o esperado', () => {
  const f = fixture();
  f.write(agentPath('reviewer'), agentText('reviewer', { model: 'opus', effort: 'medium' }));
  const r = check(f);
  assert.equal(r.status, 1);
  const linha = lines(r.stderr).find((l) => l.includes('reviewer'));
  assert.ok(linha, r.stderr);
  assert.match(linha, /opus/);
  assert.match(linha, /sonnet/);
});

test('problema: effort do frontmatter diferente do nível cita o agent, o valor encontrado e o esperado', () => {
  const f = fixture();
  f.write(agentPath('finder'), agentText('finder', { model: 'haiku', effort: 'max' }));
  const r = check(f);
  assert.equal(r.status, 1);
  const linha = lines(r.stderr).find((l) => l.includes('finder'));
  assert.ok(linha, r.stderr);
  assert.match(linha, /max/);
  assert.match(linha, /low/);
});

test('problema: agent que cita nível inexistente cita o agent e o nível', () => {
  const f = fixture({ config: (c) => { c.agents.planner = 'nivel-fantasma'; } });
  const r = check(f);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /planner/);
  assert.match(r.stderr, /nivel-fantasma/);
});

test('problema: nativo que cita nível inexistente cita o nativo e o nível', () => {
  const f = fixture({ config: (c) => { c.nativos.Explore = 'nivel-sumido'; } });
  const r = check(f);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Explore/);
  assert.match(r.stderr, /nivel-sumido/);
});

test('problema: model fora dos valores aceitos cita o nível e o valor', () => {
  const f = fixture({ config: (c) => { c.niveis.rapido.model = 'gpt-4'; } });
  const r = check(f);
  assert.equal(r.status, 1);
  assert.ok(lines(r.stderr).some((l) => l.includes('rapido') && l.includes('gpt-4')), r.stderr);
});

test('problema: effort fora dos valores aceitos cita o nível e o valor', () => {
  const f = fixture({ config: (c) => { c.niveis.padrao.effort = 'ultra'; } });
  const r = check(f);
  assert.equal(r.status, 1);
  assert.ok(lines(r.stderr).some((l) => l.includes('padrao') && l.includes('ultra')), r.stderr);
});

test('problema: nativo cujo nível tem model inherit cita o nativo e o nível', () => {
  const f = fixture({ config: (c) => { c.niveis.heredado = { model: 'inherit', effort: 'low' }; c.nativos.Plan = 'heredado'; } });
  const r = check(f);
  assert.equal(r.status, 1);
  assert.ok(lines(r.stderr).some((l) => l.includes('Plan') && l.includes('heredado')), r.stderr);
});

test('problema: nativo cujo nível tem model com ID claude-* (não é alias) cita o nativo e o nível', () => {
  const f = fixture({ config: (c) => { c.niveis.fixo = { model: 'claude-opus-4-1', effort: 'low' }; c.nativos.Explore = 'fixo'; } });
  const r = check(f);
  assert.equal(r.status, 1);
  assert.ok(lines(r.stderr).some((l) => l.includes('Explore') && l.includes('fixo')), r.stderr);
});

test('problema: orquestrador que não é um nível cita a chave e o valor', () => {
  const f = fixture({ config: (c) => { c.orquestrador = 'nenhum-nivel'; } });
  const r = check(f);
  assert.equal(r.status, 1);
  assert.ok(lines(r.stderr).some((l) => l.includes('orquestrador') && l.includes('nenhum-nivel')), r.stderr);
});

test('problema: conselheiro que não é alias nem null cita a chave e o valor', () => {
  const f = fixture({ config: (c) => { c.conselheiro = 'gpt-5'; } });
  const r = check(f);
  assert.equal(r.status, 1);
  assert.ok(lines(r.stderr).some((l) => l.includes('conselheiro') && l.includes('gpt-5')), r.stderr);
});

test('problema: conselheiro com ID completo (não é alias) também é recusado', () => {
  const f = fixture({ config: (c) => { c.conselheiro = 'claude-opus-4-1'; } });
  const r = check(f);
  assert.equal(r.status, 1);
  assert.ok(lines(r.stderr).some((l) => l.includes('conselheiro') && l.includes('claude-opus-4-1')), r.stderr);
});

test('problema: advisorModel do settings diferente de conselheiro cita o valor encontrado e o esperado', () => {
  const f = fixture({ settings: { ...SETTINGS_BASE(), advisorModel: 'opus' } });
  const r = check(f);
  assert.equal(r.status, 1);
  const linha = lines(r.stderr).find((l) => l.includes('advisorModel'));
  assert.ok(linha, r.stderr);
  assert.match(linha, /opus/);
  assert.match(linha, /fable/);
});

test('problema: JSON de roteamento ausente cita o arquivo e sai 1', () => {
  const f = fixture();
  rmSync(path.join(f.root, ROUTING));
  const r = check(f);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /model-routing\.json/);
});

test('problema: JSON de roteamento inválido cita o arquivo e sai 1', () => {
  const f = fixture();
  f.write(ROUTING, '{ isto não é json');
  const r = check(f);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /model-routing\.json/);
});

test('cada problema sai em uma linha própria do stderr', () => {
  const f = fixture({ config: (c) => { c.agents.fantasma = 'padrao'; } });
  removeAgentFile(f, 'fantasma');
  f.write(agentPath('orfao'), agentText('orfao', { model: 'sonnet', effort: 'medium' }));
  const r = check(f);
  assert.equal(r.status, 1);
  assert.equal(lines(r.stderr).filter((l) => l.includes('fantasma')).length, 1);
  assert.equal(lines(r.stderr).filter((l) => l.includes('orfao')).length, 1);
  assert.ok(!lines(r.stderr).some((l) => l.includes('fantasma') && l.includes('orfao')));
});

// --- casos que a primeira versão da spec deixava em aberto (decididos na implementação) --

test('model: e effort: ausentes do frontmatter são divergência: o check cita o agent, "ausente" e o esperado', () => {
  const f = fixture();
  f.write(agentPath('finder'), agentText('finder', {}));
  const r = check(f);
  assert.equal(r.status, 1);
  const doAgent = lines(r.stderr).filter((l) => l.includes('finder'));
  assert.equal(doAgent.length, 2, r.stderr);
  assert.ok(doAgent.some((l) => l.includes('model') && l.includes('ausente') && l.includes('haiku')), r.stderr);
  assert.ok(doAgent.some((l) => l.includes('effort') && l.includes('ausente') && l.includes('low')), r.stderr);
});

test('advisorModel ausente com conselheiro definido é divergência, e presente com conselheiro null também', () => {
  const semChave = check(fixture({ settings: SETTINGS_BASE() }));
  assert.equal(semChave.status, 1);
  assert.ok(lines(semChave.stderr).some((l) => l.includes('advisorModel') && l.includes('ausente') && l.includes('fable')), semChave.stderr);

  const sobrando = check(fixture({ config: (c) => { c.conselheiro = null; }, settings: { ...SETTINGS_BASE(), advisorModel: 'opus' } }));
  assert.equal(sobrando.status, 1);
  assert.ok(lines(sobrando.stderr).some((l) => l.includes('advisorModel') && l.includes('opus') && l.includes('ausente')), sobrando.stderr);
});

test('settings.json ausente: com conselheiro definido o check sai com 1 citando o arquivo', () => {
  const r = check(fixture({ settings: null }));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /settings\.json/);
});

test('settings.json ausente com conselheiro null não é problema, e o apply não cria o arquivo', () => {
  const f = fixture({ config: (c) => { c.conselheiro = null; }, settings: null, unsynced: true });
  assert.equal(apply(f).status, 0);
  assert.ok(!existsSync(path.join(f.root, SETTINGS)), 'o apply criou um settings.json que não existia');
  assert.equal(check(f).status, 0);
});

test('conselheiro haiku é recusado: o Claude Code não aceita esse alias como conselheiro', () => {
  const r = check(fixture({ config: (c) => { c.conselheiro = 'haiku'; } }));
  assert.equal(r.status, 1);
  assert.ok(lines(r.stderr).some((l) => l.includes('conselheiro') && l.includes('haiku')), r.stderr);
});

test('frontmatter que abre e nunca fecha conta como sem frontmatter: o check cita o arquivo e o apply não escreve', () => {
  const f = fixture({ unsynced: true });
  f.write(agentPath('finder'), '---\nname: finder\nmodel: opus\n\nCorpo sem a linha que fecha.\n');
  const antes = snapshot(f.root);
  const r = check(f);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /finder\.md/);
  assert.equal(apply(f).status, 1);
  assert.deepEqual(snapshot(f.root), antes);
});

test('frontmatter sem name: o check cita o arquivo', () => {
  const f = fixture();
  f.write(agentPath('finder'), '---\ndescription: d\nmodel: haiku\neffort: low\n---\nCorpo\n');
  const r = check(f);
  assert.equal(r.status, 1);
  assert.ok(lines(r.stderr).some((l) => l.includes('finder.md') && l.includes('name')), r.stderr);
});

test('o agent é identificado pelo name: do frontmatter, não pelo nome do arquivo', () => {
  const f = fixture();
  rmSync(path.join(f.root, agentPath('finder')));
  f.write(agentPath('outro-arquivo'), agentText('finder', { model: 'haiku', effort: 'low' }));
  const r = check(f);
  assert.equal(r.status, 0, r.stderr);
});

test('apply reescreve o settings.json no formato que ele já tinha: recuo de 4 espaços e sem quebra final', () => {
  const original = JSON.stringify(SETTINGS_BASE(), null, 4);
  const f = fixture({ settings: original });
  assert.equal(apply(f).status, 0);
  const esperado = JSON.stringify({ ...SETTINGS_BASE(), advisorModel: 'fable' }, null, 4);
  assert.equal(f.read(SETTINGS).toString('utf8'), esperado);
});

test('--root sem valor, ou seguido de outra flag, sai com 2 e não escreve nada', () => {
  const f = fixture({ unsynced: true });
  const antes = snapshot(f.root);
  assert.equal(run(['apply', '--root'], { cwd: f.root }).status, 2);
  assert.equal(run(['apply', '--root', '--outra'], { cwd: f.root }).status, 2);
  assert.equal(run(['apply', '--desconhecida'], { cwd: f.root }).status, 2);
  assert.deepEqual(snapshot(f.root), antes);
});

// --- estados em que o portão lia verde sem estar (achados da revisão) -------------------

test('chamado por um caminho com link simbólico, o script roda de verdade em vez de sair com 0 calado', () => {
  // Arrange: o diretório do script alcançado por um link, como num worktree ou em /tmp no macOS
  const f = fixture({ unsynced: true });
  const linkDir = path.join(f.root, 'link-para-o-script');
  symlinkSync(path.dirname(SCRIPT), linkDir, 'dir');
  // Act
  const r = run(['check', '--root', f.root], { script: path.join(linkDir, 'model-routing.mjs') });
  // Assert
  assert.equal(r.status, 1, 'raiz fora de sincronia tem de sair com 1');
  assert.match(r.stdout, /model-routing check/);
});

test('model: repetido no frontmatter é problema: o agent rodaria com a última ocorrência', () => {
  const f = fixture();
  f.write(agentPath('finder'), '---\nname: finder\nmodel: haiku\neffort: low\nmodel: opus\n---\nBusca.\n');
  const antes = snapshot(f.root);
  const r = check(f);
  assert.equal(r.status, 1, r.stdout);
  assert.ok(lines(r.stderr).some((l) => l.includes('finder.md') && l.includes('model')), r.stderr);
  assert.equal(apply(f).status, 1);
  assert.deepEqual(snapshot(f.root), antes);
});

test('model:valor sem espaço depois dos dois-pontos é problema: em YAML isso não é uma chave', () => {
  const f = fixture();
  f.write(agentPath('finder'), '---\nname: finder\nmodel:haiku\neffort:low\n---\nBusca.\n');
  const antes = snapshot(f.root);
  const r = check(f);
  assert.equal(r.status, 1, r.stdout);
  assert.ok(lines(r.stderr).some((l) => l.includes('finder.md') && l.includes('model:haiku')), r.stderr);
  assert.equal(apply(f).status, 1);
  assert.deepEqual(snapshot(f.root), antes);
});

test('linha --- com espaço no fim não fecha o frontmatter: o check cita o arquivo', () => {
  const f = fixture();
  f.write(agentPath('finder'), '---\nname: finder\n--- \nmodel: haiku\neffort: low\n---\nBusca.\n');
  const r = check(f);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stderr, /finder\.md/);
});

test('agent em subdiretório é visto: sem nível é problema, com nível é conferido e o apply o alcança', () => {
  // Arrange
  const f = fixture();
  f.write('.claude/agents/time/aninhado.md', agentText('aninhado', { model: 'opus', effort: 'max' }));
  // Act + Assert: sem entrada em agents
  const semNivel = check(f);
  assert.equal(semNivel.status, 1, semNivel.stdout);
  assert.match(semNivel.stderr, /aninhado/);
  // Act + Assert: com entrada, o apply escreve no arquivo aninhado
  const cfg = f.json(ROUTING);
  cfg.agents.aninhado = 'rapido';
  f.write(ROUTING, JSON.stringify(cfg, null, 2) + '\n');
  assert.equal(check(f).status, 1, 'frontmatter aninhado ainda diverge');
  const r = apply(f);
  assert.equal(r.status, 0, r.stderr);
  assert.match(f.read('.claude/agents/time/aninhado.md').toString('utf8'), /^model: haiku$/m);
  assert.equal(check(f).status, 0);
});

test('agent atrás de um link simbólico para diretório e agent com extensão .MD também são vistos', () => {
  const f = fixture();
  f.write('fora/escondido.md', agentText('escondido', { model: 'opus', effort: 'max' }));
  symlinkSync(path.join(f.root, 'fora'), path.join(f.root, '.claude/agents/lnk'), 'dir');
  f.write('.claude/agents/GRITO.MD', agentText('grito', { model: 'opus', effort: 'max' }));
  const r = check(f);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stderr, /escondido/);
  assert.match(r.stderr, /grito/);
});

test('o mesmo name: em dois arquivos é problema, mesmo com model e effort iguais', () => {
  const f = fixture();
  f.write(agentPath('copia'), agentText('finder', { model: 'haiku', effort: 'low' }));
  const r = check(f);
  assert.equal(r.status, 1, r.stdout);
  assert.ok(lines(r.stderr).some((l) => l.includes('finder.md') && l.includes('copia.md')), r.stderr);
});

const PROTOTYPE_CASES = [
  ['agent com nível herdado de Object.prototype', (c) => { c.agents.planner = 'toString'; }, 'planner'],
  ['nativo com nível herdado de Object.prototype', (c) => { c.nativos.Plan = 'constructor'; }, 'Plan'],
  ['orquestrador herdado de Object.prototype', (c) => { c.orquestrador = 'hasOwnProperty'; }, 'orquestrador'],
  ['nível de agent que não é texto', (c) => { c.agents.planner = ['fronteira']; }, 'planner'],
  ['nível de agent null', (c) => { c.agents.planner = null; }, 'planner'],
];

for (const [nome, config, citado] of PROTOTYPE_CASES) {
  test(`${nome}: check sai com 1 e o apply não escreve model: undefined`, () => {
    const f = fixture({ config, unsynced: true });
    const antes = snapshot(f.root);
    const r = check(f);
    assert.equal(r.status, 1, r.stdout);
    assert.ok(r.stderr.includes(citado), r.stderr);
    assert.equal(apply(f).status, 1);
    assert.deepEqual(snapshot(f.root), antes);
  });
}

test('agent chamado constructor sem entrada em agents não escapa: falta o nível', () => {
  const f = fixture();
  f.write(agentPath('constructor'), agentText('constructor', { model: 'haiku', effort: 'low' }));
  const r = check(f);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stderr, /constructor/);
});

test('name: com acento casa com a chave do arquivo de roteamento', () => {
  const f = fixture({ config: (c) => { c.agents['revisão'] = 'rapido'; } });
  const r = check(f);
  assert.equal(r.status, 0, r.stderr);
});

// Each pattern asks for the error code next to the path: a swallowed read error also produces a message that
// cites the path ("ausente", "não tem arquivo"), and would pass a test that only looks for the path.
const UNREADABLE_CASES = [
  ['model-routing.json é um diretório', (f) => { rmSync(path.join(f.root, ROUTING)); mkdirSync(path.join(f.root, ROUTING)); }, /^\.claude\/model-routing\.json: .*EISDIR/m],
  ['settings.json é um diretório', (f) => { rmSync(path.join(f.root, SETTINGS)); mkdirSync(path.join(f.root, SETTINGS)); }, /^\.claude\/settings\.json: .*EISDIR/m],
  ['.claude/agents é um arquivo', (f) => { rmSync(path.join(f.root, '.claude/agents'), { recursive: true }); f.write('.claude/agents', 'não sou diretório\n'); }, /^\.claude\/agents: .*ENOTDIR/m],
  ['link simbólico quebrado no lugar de um agent', (f) => { symlinkSync(path.join(f.root, 'nao-existe.md'), path.join(f.root, agentPath('quebrado'))); }, /^\.claude\/agents\/quebrado\.md: .*ENOENT/m],
];

for (const [nome, estraga, cita] of UNREADABLE_CASES) {
  test(`${nome}: check e apply respondem com problema e código 1, sem stack trace e sem escrever`, () => {
    const f = fixture({ unsynced: true });
    estraga(f);
    const r = check(f);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stderr, cita);
    const antes = existsSync(path.join(f.root, agentPath('planner'))) ? f.read(agentPath('planner')) : null;
    assert.equal(apply(f).status, 1);
    if (antes) assert.ok(f.read(agentPath('planner')).equals(antes), 'o apply escreveu apesar do problema');
  });
}

test('um diretório vazio chamado x.md dentro de agents não é agent nem quebra o script', () => {
  const f = fixture();
  mkdirSync(path.join(f.root, '.claude/agents/pasta.md'));
  assert.equal(check(f).status, 0);
});

test('settings.json fora do formato do JSON.stringify: o apply recusa em vez de reescrever o arquivo inteiro', () => {
  // Arrange: array numa linha só e inteiro que perderia precisão ao passar por JSON.parse
  const original = '{\n  "permissions": { "allow": ["a", "b"] },\n  "grande": 12345678901234567890\n}\n';
  const f = fixture({ settings: original, unsynced: true });
  const antes = snapshot(f.root);
  // Act
  const r = apply(f);
  // Assert
  assert.equal(r.status, 1, r.stdout);
  assert.ok(lines(r.stderr).some((l) => l.includes('settings.json') && l.includes('advisorModel')), r.stderr);
  assert.deepEqual(snapshot(f.root), antes);
});

test('settings.json fora do formato, mas com advisorModel já certo, não é problema e não é reescrito', () => {
  const original = '{\n  "permissions": { "allow": ["a", "b"] },\n  "advisorModel": "fable"\n}\n';
  const f = fixture({ settings: original, unsynced: true });
  assert.equal(apply(f).status, 0);
  assert.equal(f.read(SETTINGS).toString('utf8'), original);
  assert.equal(check(f).status, 0);
});

test('arquivo de agent sem permissão de escrita: o apply recusa antes de escrever qualquer arquivo', (t) => {
  // root ignora o bit de permissão: sem como montar o caso, o teste não prova nada.
  if (process.getuid?.() === 0) return t.skip('rodando como root');
  // Arrange: writer é o último agent em ordem alfabética; os anteriores seriam escritos antes da falha
  const f = fixture({ unsynced: true });
  chmodSync(path.join(f.root, agentPath('writer')), 0o444);
  const antes = snapshot(f.root);
  // Act
  const r = apply(f);
  // Assert
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stderr, /writer\.md/);
  assert.deepEqual(snapshot(f.root), antes);
});

// --- linha de comando: códigos de saída e --root ------------------------------------

test('sem subcomando sai com 2, imprime a linha de uso e não escreve nada', () => {
  const f = fixture({ unsynced: true });
  const antes = snapshot(f.root);
  const r = run(['--root', f.root]);
  assert.equal(r.status, 2);
  const saida = r.stdout + r.stderr;
  assert.match(saida, /check/);
  assert.match(saida, /apply/);
  assert.deepEqual(snapshot(f.root), antes);
});

test('subcomando desconhecido sai com 2, imprime a linha de uso e não escreve nada', () => {
  const f = fixture({ unsynced: true });
  const antes = snapshot(f.root);
  const r = run(['frobnicate', '--root', f.root]);
  assert.equal(r.status, 2);
  const saida = r.stdout + r.stderr;
  assert.match(saida, /check/);
  assert.match(saida, /apply/);
  assert.deepEqual(snapshot(f.root), antes);
});

test('sem --root o script usa o diretório atual como raiz', () => {
  const ok = fixture();
  assert.equal(run(['check'], { cwd: ok.root }).status, 0);
  const ruim = fixture({ unsynced: true });
  const antes = snapshot(ruim.root);
  assert.equal(run(['check'], { cwd: ruim.root }).status, 1);
  assert.equal(run(['apply'], { cwd: ruim.root }).status, 0);
  assert.notDeepEqual(snapshot(ruim.root), antes);
  assert.equal(run(['check'], { cwd: ruim.root }).status, 0);
});

test('apply em raiz fora de sincronia sai com 0, lista os arquivos alterados e deixa o check verde', () => {
  const f = fixture({ unsynced: true, settings: SETTINGS_BASE() });
  const r = apply(f);
  assert.equal(r.status, 0, r.stderr);
  for (const nome of Object.keys(f.cfg.agents)) assert.ok(r.stdout.includes(`${nome}.md`), `${nome}.md não listado`);
  assert.equal(check(f).status, 0);
});

// --- Guarda de entrada: importado não roda, nem quando a linha de comando aponta para um caminho que não existe ---
import { spawnSync as entrySpawn } from 'node:child_process';
import entryPath from 'node:path';
import { fileURLToPath as entryFileURLToPath, pathToFileURL as entryPathToFileURL } from 'node:url';

test('model-routing.mjs só importado, com a linha de comando apontando para um caminho que não existe, não roda', () => {
  // `node -e`, `node -` e um glob no `--test` deixam em process.argv[1] algo que não é arquivo.
  const url = entryPathToFileURL(entryPath.join(entryPath.dirname(entryFileURLToPath(import.meta.url)), 'model-routing.mjs')).href;
  const code = `import(${JSON.stringify(url)}).then(() => process.stdout.write('RETORNOU'))`;
  const r = entrySpawn(process.execPath, ['-e', code, '/caminho/que/nao/existe.mjs'], { encoding: 'utf8', input: '', timeout: 20000 });
  assert.equal(r.stderr, '', 'o main() do módulo importado não pode ter escrito nada');
  assert.equal(r.stdout, 'RETORNOU', 'o import tem de voltar sem o main() encerrar o processo');
  assert.equal(r.status, 0);
});
