---
conferido-em: 2026-11-11
---

# Tarefa autônoma: entrevista, uma parada e conferência com contexto limpo

> Spec 2 de 2 desta mudança. Depende de [`roteamento-de-modelos.md`](roteamento-de-modelos.md), que dá modelo e
> esforço aos dois agents criados aqui.

## Propósito

A pessoa decide o que importa uma vez, no começo, e o agente leva a tarefa até a entrega sem pedir licença no
caminho. Em troca, o trabalho é conferido por agents que não viram como ele foi feito.

Fontes: o guia oficial "Prompting Claude Fable 5.2" (lido em 2026-11-11), o artigo de lançamento do Fable 5.2 e
o gist com as dez dicas.

## Comportamento atual e evidências

- A [`/k0d3r-task`](../../../.claude/commands/k0d3r-task.md) abre com "Atue como líder técnico sênior" e não diz
  de quem é o código. O guia mediu que, sem a frase de propriedade, o modelo acrescenta ao lado do que existe em
  vez de consolidar.
- Ela **não pergunta**: quando a pessoa não informa fluxo ou critérios, o command manda propô-los, e a dúvida só
  aparece na parada, com a spec já escrita em cima de uma suposição.
- Ela para em três momentos: aprovação da spec, mudança de escopo durante a implementação, graduação. Entre
  eles, nada diz o que fazer diante de um erro comum, e nada lista o que dispensa aprovação.
- Quem implementa é quem testa e quem confere: a sessão principal escreve os testes (com o `tdd-guide`) e
  verifica os critérios de aceite. Os reviewers atuais olham a qualidade do diff, não se o pedido foi cumprido.
- A entrega final começa por "O que mudou", com cinco itens de mesmo peso.
- Três rules contradizem o comportamento desejado:
  [`agents.md`](../../../.claude/rules/common/agents.md) ("No user prompt needed", "ALWAYS use parallel Task
  execution"), [`testing.md`](../../../.claude/rules/common/testing.md) ("MANDATORY workflow", "ALL required")
  e [`development-workflow.md`](../../../.claude/rules/common/development-workflow.md) (passo 2 manda usar o
  `tdd-guide`). O guia avisa que o Fable 5.2 trata instrução absoluta ao pé da letra e que ordens fixas de
  delegar aumentam o custo.

## Comportamento desejado

### 1. Jeito de trabalhar, no `CLAUDE.md`

Seção nova, "Como trabalhar", que vale em toda sessão. O texto proposto está no
[plano de build](#texto-proposto-da-seção-como-trabalhar). Ela diz:

- **De quem é o código.** O agente é dono e mantenedor do código que a tarefa toca. Pode reorganizar o que está
  no caminho da tarefa quando o resultado fica mais simples que um remendo. Problema fora do caminho é
  registrado, não corrigido.
- **Terminar.** Depois da spec aprovada, segue até a entrega. Erro, timeout e ferramenta falhando são
  obstáculos comuns, resolvidos sem perguntar.
- **O que dispensa ok** e **o que pede ok**, em duas listas com itens nomeados. A segunda lista só repete
  aprovações que as regras do projeto já exigem; nenhuma aprovação nova é criada.
- **Prova.** Só afirma que funciona o que viu funcionar.
- **Relatório.** Começa pelo resultado.

### 2. Fluxo da `/k0d3r-task`

| Passo | O que acontece | Para e espera a pessoa? |
| --- | --- | --- |
| Modelo da sessão | Compara com o nível `orquestrador` do roteamento (Fable 5.2, `high`) e avisa em uma linha se for outro | não |
| Investigação | Lê docs e código, como hoje | não |
| Entrevista | Pergunta o que o repositório não responde | sim, a cada pergunta |
| Spec | Escreve a spec com as respostas | não |
| **Aprovação da spec** | Apresenta e pede aprovação | **sim: a única parada de aprovação** |
| Testes primeiro | O `test-author` escreve os testes que falham | não |
| Implementação | Até os testes e os portões ficarem verdes | só se o comportamento aprovado tiver de mudar |
| Verificação | Portões, reviewers e `acceptance-verifier` | não |
| Entrega | Relatório que começa pelo resultado | pede a graduação, como hoje |

**Entrevista.**

- Acontece **depois** da investigação. Só entra pergunta cuja resposta o repositório não dá.
- **Uma pergunta por vez**, começando pelas que mudariam a forma de construir. Cada pergunta traz opções e a
  recomendação do agente, e diz em uma frase o que foi achado no código que a motivou.
- Termina quando as dúvidas que restam não mudariam a spec. Essas viram **Proposta (agente)** na spec, como hoje.
- **Não há entrevista** quando a mudança não tem efeito de comportamento, nem quando o pedido já responde tudo
  o que mudaria a forma. Nesse segundo caso o agente diz isso em uma linha e segue para a spec.
- Responder a uma pergunta não aprova nada: a aprovação continua sendo a da parada.

**Depois da aprovação.**

- Desvio técnico do plano (ordem das etapas, estrutura interna, nome): o agente decide, anota na spec e relata
  na entrega.
- Se o **comportamento, o contrato ou o escopo aprovados** tiverem de mudar: atualiza a spec, para e pergunta
  só sobre a parte afetada. Um critério de aceite que não dá para cumprir cai neste caso.
- Bloqueio deliberado (arquivo marcado para não tocar, comando barrado pelo `guard-shell`, acesso negado): não
  contorna; diz o que achou e procura outro caminho.

**Mudança sem efeito de comportamento.** Continua sem spec e com a parada curta ("sem spec: <motivo>"). Não
tem entrevista nem `test-author`.

### 3. Agents de contexto limpo

Os dois são locais, ficam em `.claude/agents/` e nascem com contexto novo: recebem só o que o brief traz. O
brief **não** leva o raciocínio da sessão, o resumo do que foi feito, nem a conclusão esperada.

**`test-author`** — antes do código.

| | |
| --- | --- |
| Recebe | O caminho da spec aprovada. |
| Faz | Escreve um ou mais testes para cada critério de aceite, nas convenções de teste do projeto. Roda o portão de teste e mostra cada teste novo falhando porque o comportamento ainda não existe. |
| Devolve | A lista critério → teste, e os critérios que não viraram teste, com o motivo. |
| Não faz | Código de implementação. Mudança na spec. |

A sessão principal relê o diff dos testes antes de usá-los. Ela só altera um teste do `test-author` quando o
teste contradiz a spec ou não monta a situação que o nome dele anuncia, e diz qual e por quê na entrega. Um
caso de borda que a spec não dizia, decidido na implementação, ganha teste da própria sessão e entra na spec;
como esse teste nasce depois do código, a sessão prova que ele falha contra o código errado.

O primeiro uso desse papel, nos testes do roteamento, mostrou por que as duas exceções existem: o autor entregou
49 testes, dos quais 4 falhavam contra um script correto. Um helper media o fim do arquivo em caracteres e não
em bytes, e o fixture criava o arquivo do agent que devia estar sem arquivo. Ele também apontou dez lacunas da
spec, que viraram a lista de casos de borda da spec 1.

**`acceptance-verifier`** — depois dos portões verdes, em paralelo com os reviewers.

| | |
| --- | --- |
| Recebe | O caminho da spec e a ref base do diff. |
| Ferramentas | Leitura, busca e shell. Sem `Edit` nem `Write`. |
| Faz | Para cada critério de aceite, procura a prova rodando: teste, portão, ou o sistema, quando o `CLAUDE.md` diz como rodá-lo. |
| Devolve | Por critério: **visto funcionando** (comando e saída), **falhou** (o que viu) ou **não conferido** (por quê). E a lista do que o diff muda e a spec não cobre. |

A sessão corrige o que **falhou** e chama um verificador novo. A tarefa só é entregue sem nenhum **falhou**.
Os **não conferido** e as mudanças fora da spec vão para a entrega, com esses nomes.

**Proposta (agente):** na mudança sem spec, o `acceptance-verifier` recebe o diff e a afirmação "sem efeito de
comportamento", e procura o efeito de comportamento. É a afirmação que mais custa quando está errada.

O `tdd-guide` continua no toolset para o ciclo vermelho, verde, refatorar conduzido pela própria sessão, fora
da `/k0d3r-task`.

### 4. Rules que contradizem

| Rule | Hoje | Passa a dizer |
| --- | --- | --- |
| `agents.md` | "No user prompt needed": planner, code-reviewer, tdd-guide e architect automáticos | Quando delegar vale o custo e quando não vale; a `/k0d3r-task` diz quais agents entram em cada passo |
| `agents.md` | "ALWAYS use parallel Task execution" | Chamadas independentes saem na mesma mensagem; não se cria agent para o que cabe em poucas chamadas de ferramenta |
| `agents.md` | — | Os dois agents novos na tabela; como escrever o brief de um agent de contexto limpo; ponteiro para o roteamento |
| `testing.md` | "MANDATORY workflow", "ALL required" | Testes primeiro quando há critério de aceite; a exceção (mudança sem efeito de comportamento) dentro da regra; `test-author` na `/k0d3r-task`. Passa de `track` a `adapt` no manifest |
| `development-workflow.md` | Passo 2: "Use tdd-guide agent" | Na `/k0d3r-task`, os testes vêm do `test-author`; fora dela, `tdd-guide` |

A meta de 80% de cobertura e as demais rules ficam como estão.

## Contratos e documentos afetados

| Arquivo | Mudança |
| --- | --- |
| `CLAUDE.md` | seção "Como trabalhar"; linhas Especificar, Construir e Verificar da tabela de Workflow; o parágrafo da `/k0d3r-task` |
| `.claude/commands/k0d3r-task.md` | abertura, entrevista, parada única, passos de teste e verificação, entrega |
| `.claude/agents/test-author.md`, `acceptance-verifier.md` | novos, `local` no manifest |
| `.claude/model-routing.json` | os dois agents novos |
| `.claude/rules/common/agents.md`, `testing.md`, `development-workflow.md` | a tabela da seção 4 |
| `.claude/rules/common/feature-lifecycle.md` | as mesmas três linhas da tabela de etapas, e as seções 1, 3 e 4 |
| `.claude/ecc-sync/manifest.json` | entradas novas; `testing.md` vira `adapt`; notas `adaptation` |
| `.claude/README.md` | inventário |
| [`ecc-sync.md`](../../implemented/processo/ecc-sync.md), [`verificacao-de-docs.md`](../../implemented/processo/verificacao-de-docs.md) | conferidos pelo `docs-check diff`; atualizados onde citam o fluxo da tarefa |

## Critérios de aceite

1. A `/k0d3r-task` descreve a entrevista com as cinco regras da seção 2, e a entrevista vem depois da
   investigação e antes da spec.
2. A `/k0d3r-task` tem uma única parada de aprovação antes da entrega, e diz em que caso a implementação volta
   a parar.
3. O `CLAUDE.md` tem a seção "Como trabalhar" com as duas listas, e todo item da lista "peça ok" corresponde a
   uma aprovação que já existia em `CLAUDE.md` ou em `.claude/rules/`.
4. `acceptance-verifier.md` não lista `Edit` nem `Write` em `tools:`. `test-author.md` proíbe código de
   implementação e mudança na spec.
5. Os dois agents têm nível no `model-routing.json`, e o `model-routing check` sai com 0.
6. A busca no repositório inteiro, sem o `catalog.json`, por `No user prompt needed`, `ALWAYS use parallel` e
   `MANDATORY workflow` só acha esta spec e as notas `adaptation` do manifest, que citam as frases para
   registrar a troca. Nenhuma rule, command, skill ou agent as traz.
7. As linhas Especificar, Construir e Verificar são iguais na tabela do `CLAUDE.md` e na do
   `feature-lifecycle.md`.
8. O manifest tem os dois agents como `local` e o `testing.md` como `adapt`, com nota.
9. Um subagente de contexto novo, que recebe só esta spec e o command, confere os critérios 1 a 8 e não
   devolve nenhum **falhou**.
10. Num ensaio da `/k0d3r-task` sobre o item do
    [`toolset-backlog.md`](../../planned/processo/toolset-backlog.md) (o `parseArgs` do `report.mjs`), o agente não escreve código nem
    spec antes de perguntar, e faz uma pergunta só.

## Estratégia de testes e verificação

- A maior parte desta spec é texto de prompt: não há teste automático que prove o comportamento. As provas são
  a conferência por contexto limpo (critério 9) e o ensaio (critério 10).
- **Limite do ensaio:** ele roda num subagente, que não conversa com a pessoa. Mostra a primeira pergunta e a
  ausência de código, não a entrevista inteira. A primeira `/k0d3r-task` real, na sessão seguinte, é a prova
  que falta; a entrega diz isso.
- Os critérios 4 a 8 são conferidos por comando, com o código de saída na entrega.
- Portões: todos os testes do toolset, `model-routing check`, `docs-check diff` e `docs-check links`.

## Riscos

- **Custo.** O guia mediu, com a frase de propriedade, 70 a 80% mais tokens de saída e mudanças que ninguém
  pediu; com o texto de "terminar o trabalho", cerca de 30% mais. Cada tarefa com spec ganha dois agents.
- **Escopo.** O guia mediu que uma regra de limite de escopo não anula a frase de propriedade. Por isso o
  `acceptance-verifier` lista o que o diff muda fora da spec, e a entrega mostra essa lista.
- **Menos perguntas no meio.** A lista "peça ok" e o `guard-shell` continuam sendo a barreira das ações
  difíceis de desfazer.

## Decisões

- **Entrevista + uma parada** (decisão da pessoa, 2026-11-11). A aprovação da spec fica; depois dela o agente
  só para se o comportamento aprovado tiver de mudar. Graduação e PR continuam pedindo ok. Rejeitado: a
  entrevista substituir a parada; parada proporcional ao risco; manter as três paradas.
- **Investiga antes, pergunta depois** (decisão da pessoa, 2026-11-11). Rejeitado: perguntar antes de ler o
  código; entrevistar só quando o pedido é raso.
- **Dois papéis de contexto limpo** (decisão da pessoa, 2026-11-11): autor de testes antes, verificador de
  aceite depois; tarefa sem spec pula o autor. Rejeitado: só o verificador; só o autor.
- **Dono dentro do escopo** (decisão da pessoa, 2026-11-11). Rejeitado: dono pleno, que refatora o código
  vizinho; mudança mínima como hoje.
- **Alcance: command, `CLAUDE.md` e as rules que contradizem** (decisão da pessoa, 2026-11-11). Rejeitado: só
  o command; reescrever os 13 agents e todas as rules do ECC.
- **Proposta (agente): agents novos em vez de adaptar o `tdd-guide` e o `pr-test-analyzer`.** Os dois do ECC
  têm outro papel (conduzir o ciclo; avaliar a cobertura de um PR), e adaptá-los mais encarece o sync.
- **Proposta (agente): o verificador não edita.** Quem corrige é a sessão; um verificador que conserta o que
  acha deixa de ser uma segunda opinião.
- **Proposta (agente): as descrições "Use PROACTIVELY" dos 13 agents ficam como estão**, e vão para o
  backlog. São ordens fixas de delegar, mas ficam fora do alcance aprovado.

## Fora de escopo / questões em aberto

- Reescrever os prompts dos agents e as demais rules do ECC.
- O passo 1 do `development-workflow.md` ("PRD, architecture, system_design, tech_doc, task_list"), que
  contradiz a spec única do docs-first. Divergência anterior a esta mudança; vai para o backlog.
- Fixar o esforço e o modelo da sessão principal: a spec 1 os trata como recomendação com aviso.
- Hook que force os agents de contexto limpo a receber só a spec: hoje é disciplina do brief.

## Plano de build

### Escopo e fatias

1. **Agents.** `test-author` e `acceptance-verifier`; nível no `model-routing.json`; `apply`; manifest.
2. **Jeito de trabalhar e command.** Seção "Como trabalhar" do `CLAUDE.md`; reescrita da `/k0d3r-task`.
3. **Rules e tabelas.** `agents.md`, `testing.md`, `development-workflow.md`, `feature-lifecycle.md`, tabela de
   Workflow do `CLAUDE.md`; manifest.
4. **Docs e prova.** READMEs; docs de `implemented/`; conferência por contexto limpo; ensaio; backlog.

Ordem com a spec 1: as duas fatias de lá vêm antes.

### Texto proposto da seção "Como trabalhar"

```markdown
## Como trabalhar

Você é dono e mantenedor de longo prazo do código que a tarefa toca: a forma dele é decisão sua. Se o
resultado mais simples pede reorganizar o que já existe no caminho da tarefa, reorganize em vez de remendar
ao lado, e avise no plano da spec quando der para prever. Problema fora do caminho da tarefa é registrado
na entrega, não corrigido.

**Termine o trabalho.** Depois da spec aprovada, siga até a entrega. Erro, timeout, teste quebrado e
ferramenta falhando são obstáculos comuns: ache a causa e resolva com o acesso que você tem. Não ofereça
para esperar e não peça de novo o que já foi aprovado.

**Não precisa de ok:** ler e buscar no repositório; rodar portões e testes; repetir um comando que falhou;
criar e editar arquivos dentro do escopo aprovado; chamar subagentes; commit e push na branch da sessão com
os portões verdes; escolhas técnicas rotineiras (nomes, estrutura interna, ordem das etapas).

**Peça ok antes de:** implementar uma spec que ainda não foi aprovada; mudar comportamento, contrato ou
escopo aprovados; graduar uma spec; abrir um PR; mudar uma regra de arquitetura; adotar um item do ECC;
fazer uma operação destrutiva ou difícil de desfazer. Um bloqueio deliberado (arquivo marcado para não
tocar, acesso negado, comando barrado pelo `guard-shell`) não é obstáculo a contornar: diga o que encontrou
e procure outro caminho.

**Prova.** Só diga que algo funciona se você viu funcionar. O que não deu para conferir, diga que não
conferiu.

**Relatório.** A entrega começa pelo resultado, em frases curtas, para quem não viu as chamadas de
ferramenta nem os arquivos abertos.
```

### Definição de pronto

Critérios 1 a 10 conferidos; nenhum **falhou** do `acceptance-verifier`; todos os portões com código de saída 0.

### Feito vs pendente

- [ ] Fatia 1
- [ ] Fatia 2
- [ ] Fatia 3
- [ ] Fatia 4
