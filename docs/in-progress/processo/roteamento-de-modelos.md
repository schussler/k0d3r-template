---
conferido-em: 2026-11-11
---

# Roteamento de modelo e esforço dos agents

> Spec 1 de 2 desta mudança. A spec 2 é [`tarefa-autonoma.md`](tarefa-autonoma.md), que depende desta: os
> dois agents novos de lá recebem nível aqui.

## Propósito

Um arquivo só decide em qual modelo e com qual esforço cada agent roda. Quando a Anthropic lança ou aposenta
um modelo, a pessoa troca poucas linhas nesse arquivo, roda um comando, e todos os agents acompanham.

## Comportamento atual e evidências

- Nenhum arquivo de `.claude/agents/` tem `model:` ou `effort:` no frontmatter (busca em `.claude/agents`,
  `.claude/commands` e `.claude/skills`). As 13 notas `adaptation` do
  [`manifest.json`](../../../.claude/ecc-sync/manifest.json) registram "Removido o `model:` fixo do frontmatter;
  o modelo é herdado da sessão".
- Sem esses campos, o Claude Code resolve o modelo do subagent nesta ordem: parâmetro `model` da chamada,
  `model:` do frontmatter, variável `CLAUDE_CODE_SUBAGENT_MODEL`, modelo da conversa principal (documentação
  do Claude Code, página de subagents, lida em 2026-11-11). Hoje, portanto, todo agent roda no modelo e no
  esforço da sessão: uma busca de documentação custa o mesmo que um plano de arquitetura.
- A única orientação de escolha de modelo é a seção "Model Selection Strategy" do
  [`performance.md`](../../../.claude/rules/common/performance.md), que descreve Haiku, Sonnet e Opus com
  números de uma geração anterior e não é aplicada por nada.
- O `/sync-ecc-tools --adopt` manda remover o "model pin" de todo agent adotado
  ([`sync-ecc-tools.md`](../../../.claude/commands/sync-ecc-tools.md)).

## Formato dos dados

Fonte única: `.claude/model-routing.json`.

```json
{
  "niveis": {
    "fronteira":  { "model": "fable",  "effort": "high" },
    "raciocinio": { "model": "opus",   "effort": "high" },
    "padrao":     { "model": "sonnet", "effort": "medium" },
    "rapido":     { "model": "haiku",  "effort": "low" }
  },
  "orquestrador": "fronteira",
  "conselheiro": "fable",
  "agents": {
    "planner": "fronteira",
    "architect": "fronteira",
    "code-architect": "raciocinio",
    "security-reviewer": "raciocinio",
    "acceptance-verifier": "raciocinio",
    "code-reviewer": "padrao",
    "silent-failure-hunter": "padrao",
    "code-simplifier": "padrao",
    "type-design-analyzer": "padrao",
    "pr-test-analyzer": "padrao",
    "refactor-cleaner": "padrao",
    "doc-updater": "padrao",
    "tdd-guide": "padrao",
    "test-author": "padrao",
    "docs-lookup": "rapido"
  },
  "nativos": {
    "Plan": "fronteira",
    "general-purpose": "padrao",
    "Explore": "rapido"
  }
}
```

- `niveis`: nome do nível → `model` e `effort`. `model` aceita um alias (`fable`, `opus`, `sonnet`, `haiku`),
  `inherit` ou um ID completo que começa com `claude-`. `effort` aceita `low`, `medium`, `high`, `xhigh`, `max`.
- `orquestrador`: o nível recomendado para a **sessão principal** que conduz uma tarefa com spec.
- `conselheiro`: o modelo que os outros consultam nos pontos de decisão (o recurso advisor do Claude Code), ou
  `null` para desligar.
- `agents`: nome do agent (o `name:` do frontmatter) → nível. Cobre **todos** os arquivos de `.claude/agents/`.
- `nativos`: subagents que não têm arquivo no repositório → nível. O nível usado aqui precisa ter um alias em
  `model`, porque o parâmetro `model` da chamada de agent só aceita alias.
- Os valores acima são os padrões do template (postura "equilibrado", com o Fable onde ele é pertinente).

Derivado, não é fonte: as linhas `model:` e `effort:` do frontmatter de cada agent e a chave `advisorModel`
do `.claude/settings.json`, escritas pelo script.

## Onde o Fable 5.2 entra

O critério vem das fontes. O artigo de lançamento reserva o Fable para "the most ambitious, open-ended
technical work" e descreve dois papéis: orquestrador que delega o mais simples a modelos menores, e conselheiro
que os modelos menores consultam nos problemas difíceis. O guia de prompts relata bons resultados com ele como
"planner and orchestrator for other models". A documentação do Claude Code descreve o alias `fable` como o
modelo para "your hardest and longest-running tasks".

| Papel | Onde | Como vira comportamento |
| --- | --- | --- |
| **Orquestrador** | A sessão que conduz uma `/k0d3r-task` com spec | Recomendação, não imposição: a `/k0d3r-task` compara o modelo da sessão com o nível `orquestrador` e, se for outro, diz em uma linha qual é o recomendado e como trocar (`/model`, `/effort`). Depois segue. |
| **Planejamento aberto** | `planner`, `architect` e o nativo `Plan`, no nível `fronteira` | Frontmatter, pelo `apply`. |
| **Conselheiro** | Sessão e agents em Opus, Sonnet ou Haiku consultam o Fable antes de fechar uma abordagem, num erro que se repete e antes de declarar pronto | `advisorModel` no `.claude/settings.json`, escrito pelo `apply` a partir de `conselheiro`. Os subagents herdam o conselheiro da sessão. |
| **Escalada** | Um agent de `raciocinio` que não achou a causa, ou que falhou duas vezes na mesma coisa | A rule manda refazer a chamada no nível `fronteira` e dizer isso na entrega. |

Onde o Fable **não** entra: revisão de diff, escrita de testes, atualização de docs e busca. São tarefas bem
especificadas, que o artigo manda para Opus, Sonnet ou Haiku conforme o tamanho.

**Por que a sessão não é fixada em Fable.** A chave `model` do `.claude/settings.json` do projeto fixaria o
Fable em toda sessão, inclusive nas de typo e de dependência. O `model:` do frontmatter de um command vale só
até o fim do turno em que ele foi chamado, e a `/k0d3r-task` atravessa vários turnos. Sobra a recomendação com
aviso.

**Limites do conselheiro.** O advisor é experimental. Exige a API da Anthropic ou a Claude Platform on AWS,
acesso ao Fable e, em alguns planos, um consentimento de cobrança em créditos. Quando alguma dessas condições
falta, o Claude Code envia as requisições sem conselheiro e a sessão continua. A referência de settings do
Claude Code (lida em 2026-11-11) dá à chave `advisorModel` o escopo "Any file", que inclui o settings do
projeto; o `/advisor` grava a escolha da pessoa nas settings do usuário. O que a documentação não garante é o
resultado em cada máquina: por isso o critério 14 pede a conferência numa sessão real, e o plano B é tirar o
`conselheiro` do `apply` e deixá-lo como passo do checklist do `README.md` (`/advisor fable`).

## Comportamento e fluxos

Script `scripts/model-routing/model-routing.mjs`, Node puro, com dois subcomandos.

**Linha de comando.** `node scripts/model-routing/model-routing.mjs <check|apply> [--root <dir>]`. `--root` é
a raiz do repositório a conferir (padrão: o diretório atual); sob ela o script lê `.claude/model-routing.json`,
`.claude/agents/*.md` e `.claude/settings.json`. Os problemas saem no stderr, um por linha; o resumo e a lista
de arquivos alterados saem no stdout. Códigos de saída: 0 em dia ou aplicado, 1 com problema, 2 para subcomando
ausente ou desconhecido (com a linha de uso).

**`check`** (portão; não escreve nada). Sai com 0 quando tudo bate. Sai com 1 e uma linha por problema quando:

| Problema | Mensagem diz |
| --- | --- |
| Arquivo de agent sem entrada em `agents` | o nome do agent e que falta o nível |
| Entrada em `agents` sem arquivo | o nome sem arquivo |
| `model:` ou `effort:` do frontmatter diferente do nível | o agent, o valor encontrado e o esperado |
| Nível citado que não existe em `niveis` | o agent ou nativo e o nível |
| `model` ou `effort` fora dos valores aceitos | o nível e o valor |
| Nível de um `nativos` cujo `model` não é alias | o nativo e o nível |
| `orquestrador` que não é um nível, ou `conselheiro` que não é alias nem `null` | a chave e o valor |
| `advisorModel` do `.claude/settings.json` diferente de `conselheiro` | o valor encontrado e o esperado |
| JSON ausente ou inválido, ou agent sem frontmatter | o arquivo e o erro |

**`apply`** (escreve). Valida tudo primeiro, pelas mesmas regras do `check` menos a comparação de frontmatter.
Se a validação falha, sai com 1 **sem escrever arquivo nenhum**. Se passa, para cada agent troca as linhas
`model:` e `effort:` no lugar onde estão, ou as acrescenta no fim do frontmatter. O corpo do arquivo e os
outros campos ficam byte a byte iguais. No `.claude/settings.json`, grava só a chave `advisorModel` (ou a
remove, com `conselheiro: null`) e preserva o resto do arquivo. Rodar duas vezes não muda nada na segunda.
Imprime os arquivos alterados.

**Casos de borda** (a primeira versão desta spec não os dizia; o autor dos testes apontou as lacunas e eles
foram decididos na implementação, cada um com teste):

- O agent é identificado pelo `name:` do frontmatter, não pelo nome do arquivo. Frontmatter sem `name:` é
  problema, e frontmatter que abre e nunca fecha conta como "sem frontmatter".
- `model:` ou `effort:` ausente do frontmatter é divergência: o `check` diz "encontrado `ausente`".
- `advisorModel` ausente com `conselheiro` definido é divergência, e `advisorModel` presente com
  `conselheiro: null` também.
- `.claude/settings.json` ausente é problema quando `conselheiro` está definido, no `check` e no `apply`. Com
  `conselheiro: null` não é, e o `apply` não cria o arquivo.
- `conselheiro` aceita `fable`, `opus` e `sonnet`: são os alias que o Claude Code aceita como conselheiro.
- As linhas escritas têm a forma `model: <valor>` e `effort: <valor>`. Acrescentadas, entram nessa ordem, com o
  fim de linha do frontmatter; trocadas, mantêm o fim de linha que a linha já tinha.
- O `settings.json` é reescrito com o recuo e a quebra final que já tinha, e só quando o valor muda.
- `--root` sem valor ou seguido de outra flag, e opção desconhecida, saem com 2. A linha de uso sai no stderr.

**O portão falha fechado.** A revisão do script (um reviewer de código e um caçador de falhas silenciosas, os
dois reproduzindo em diretório temporário) achou estados em que o `check` saía com 0 sem o disco estar como o
arquivo manda. Cada um virou regra, com teste:

- **Caminho com link simbólico.** Chamado por um caminho que passa por um link (um worktree, `/tmp` no macOS),
  o script saía com 0 sem rodar nada. A guarda de entrada agora compara os dois lados pelo caminho real.
- **Agent que o script não enxergava.** O diretório de agents é percorrido com os subdiretórios e os links
  simbólicos para diretório, e a extensão `.MD` conta. O mesmo `name:` em dois arquivos é problema.
- **Frontmatter lido de um jeito e interpretado de outro.** `model:`, `effort:` ou `name:` repetido é problema
  (o agent rodaria com a última ocorrência). `model:sonnet`, sem espaço depois dos dois-pontos, é problema (em
  YAML não é uma chave). Uma linha `---` com espaço no fim não fecha o frontmatter: o arquivo conta como sem
  frontmatter válido.
- **Nome herdado de `Object.prototype`.** Um nível chamado `toString` passava por existente e o `apply` gravava
  `model: undefined`. Nível e nome de agent só valem como chave própria do objeto, e o nível tem de ser texto.
- **Arquivo ilegível.** Diretório no lugar de arquivo, link quebrado e erro de permissão viram uma linha de
  problema com o código do erro, em vez de exceção.
- **`settings.json` fora do formato do `JSON.stringify`.** Reescrevê-lo mudaria mais que a chave (array em uma
  linha, ordem das chaves, inteiro grande que perde precisão). Quando a chave precisa mudar e o arquivo não está
  nesse formato, o `apply` recusa e diz para ajustar `advisorModel` à mão. Com a chave já certa, não é problema.
- **Escrita pela metade.** O `apply` confere a permissão de escrita de todos os arquivos antes de escrever o
  primeiro. Se uma escrita falhar mesmo assim, ele sai com 1 e lista os escritos e os não escritos.
- **O `apply` relê o disco.** Depois de escrever, roda a mesma comparação do `check` e só sai com 0 se ela não
  achar nada. Esse caminho não tem teste: não achei um estado que o provoque sem alterar o script.
- **`name:` com acento** é comparado em UTF-8 com a chave do arquivo de roteamento.

**Fluxos de quem mantém:**

| Situação | O que fazer |
| --- | --- |
| Saiu modelo novo, ou a postura de custo mudou | editar `niveis` → `apply` → `check` → commit |
| Agent novo, local ou adotado do ECC | acrescentar em `agents` → `apply` |
| Um porte à mão do sync sobrescreveu o frontmatter | o `check` falha no portão → `apply` |
| Um agent precisa de outro nível | trocar o nível dele em `agents` → `apply` |

**Subagents nativos e chamadas avulsas.** Uma rule nova, `.claude/rules/common/model-routing.md`, manda a
sessão ler o JSON e passar `model` e `effort` do nível ao chamar um subagent de `nativos`. Ela não repete os
valores: aponta para o arquivo. Ela também traz a regra de escalada da seção anterior.

**O que vence o arquivo, fora do alcance do template.** `CLAUDE_CODE_SUBAGENT_MODEL` com
`CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` faz o Claude Code ignorar o `model:` do frontmatter;
`CLAUDE_CODE_EFFORT_LEVEL` vence o `effort:`; uma lista de modelos permitidos da organização troca o modelo
pedido por outro; e um `advisorModel` em `.claude/settings.local.json` ou nas settings do usuário (onde o
`/advisor` grava) vence o do projeto. O `check` não detecta nenhum dos quatro: ele confere o repositório, não a
máquina. A rule diz isso.

## Contratos e documentos afetados

| Arquivo | Mudança |
| --- | --- |
| `.claude/model-routing.json` | novo |
| `scripts/model-routing/model-routing.mjs` e `.test.mjs` | novos |
| `.claude/rules/common/model-routing.md` | nova, `local` no manifest |
| `.claude/agents/*.md` (13 hoje, 15 com a spec 2) | ganham `model:` e `effort:` pelo `apply` |
| `.claude/ecc-sync/manifest.json` | as 13 notas `adaptation` passam a dizer que `model:` e `effort:` vêm do roteamento; entrada da rule nova |
| `.claude/rules/common/performance.md` | "Model Selection Strategy" vira um ponteiro para a rule nova; nota `adaptation` atualizada |
| `.claude/commands/sync-ecc-tools.md` | na adoção, o "model pin" é trocado pelo nível em `agents` + `apply`, em vez de removido |
| `.claude/settings.json` | chave `advisorModel`, pelo `apply` |
| `.claude/commands/k0d3r-task.md` | a linha de aviso do modelo da sessão (o resto do command é da spec 2) |
| `CLAUDE.md` | linha nova na tabela de portões: `node scripts/model-routing/model-routing.mjs check` |
| `scripts/hooks/guard-shell.mjs` e `.test.mjs` | `model-routing` entra em `VERIFY_GATES` |
| `.claude/README.md`, `README.md` | inventário e lista de testes do toolset |
| [`ecc-sync.md`](../../implemented/processo/ecc-sync.md) | passo "depois de portar ou adotar um agent, `apply` e `check`" |

## Critérios de aceite

1. `node scripts/model-routing/model-routing.mjs check` sai com 0 no repositório.
2. Todo arquivo de `.claude/agents/` tem `model:` e `effort:` iguais aos do seu nível.
3. Trocar `model` de um nível e rodar `apply` muda o frontmatter de todos os agents daquele nível e de nenhum
   outro; o corpo de cada arquivo fica igual (comparado por bytes).
4. Um segundo `apply` seguido não altera arquivo nenhum.
5. Cada linha da tabela de problemas do `check` tem um teste que a provoca e confere o código de saída 1 e o
   nome do agent, nativo ou nível na mensagem.
6. Com um problema de validação presente, o `apply` sai com 1 e nenhum arquivo de agent muda.
7. `node --test scripts/model-routing/model-routing.test.mjs` sai com 0.
8. O `guard-shell` bloqueia `node scripts/model-routing/model-routing.mjs check | tail` (teste no
   `guard-shell.test.mjs`).
9. Nenhuma nota `adaptation` do manifest ainda diz "o modelo é herdado da sessão".
10. A busca por `Haiku` em `.claude/rules/` não acha a tabela antiga do `performance.md`.
11. `planner.md` e `architect.md` têm `model: fable` e `effort: high`.
12. Depois do `apply`, o `.claude/settings.json` tem `advisorModel` igual a `conselheiro`, e as chaves
    `permissions` e `hooks` ficam iguais às de antes (comparadas depois de ler o JSON). Com `conselheiro: null`,
    a chave some.
13. A `/k0d3r-task` manda comparar o modelo da sessão com o nível `orquestrador` e avisar em uma linha, sem
    parar a tarefa.
14. Numa sessão real, depois do `apply`, a mensagem de abertura do Claude Code mostra o advisor ligado. Se não
    mostrar, vale o plano B da seção "Limites do conselheiro", e a entrega diz qual dos dois ficou.

## Estratégia de testes e verificação

- Testes com `node --test` sobre diretórios temporários: o script recebe a raiz por argumento, e os testes nunca
  escrevem no `.claude/` real.
- **As escotilhas vêm primeiro** ([`verification.md`](../../../.claude/rules/common/verification.md), regra 10):
  `apply` com validação falhando não escreve nada; agent sem frontmatter; frontmatter com fim de linha `\r\n`;
  campo `model:` que já existe com outro valor; texto `model:` dentro do corpo do agent, que não pode ser
  tocado; `settings.json` ausente ou com JSON inválido, que o `apply` recusa em vez de recriar.
- Cada teste novo é visto falhar antes de passar (regra 6). Os testes dos casos de borda foram escritos depois
  do script; a prova de que falham é uma rodada de mutações, uma por caso, todas detectadas.
- O helper que executa o script falha o teste quando o stderr traz um stack trace: uma exceção não tratada
  também sai com 1 e escreve no stderr, e passaria por recusa.
- Os testes da fatia são escritos por um subagente de contexto novo que recebe só esta spec, para já exercitar
  o papel que a spec 2 cria.
- Limite: nenhum teste prova que o Claude Code **obedece** ao frontmatter; isso é comportamento do produto,
  conferido uma vez à mão (chamar um agent e ver o modelo no transcript) e relatado na entrega.

## Decisões

- **Tabela + script que aplica + portão** (decisão da pessoa, 2026-11-11). Por quê: uma regra que só a sessão
  segue pode parar de ser seguida sem que nada mude na saída; o frontmatter é aplicado pelo Claude Code e o
  portão acusa a divergência. Rejeitado: só rule, sem tocar nos agents; frontmatter editado à mão.
- **Postura "equilibrado" nos valores iniciais** (decisão da pessoa, 2026-11-11): raciocínio em Opus `high`,
  padrão em Sonnet `medium`, rápido em Haiku `low`. Rejeitado: "qualidade primeiro" (raciocínio herdando o
  modelo da sessão) e "econômico" (sem Opus nos agents).
- **O Fable 5.2 entra na tabela, onde é pertinente** (correção da pessoa, 2026-11-11, à primeira versão desta
  spec, que o deixava só como escolha da sessão). Por quê: usar o Fable quando cabe é o objetivo do gist e do
  artigo que motivaram a mudança.
- **Aprovada pela pessoa em 2026-11-11, por proposta do agente: os quatro lugares do Fable** da seção "Onde o Fable 5.2 entra": orquestrador
  recomendado com aviso, `planner`/`architect`/`Plan` em `fronteira`, conselheiro pelo advisor, escalada por
  rule. Rejeitado: fixar `model: fable` no settings do projeto (cobra Fable em toda sessão); pôr reviewers e
  verificador em Fable (tarefa bem especificada; com o conselheiro, eles já consultam o Fable nos pontos de
  decisão).
- **Desfaz a adaptação "modelo herdado da sessão"** (consequência da primeira decisão). Os 13 agents `adapt`
  voltam a ter `model:`, agora derivado do arquivo e não do upstream.
- **Aprovada pela pessoa em 2026-11-11, por proposta do agente: níveis com nome de papel, não de modelo** (`raciocinio`, `padrao`, `rapido`). Por quê:
  o nome sobrevive à troca de modelo. Rejeitado: mapear agent → modelo direto, que obriga a editar 15 linhas a
  cada lançamento.
- **Aprovada pela pessoa em 2026-11-11, por proposta do agente: `code-architect` em `raciocinio`** e `silent-failure-hunter`, `type-design-analyzer`,
  `pr-test-analyzer`, `refactor-cleaner` em `padrao`. A entrevista só nomeou parte dos agents.
- **Aprovada pela pessoa em 2026-11-11, por proposta do agente: escalada para `fronteira`** quando um agent de `raciocinio` não acha a causa ou falha
  duas vezes na mesma coisa, dita na entrega.
- **Aprovada pela pessoa em 2026-11-11, por proposta do agente: nativos por rule, sem hook.** Um hook `PreToolUse` na chamada de agent poderia forçar o
  modelo dos nativos, mas depende do nome e do formato da ferramenta, que mudam entre versões do Claude Code.
  Fica registrado como alternativa, não construído.

## Fora de escopo / questões em aberto

- Fixar o modelo e o esforço da sessão principal: ficam como recomendação com aviso.
- Detectar se o conselheiro está de fato ativo na máquina de cada pessoa (acesso ao Fable, plano, provedor).
- Detectar as variáveis de ambiente e a lista da organização que vencem o frontmatter.
- Detectar se a sessão seguiu a rule nas chamadas de nativos (sem detector; ver a proposta do hook).
- Agents de plugin e de `~/.claude/agents`: o arquivo cobre só `.claude/agents/` do repositório.

## Plano de build

### Escopo e fatias

1. **Script e testes.** Testes escritos primeiro por subagente de contexto novo; `check` e `apply`; JSON com
   os 13 agents atuais.
2. **Aplicação.** `apply` nos 13 agents e no `settings.json`; portão no `CLAUDE.md`; `VERIFY_GATES` e teste do `guard-shell`; notas
   do manifest; rule nova; `performance.md`; `sync-ecc-tools.md`; `ecc-sync.md`; READMEs.

Os dois agents novos entram em `agents` na fatia 1 da spec 2.

### Definição de pronto

Critérios 1 a 14 conferidos; todos os testes do toolset, `docs-check diff` e `docs-check links` com código de
saída 0.

### Feito vs pendente

- [x] Fatia 1: script e testes.
- [x] Fatia 2: `apply` nos agents e no `settings.json`, portão, `guard-shell`, manifest, rule, docs.
- [x] Revisão: os defeitos da seção "O portão falha fechado" corrigidos, teste antes do código. 81 testes; 27
      mutações, todas detectadas.
- [x] Critério 13: a linha de aviso está na `/k0d3r-task`. Conferido por leitura; nenhuma execução mostrou o
      aviso, porque o ensaio rodou no modelo recomendado.
- [x] Duas conferências por contexto limpo, a segunda depois das correções da revisão: critérios 1 a 12 vistos
      funcionando nas duas, nenhum **falhou**.
- [ ] Critério 14: conferência do conselheiro numa sessão real, que só a pessoa pode fazer (abrir uma sessão
      nova no repositório e ver se a abertura mostra o advisor ligado).
- [ ] Não conferido: se o Claude Code obedece ao `model:` e ao `effort:` do frontmatter. É comportamento do
      produto; a documentação diz que sim.
