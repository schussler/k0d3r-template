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
| Investigação | Lê docs e código, como hoje | não |
| Modelo da sessão | Só na tarefa com spec, o que se sabe depois de investigar: compara com o nível `orquestrador` do roteamento (Fable 5.2, `high`) e avisa em uma linha se for outro | não |
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
Quando o **falhou** vem de um critério mal escrito, vale a decisão "correção da redação de um critério", na
seção 4.
Os **não conferido** e as mudanças fora da spec vão para a entrega, com esses nomes.

Na mudança sem spec (proposta do agente, aprovada pela pessoa em 2026-11-11), o `acceptance-verifier` recebe o diff e a afirmação "sem efeito de
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
| `development-workflow.md` | Passo 3: só o `code-reviewer` | Ganha uma linha: na `/k0d3r-task`, o `acceptance-verifier` confere os critérios de aceite |
| `testing.md` | "Test Types (ALL required)" | "Test types, each where the system has that layer" |
| `testing.md` | "Run test - it should FAIL" | "…and for the reason you expect" |
| `testing.md` | "Troubleshooting": `tdd-guide` como primeiro passo | `tdd-guide` como último passo, "if the cycle is stuck" |
| `testing.md` | "Agent Support": `tdd-guide`, "Use PROACTIVELY" | `test-author` na `/k0d3r-task` e `tdd-guide` fora dela, sem o "PROACTIVELY" |

A meta de 80% de cobertura e as demais rules ficam como estão.

A segunda conferência por contexto limpo listou o que a `/k0d3r-task` traz e esta spec não dizia. Ficou
registrado aqui:

- Etapa 2 repete a regra de commit por fatia com os portões verdes e push depois de cada commit, que já estava
  no `CLAUDE.md` e nas rules.
- "Critérios de aceite verificáveis" ganhou "cada um diz o que se observa quando ele é cumprido", porque são os
  critérios que os dois agents de contexto limpo recebem.
- O item 3 da entrega ("o que você decidiu sozinho") inclui as chamadas escaladas para outro nível de modelo, da
  spec 1.
- Etapa 3: um defeito que a revisão acha em código que a tarefa não tocou vai para a entrega e para o backlog,
  com a reprodução. É a regra "problema fora do caminho é registrado", com o destino dito.
- Etapa 3: o que a sessão faz quando um **falhou** aponta um critério mal escrito, e não um trabalho errado
  (ver a decisão "correção de critério" abaixo).
- O `README.md` da raiz descreve a `/k0d3r-task` nova no checklist da primeira sessão.

A terceira conferência achou mais três frases do command que esta spec não dizia:

- Entrevista: "Use a ferramenta de pergunta à pessoa quando houver uma; sem ela, pergunte em texto".
- Testes por contexto limpo: um critério que não virou teste é verificado de outro jeito na Etapa 3, e a
  sessão diz qual.
- Spec: o que a pessoa respondeu na entrevista é decisão dela, registrada com a data.

**Correção da redação de um critério** (decisão da pessoa, 2026-11-11):

- Quando o comportamento entregue é o aprovado e é o texto do critério que não o descreve, a sessão corrige a
  redação na spec sozinha e segue.
- A entrega mostra cada critério corrigido: o texto antigo, o novo e por que o comportamento entregue é o
  aprovado.
- Se o que teria de mudar é o comportamento aprovado, e não a redação, a sessão para e pergunta só sobre esse
  critério.

Por quê: parar a cada correção de redação custa uma interrupção, e a pessoa confere a troca na entrega. O
risco, aceito pela pessoa: quem implementou mexe na régua do verificador antes de alguém conferir, e um trabalho
errado pode passar com um critério reescrito para caber nele. A defesa é a entrega mostrar a troca com o porquê.

Troca de decisão no mesmo dia: a pessoa tinha escolhido antes um meio-termo (corrigir sozinha só quando a
correção deixa o critério igual ou mais exigente; parar quando ele fica mais fácil de cumprir). O agente mostrou
que, como estava escrito, o meio-termo equivalia a parar sempre: quando o verificador reprova um trabalho certo,
o texto antigo reprova o entregue e o texto novo o aceita, e isso é sempre "mais fácil de cumprir". Entre manter
o meio-termo, ancorar o teste no corpo da spec (recomendação do agente) e corrigir qualquer redação, a pessoa
escolheu a última. Rejeitado: parar em toda correção; o meio-termo; a âncora no corpo da spec.

Nesta tarefa a sessão corrigiu dois critérios sem perguntar, o 3 e o 6, antes de a regra existir. Pela regra
atual, as duas correções são permitidas e aparecem nesta spec com o porquê. Os textos antigos estão no histórico
do git desta spec.

Na `/k0d3r-task`, duas linhas antigas mudaram por consequência das decisões desta spec. "Faça mudanças
proporcionais ao problema" deu lugar à regra de reorganizar o que está no caminho da tarefa (decisão "dono
dentro do escopo"). A linha em que a própria sessão verifica os critérios de aceite continua, agora dizendo que
o `acceptance-verifier` é a segunda conferência e não a única.

### 5. Conferência ao fim de cada fatia

Acrescentado em 2026-11-11, depois de comparar a `/k0d3r-task` com o prompt "jeito certo" do gist, que manda
conferir o trabalho por subagente em pontos de controle, e não só no fim.

Numa tarefa com spec e **mais de uma fatia**:

- O plano de build diz, em "Escopo e fatias", quais critérios de aceite cada fatia entrega (decisão da pessoa,
  2026-11-11). Um critério pode aparecer em mais de uma fatia, e uma fatia pode não ter critério.
- Ao fim de cada fatia, depois do commit com os portões verdes e do push, a sessão chama um
  `acceptance-verifier` novo. O brief leva três coisas: o caminho da spec, a ref base da fatia (o commit
  anterior ao primeiro commit dela) e o nome da fatia como está no plano.
- Ele confere só os critérios ligados à fatia, e lista o que o diff da fatia muda e a spec não cobre.
- **A próxima fatia só começa sem nenhum falhou na anterior** (decisão da pessoa, 2026-11-11): a sessão
  corrige, roda os portões, commita e chama um verificador novo. A regra da correção da redação de um critério
  (seção 4) vale aqui também.
- **Aprovada pela pessoa em 2026-11-11, por proposta do agente:** a última fatia não tem verificador próprio. O verificador da Etapa 3 confere a spec
  inteira logo em seguida, e essa conferência final continua, porque uma fatia pode quebrar um critério que uma
  anterior entregou.
- **Aprovada pela pessoa em 2026-11-11, por proposta do agente:** uma fatia sem critério ligado não tem
  verificador.
- **Aprovada pela pessoa em 2026-11-11, por proposta do agente:** os reviewers (`code-reviewer` e os outros)
  continuam só no fim, na Etapa 3.
- Caso de borda decidido na implementação: se o plano não liga nenhum critério à fatia do brief, ou não tem uma
  fatia com esse nome, o verificador diz isso e para, em vez de conferir a spec inteira.
- Tarefa de uma fatia só, ou sem spec: nada muda.

Custo: um `acceptance-verifier`, no nível `raciocinio`, por fatia intermediária com critério, mais as rodadas
depois de um **falhou**.

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
| Seção 5 (conferência por fatia) | `k0d3r-task.md` (plano e Etapa 2), `acceptance-verifier.md` (brief de fatia), `agents.md` (brief e quando usar), linha Construir do `CLAUDE.md` e do `feature-lifecycle.md` e a seção 3 deste, comentário de "Escopo e fatias" no [`feature-spec-template.md`](../../implemented/processo/feature-spec-template.md), linha do agent no inventário do `.claude/README.md`, nota `adaptation` do `agents.md` no manifest |

## Critérios de aceite

1. A `/k0d3r-task` descreve a entrevista com as cinco regras da seção 2, e a entrevista vem depois da
   investigação e antes da spec.
2. A `/k0d3r-task` tem uma única parada de aprovação antes da entrega, e diz em que caso a implementação volta
   a parar.
3. O `CLAUDE.md` tem a seção "Como trabalhar" com as duas listas, e todo item da lista "peça ok" corresponde a
   uma aprovação ou a um bloqueio que já existia no projeto antes desta mudança. Cinco vêm do `CLAUDE.md` e de
   `.claude/rules/`: spec não aprovada, graduação, PR, regra de arquitetura e item do ECC. "Mudar comportamento
   ou escopo aprovados" vem da `/k0d3r-task` anterior. "Operação destrutiva ou difícil de desfazer" vem do hook
   `guard-shell`, que já a bloqueava. A única palavra sem precedente é "contrato", no item da mudança de
   comportamento ou escopo; ela está no texto que a pessoa aprovou.
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
11. A `/k0d3r-task` deixa a sessão corrigir sozinha a redação de um critério quando o comportamento entregue é o
    aprovado, manda parar quando o que teria de mudar é o comportamento, e manda a entrega mostrar, para cada
    critério corrigido, o texto antigo, o novo e o porquê. (Critério acrescentado em 2026-11-11 e reescrito no
    mesmo dia com a troca de decisão.)
12. A `/k0d3r-task` manda, numa tarefa com spec e mais de uma fatia, chamar um `acceptance-verifier` novo ao
    fim de cada fatia com critério ligado, menos a última, com um brief de três itens: o caminho da spec, a ref
    base da fatia e o nome da fatia. E manda não começar a fatia seguinte enquanto houver um **falhou**.
13. A `/k0d3r-task` e o comentário de "Escopo e fatias" do `feature-spec-template.md` pedem que o plano diga
    quais critérios cada fatia entrega, quando há mais de uma fatia.
14. `acceptance-verifier.md` descreve o brief de fatia: confere só os critérios ligados à fatia, com o diff a
    partir da ref base da fatia, e lista o que esse diff muda e a spec não cobre.
15. `agents.md` descreve o brief do verificador de fatia, e a linha Construir, igual no `CLAUDE.md` e no
    `feature-lifecycle.md`, cita a conferência por fatia.

## Estratégia de testes e verificação

- A maior parte desta spec é texto de prompt: não há teste automático que prove o comportamento. As provas são
  a conferência por contexto limpo (critério 9) e o ensaio (critério 10).
- **Limite do ensaio:** ele roda num subagente, que não conversa com a pessoa. Mostra a primeira pergunta e a
  ausência de código, não a entrevista inteira. A primeira `/k0d3r-task` real, na sessão seguinte, é a prova
  que falta; a entrega diz isso.
- Os critérios 4 a 8 são conferidos por comando, com o código de saída na entrega.
- Portões: todos os testes do toolset, `model-routing check`, `docs-check diff` e `docs-check links`.
- Seção 5: os critérios 12 a 15 são texto de prompt, conferidos por leitura e busca, e por um
  `acceptance-verifier` novo. **Aprovada pela pessoa em 2026-11-11, por proposta do agente:** sem
  `test-author` nesta parte, porque não há comportamento
  executável para um teste falhar antes. O verificador por fatia rodando numa tarefa real fica **não
  conferido** até a primeira `/k0d3r-task` com mais de uma fatia.

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
- **Aprovada pela pessoa em 2026-11-11, por proposta do agente: agents novos em vez de adaptar o `tdd-guide` e o `pr-test-analyzer`.** Os dois do ECC
  têm outro papel (conduzir o ciclo; avaliar a cobertura de um PR), e adaptá-los mais encarece o sync.
- **Aprovada pela pessoa em 2026-11-11, por proposta do agente: o verificador não edita.** Quem corrige é a sessão; um verificador que conserta o que
  acha deixa de ser uma segunda opinião.
- **Verificador ao fim de cada fatia** (decisão da pessoa, 2026-11-11), só em tarefa com mais de uma fatia.
  Confere os critérios que o plano liga à fatia, e a fatia seguinte espera. Rejeitado: conferir todos os
  critérios a cada fatia, marcando os não entregues como pendentes; conferir só o que saiu da spec; rodar o
  verificador em segundo plano enquanto a fatia seguinte começa.
- **As descrições "Use PROACTIVELY" ficam como estão e foram para o backlog** (proposta do agente, aprovada
  pela pessoa em 2026-11-11). São ordens fixas de delegar, mas ficam fora do alcance aprovado. A proposta dizia
  "dos 13 agents"; a contagem no código deu 7 (`planner`, `architect`, `code-reviewer`, `security-reviewer`,
  `tdd-guide`, `doc-updater`, `refactor-cleaner`).

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

Critérios 1 a 15 conferidos; nenhum **falhou** do `acceptance-verifier`; todos os portões com código de saída 0.

### Feito vs pendente

- [x] Fatia 1: agents, nível no roteamento, manifest.
- [x] Fatia 2: seção "Como trabalhar" e reescrita da `/k0d3r-task`.
- [x] Fatia 3: rules, tabelas de etapas, manifest.
- [x] Fatia 4: READMEs, docs de `implemented/` conferidos, backlog, conferência por contexto limpo e ensaio.
- [x] Fatia 5 (seção 5, critérios 12 a 15): command, `acceptance-verifier.md`, `agents.md`, tabelas Construir,
      seção 3 do `feature-lifecycle.md`, template de spec; conferência por contexto limpo.

Resultado da conferência da fatia 5, por um `acceptance-verifier` novo: critérios 12 a 15 vistos funcionando,
por leitura e busca (a igualdade das linhas Construir, por comparação de strings, com o controle de que a linha
antiga difere). Nenhum **falhou**. Ele listou o que o diff trazia e esta spec não dizia: o inventário e a nota do
manifest, o caso de borda "diga isso e pare" do agent e a falta da exceção "fatia sem critério" na seção 3 do
`feature-lifecycle.md`. Os dois primeiros entraram na tabela de contratos, o terceiro na seção 5, e a exceção
entrou no `feature-lifecycle.md`.

Resultado da primeira conferência por contexto limpo: os critérios 1, 2 e 4 a 8 vistos funcionando; o critério 3
**falhou**, porque a redação original dizia que todo item de "peça ok" vinha de `CLAUDE.md` ou de
`.claude/rules/`, e dois vinham de outros lugares do projeto. O comportamento aprovado não mudou: a redação do
critério foi corrigida para nomear as origens. O mesmo verificador listou mudanças que o diff trazia e a spec
não citava; elas entraram na seção 4.

Resultado da segunda conferência, por um `acceptance-verifier` novo, depois das correções: nenhum **falhou** nos
critérios 1 a 8. Os critérios 1 a 4 foram conferidos por leitura, porque são texto de prompt. O critério 10 ficou
**não conferido** por ele: o ensaio não deixa registro no repositório além deste relato.

Resultado da terceira conferência, depois da troca de decisão sobre a correção de critérios: nenhum **falhou**
nos critérios 1 a 8 e 11. Os critérios 1 a 3, 11 e metade do 4 foram conferidos por leitura. O critério 10
continuou **não conferido** pelo verificador.

Resultado do ensaio (critério 10): o agente investigou, reproduziu o defeito e terminou com **uma** pergunta,
com duas opções, a recomendação e o que achou no código. Não escreveu spec nem código; `git status` na cópia
isolada mostrou só uma pasta ignorada, com o script de reprodução. Limite: o ensaio mostra a primeira pergunta,
não a entrevista inteira nem o que acontece depois da aprovação.
