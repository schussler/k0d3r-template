---
conferido-em: 2026-11-11
---

# Guarda de entrada dos scripts do toolset

## Problema e objetivo

Quatro scripts do toolset decidem se foram chamados direto (e então rodam) ou importados por outro módulo (e
então não rodam) comparando o caminho do próprio arquivo com o caminho que a linha de comando passou. O primeiro
lado vem com o caminho real; o segundo, não. Chamados por um caminho que passa por um link simbólico, os quatro
**saem com 0 sem rodar nada**:

| Script | Guarda hoje | Efeito da falha |
| --- | --- | --- |
| `scripts/docs-check/docs-check.mjs` | `fileURLToPath(import.meta.url) === path.resolve(process.argv[1])` | o portão de docs lê verde sem rodar |
| `scripts/ecc-sync/report.mjs` | a mesma | o relatório do sync não sai, sem erro |
| `scripts/hooks/guard-shell.mjs` | `import.meta.url === pathToFileURL(process.argv[1]).href` | o hook libera tudo: um `rm -rf` passa |
| `scripts/hooks/toolset-staleness.mjs` | a mesma | o aviso de abertura some |

Um caminho com link é comum: um projeto em `/tmp` (no macOS, link para `/private/tmp`), um worktree num
diretório linkado, um volume montado. O objetivo é que os quatro rodem por qualquer caminho que leve a eles.

O `scripts/model-routing/model-routing.mjs` tinha o mesmo defeito e já foi corrigido
([`roteamento-de-modelos.md`](roteamento-de-modelos.md), seção "O portão falha
fechado").

## Comportamento atual e evidências

Reproduzido em 2026-11-11, com um link para `scripts/` dentro de um diretório temporário:

| Chamada | Caminho real | Pelo link |
| --- | --- | --- |
| `docs-check.mjs frobnicate` | código 2, linha de uso | código 0, sem saída |
| `report.mjs report --ecc <diretório sem .git>` | código 1, `[ecc-sync] Not a git repo` | código 0, sem saída |
| `guard-shell.mjs` com um `rm -rf` no stdin | código 2, `[guard-shell:destructive]` | código 0, sem saída |
| `toolset-staleness.mjs` com manifest velho | código 0, linha `[toolset] último sync com o ECC há …` | código 0, sem saída |

Conferido e fora do defeito:

- **Caminho com caixa trocada** (o APFS do macOS não diferencia caixa): os scripts rodam. O carregador de módulos
  do Node mantém a caixa que recebeu, e ela bate com a da linha de comando.
- **`scripts/hooks/suggest-compact.js`**: não tem guarda, chama `main()` sempre, e roda pelo link.

Num hook `PreToolUse`, só o código de saída 2 bloqueia o comando; 0, 1, uma exceção ou um timeout deixam o
comando seguir (documentação de hooks do Claude Code, lida em 2026-11-11). Por isso a guarda do `guard-shell` não
pode sair com 0 nem quebrar.

## Comportamento desejado

- Cada um dos quatro scripts compara o **caminho real** dos dois lados: o do arquivo e o da linha de comando.
  Chamado por qualquer caminho que leve a ele, link ou não, o script roda; importado por outro módulo, não roda.
- **Se o caminho real do próprio arquivo não puder ser lido**, o script **roda**. Para os hooks, que o Claude
  Code só chama como programa, rodar é o lado seguro: um `guard-shell` que não roda libera o comando.
- **Se o caminho da linha de comando não existir** (`node -e`, `node -`, um glob no `--test`), quem rodou como
  programa foi outro, e o script, só importado, **não roda**. Um hook chamado pelo Claude Code nunca cai aqui: o
  caminho dele sempre existe.
- A comparação fica escrita no próprio arquivo de cada script, sem módulo compartilhado: o `guard-shell` importa
  só módulos do Node, e um import a mais é mais um jeito de ele quebrar antes de avaliar o comando.
- O `model-routing.mjs` passa a ter a mesma forma, com o mesmo comportamento quando a comparação não pode ser
  feita, para os cinco scripts terem uma guarda só.

## Escopo e limites

- **Dentro:** a guarda de entrada dos quatro scripts, o alinhamento da guarda do `model-routing.mjs`, os testes,
  a linha do backlog.
- **Fora:** qualquer outra mudança nesses scripts; o `suggest-compact.js`; o `onFailure: "block"` (abaixo).

## Contratos e documentos afetados

| Arquivo | Mudança |
| --- | --- |
| os quatro scripts e o `model-routing.mjs` | a guarda de entrada |
| `docs-check.test.mjs`, `report.test.mjs`, `guard-shell.test.mjs`, `toolset-staleness.test.mjs` | um teste cada, que chama o script por um link |
| [`toolset-backlog.md`](../../planned/processo/toolset-backlog.md) | sai a linha "Scripts e hooks não rodam quando chamados por um caminho com link simbólico" |
| [`verificacao-de-docs.md`](../../implemented/processo/verificacao-de-docs.md), [`ecc-sync.md`](../../implemented/processo/ecc-sync.md) | conferidos: citam `docs-check.mjs` e `report.mjs`; nenhum descreve a guarda |

## Critérios de aceite

Em todos, "pelo link" quer dizer: o script chamado com `node <link>/<caminho do script>`, onde `<link>` é um link
simbólico para o diretório `scripts/` do repositório, criado num diretório temporário.

1. **docs-check:** `docs-check.mjs frobnicate` pelo link sai com código 2 e escreve no stderr a linha de uso, que
   começa com `Usage: docs-check.mjs`.
2. **report:** `report.mjs report --ecc <diretório temporário sem .git>` pelo link sai com código 1 e escreve no
   stderr `[ecc-sync] Not a git repo`.
3. **guard-shell:** com `{"tool_name":"Bash","tool_input":{"command":"rm -rf /tmp/x"}}` no stdin, o
   `guard-shell.mjs` pelo link sai com código 2 e escreve no stderr `[guard-shell:destructive]`.
4. **toolset-staleness:** com `CLAUDE_PROJECT_DIR` apontando para um diretório cujo
   `.claude/ecc-sync/manifest.json` tem `"syncedAt": "2020-01-01"` e `"syncStaleDays": 30`, o
   `toolset-staleness.mjs` pelo link sai com código 0 e escreve no stdout uma linha que começa com
   `[toolset] último sync com o ECC há`.
5. **Controle:** as quatro chamadas acima, pelo caminho real, dão o mesmo código de saída e o mesmo texto.
6. **Importar não roda:** os testes que importam funções desses scripts (`evaluate` do `guard-shell`,
   `staleCounts` e as outras do `docs-check`, as do `report` e do `toolset-staleness`) continuam passando, sem
   ficar esperando stdin e sem sair no meio.
7. **Guarda única:** os cinco scripts (os quatro e o `model-routing.mjs`) comparam o caminho real dos dois lados;
   se o do próprio arquivo não puder ser lido, rodam; se o da linha de comando não existir, não rodam.
9. **Importado com um caminho inexistente não roda:** `node -e "import('<url do script>').then(() =>
   process.stdout.write('RETORNOU'))" /caminho/que/nao/existe.mjs` sai com código 0, escreve só `RETORNOU` no
   stdout e nada no stderr, para cada um dos cinco scripts.
8. A linha do backlog saiu, e todos os portões do `CLAUDE.md` saem com código 0.

## Estratégia de testes e verificação

- Os testes dos critérios 1 a 5 ficam no arquivo de teste de cada script e criam o link num diretório
  temporário. Os do critério 3 passam o payload por stdin, nunca na linha de comando: o `guard-shell` desta
  sessão bloqueia um comando cujo texto tenha `rm -rf`.
- O critério 6 é provado pelos testes que já existem.
- O critério 9 tem um teste em cada um dos cinco arquivos de teste.
- O ramo "o caminho do próprio arquivo não pode ser lido" é conferido **só por leitura**: o caminho real do
  script em execução sempre pode ser lido, e não achei um estado real que provoque a falha.

## Plano

Uma fatia só: testes do `test-author` → guarda nos cinco scripts → backlog e conferência dos dois docs → commit.

- [x] Testes do `test-author`: quatro, um por arquivo de teste, cada um com o controle pelo caminho real. Os quatro
      falharam antes da correção, pelo link (código 0, sem saída), com o controle passando.
- [x] Guarda nos cinco scripts, como a função `isEntrypoint` em cada arquivo. 171 testes passam.
- [x] Backlog: saiu a linha do link simbólico; entrou a do `onFailure: "block"`.
- [x] `verificacao-de-docs.md` e `ecc-sync.md` conferidos: nenhum descreve a guarda de entrada.

- [x] Revisão: o `acceptance-verifier` devolveu **falhou** no critério 7, e os dois revisores reproduziram o mesmo
      defeito. Com a regra "na dúvida, roda", um módulo só importado rodava o `main()` quando o caminho da linha de
      comando não existia; no `toolset-staleness`, o `docs-check` importado encerrava o processo com código 2. A
      pessoa decidiu dividir os dois lados (decisão abaixo). Os cinco testes do critério 9 falharam contra a
      guarda anterior e passam com a nova: 176 testes.
- [x] Fora da spec, feito nesta fatia: os imports sem uso (`mkdirSync`, `writeFileSync`) saíram de três testes de
      link; e a linha do backlog "Falta um executor da tabela de portões" perdeu a frase que citava o teste por
      link, que já existe.

Aprovado pela pessoa em 2026-11-11, com as duas decisões abaixo e a proposta do `onFailure` indo para o backlog.

## Riscos

- Um script que passe a rodar quando antes saía com 0 pode revelar outro defeito escondido atrás dele. Os quatro
  rodam hoje pelo caminho real, com testes, então o risco é baixo.

## Decisões

- **Sem módulo compartilhado** (proposta do agente): a guarda fica em cada arquivo. Por quê: o `guard-shell` não
  deve depender de outro arquivo para avaliar um comando. Rejeitado: um `scripts/lib/` com a função, importado
  pelos cinco.
- **Os dois lados da dúvida** (decisão da pessoa, 2026-11-11, que substitui "na dúvida, roda", aprovada antes
  no mesmo dia): se o caminho do próprio arquivo não puder ser lido, o script roda; se o da linha de comando não
  existir, não roda. Por quê: "na dúvida, roda" fazia um módulo só importado rodar, o que os três revisores
  reproduziram. Rejeitado: manter "na dúvida, roda" como limite conhecido; "na dúvida, não roda" nos dois lados
  (reabre o hook se o próprio arquivo ficar ilegível); deixar a exceção subir (código 1, que não bloqueia).

## Fora de escopo / questões em aberto

- **Proposta (agente), para o backlog:** pôr `"onFailure": "block"` no hook do `guard-shell` no
  `.claude/settings.json`. Hoje, se o `guard-shell` quebrar (exceção, timeout), o comando passa. Com essa chave, a
  falha bloqueia. Exige Claude Code v2.1.295 ou mais novo, e não sei o que uma versão mais velha faz com a chave.
  Não corrige o defeito desta spec (aqui o script sai com 0, não falha); é outra camada.
