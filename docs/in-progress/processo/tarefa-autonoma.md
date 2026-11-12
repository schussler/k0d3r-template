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

> **Substituída pela seção 9 em 2026-11-12:** na branch `harness-meio-termo`, não há verificador por fatia. O
> texto abaixo fica como registro do que a corrida `novo2` exercitou.

Acrescentado em 2026-11-11, depois de comparar a `/k0d3r-task` com o prompt "jeito certo" do gist, que manda
conferir o trabalho por subagente em pontos de controle, e não só no fim.

Numa tarefa com spec e **mais de uma fatia**:

- O plano de build diz, em "Escopo e fatias", quais critérios de aceite cada fatia entrega (decisão da pessoa,
  2026-11-11). Um critério pode aparecer em mais de uma fatia, e uma fatia pode não ter critério.
- Ao fim de cada fatia, depois do commit com os portões verdes e do push, a sessão chama um
  `acceptance-verifier` novo. O brief leva três coisas: o caminho da spec, a ref base da fatia (o commit
  anterior ao primeiro commit dela) e o nome da fatia como está no plano.
- Ele confere só os critérios ligados à fatia, e lista o que o diff da fatia muda e a spec não cobre.
- **A próxima fatia espera a conferência, em no máximo duas rodadas** (decisão da pessoa, 2026-11-11; limite
  de rodadas de 2026-11-12, seção 8): com um **falhou**, a sessão corrige, roda os portões, commita e chama um
  verificador novo. Com um **falhou** também na segunda rodada, ela corrige, commita, anota no plano os critérios
  corrigidos sem nova conferência e segue. A regra da correção da redação de um critério (seção 4) vale aqui
  também.
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

Custo: um `acceptance-verifier`, no nível `padrao` (era `raciocinio` até 2026-11-12), por fatia intermediária
com critério, mais no máximo uma rodada depois de um **falhou**.

### 6. Testes por fatia, antes do código da fatia

Acrescentado em 2026-11-12, depois de rodar a versão nova com o prompt da Estação Kepler (sessão `novo`, em
Sonnet 5.5, 8 fatias planejadas).

O que o teste mostrou:

- **Testes de uma vez só travam o commit.** Com o `test-author` escrevendo no início os testes de todos os
  critérios, o portão de teste fica vermelho até a última fatia e nenhum commit de fatia passa. A sessão desviou
  sozinha para testes por fatia, e pediu isso na parada.
- **O `test-author` rodou ao lado do código.** A sessão o chamou em segundo plano, escreveu código da fatia
  enquanto ele rodava e depois esperou o fim dele com laços de `sleep` sobre o arquivo de saída. O da F2
  relatou: "não pude mostrar que eles falham antes do código: a implementação já estava sendo escrita na mesma
  árvore", e leu um arquivo de implementação em escrita.
- **O brief levou mais que a spec:** a lista de critérios, a divisão entre unidade e E2E e instruções sobre
  arquivos.
- **Cada fatia custa uma rodada de `test-author` e uma de verificador.** Na `novo`, de 5 a 18 minutos e de 6 a 7
  minutos. Rodar o E2E custou de 0,1 a 1,8 minuto por vez.

Comportamento desejado:

- **Testes por fatia.** Numa tarefa com mais de uma fatia, o `test-author` é chamado no começo de cada fatia
  com um brief de dois itens: o caminho da spec e o nome da fatia como está no plano. Ele escreve os testes só
  dos critérios que o plano liga à fatia. Numa tarefa de uma fatia, nada muda: o brief é só o caminho da spec.
  Uma fatia sem critério ligado não tem `test-author`.
- **Antes do código da fatia, sem paralelo.** A sessão chama o `test-author` em primeiro plano e só escreve
  código da fatia depois que ele devolve. Não o chama em segundo plano nem espera por ele com laço de espera.
- Casos de borda decididos na implementação, no `test-author.md`: os testes das fatias anteriores já existem e
  devem continuar passando; e um teste que passa de primeira, porque o código de que ele depende já existe, é
  relatado como "não visto falhando".
- **O número de fatias continua livre** (decisão da pessoa, 2026-11-12: "não limite a imaginação dos
  modelos"). O agente tinha proposto pedir o menor número de fatias, para economizar rodadas de `test-author` e
  de verificador; a pessoa rejeitou.

**Portões rápidos e lentos** (decisão da pessoa, 2026-11-12: "ele irá servir em outros projetos"):

- A tabela **Portões de verificação** do `CLAUDE.md` ganha a coluna "Quando", com dois valores: "na iteração"
  (rápido) e "antes do commit" (lento). No template: lint, typecheck, teste e os três portões do toolset
  (`docs-check diff`, `docs-check links`, `model-routing check`) ficam "na iteração"; build e auditoria de
  dependências ficam "antes do commit". O projeto ajusta a coluna ao preencher a tabela, e um E2E entra como
  "antes do commit".
- Enquanto a sessão itera numa fatia, roda só os portões "na iteração". **Antes de qualquer commit, roda
  todos**, como hoje (decisão da pessoa, 2026-11-12). A regra "commit só com todos os portões verdes" não muda,
  e nenhum commit vermelho chega ao remoto.
- O ganho aparece onde um portão lento se repete: um E2E de 10 minutos rodado a cada ajuste. Na Estação Kepler
  ele não teria aparecido: o E2E levou de 0,1 a 1,8 minuto. O agente tinha justificado esta correção com "26
  minutos de E2E", número errado (eram esperas pelos subagents), e por isso a tirou da spec; a pessoa a trouxe
  de volta pelo uso em outros projetos.
- Rejeitado: commit no meio da fatia só com os portões rápidos verdes, que mudaria a regra de commit e deixaria
  subir um commit com o E2E quebrado.

Fora de escopo: o `test-author` escrever os testes da fatia seguinte enquanto a sessão implementa a atual
(opção apresentada em 2026-11-12, não escolhida).

### 7. A adoção do ECC sai da tarefa

> **Substituída em parte pela seção 12 em 2026-11-12:** a tarefa volta a propor e adotar itens do ECC, agora
> dentro da spec e aprovados na parada única. O texto abaixo fica como registro.

Acrescentado em 2026-11-12, depois das duas corridas da Estação Kepler na versão nova.

O que as corridas mostraram: nas duas, a sessão leu o gatilho da `## Stack` do `CLAUDE.md` ("detecte a stack,
proponha o texto desta seção e rode `/sync-ecc-tools --adopt`"), pôs a adoção como proposta na parada, a pessoa
aprovou, e **nenhum item foi adotado**: nenhum commit mexeu em `.claude/`, o `../ECC` não existia e a sessão
não perguntou se podia clonar. A entrega não diria nada; só apareceu porque o agente desta sessão foi olhar. A
`/k0d3r-task` não diz em que momento, depois da aprovação, a adoção roda.

Comportamento desejado (decisão da pessoa, 2026-11-12: "prefiro tirar"):

- **A `/k0d3r-task` não propõe nem roda adoção do ECC.** Quando a tarefa preenche a `## Stack` (dia zero, na
  primeira tarefa do projeto) ou a muda, ela continua preenchendo a `## Stack` e as linhas da tabela de portões,
  porque os portões são dela; o gatilho da `## Stack` no `CLAUDE.md` passa a pedir as duas coisas. O
  `ecc-sync.md`, em `implemented/`, foi conferido e corrigido nesta mudança (`conferido-em` de 2026-11-12).
- **Ela avisa em uma linha,** na parada e na entrega: a stack mudou, a adoção do ECC está pendente e é um passo
  da pessoa, fora da tarefa, com `/sync-ecc-tools --adopt`.
- **A adoção vira um passo explícito da pessoa:** no dia zero, antes ou depois da primeira tarefa; e quando uma
  tarefa muda a stack. O `/sync-ecc-tools --adopt` continua como está, com a confirmação dele e a pergunta antes
  de clonar.

Rejeitado (proposta do agente, recusada pela pessoa em 2026-11-12): manter a adoção na tarefa, como primeiro
passo depois da aprovação, com a lista e o clone aprovados na parada da spec e um critério de aceite automático
que conferisse os itens em `.claude/`. Motivo da recusa: tira peso da `/k0d3r-task`, e a adoção acontece poucas
vezes na vida de um projeto.

### 8. Cortes de custo depois da corrida `novo2`

> O limite de duas rodadas desta seção caiu junto com o verificador por fatia (seção 9). O verificador em
> `padrao` e os relatórios curtos continuam.

Acrescentado em 2026-11-12, na branch `harness-v2`. A corrida `novo2` da Estação Kepler (Sonnet 5.5, parada
pela pessoa na fatia 4 de 6) gastou 140 mi de cache read e 1,11 mi de output, contra 72,7 mi e 526 mil da
`bobtail` inteira, com o template antigo:

- **Sessão principal: 105,7 mi**, com contexto médio de 467 mil tokens por chamada (350 mil na `bobtail`). Os
  relatórios dos subagentes e os ciclos de correção entram nesse contexto e são relidos a cada chamada.
- **`acceptance-verifier`: 18,1 mi**, em Opus, 6 rodadas. A fatia 2 teve 4, cerca de 50 minutos; cada uma achou
  um defeito real.
- Implementadores `general-purpose`: 14,3 mi. `test-author`: 2,7 mi.

O que muda:

- **No máximo duas rodadas de verificador por fatia** (seção 5). O verificador da Etapa 3 continua conferindo a
  spec inteira, e a entrega continua sem nenhum **falhou**.
- **Relatórios curtos dos dois agents de contexto limpo.** Uma linha por critério que passou; o detalhe para agir
  (o que viu, o que a spec pedia, como reproduzir) só em **falhou** e **não conferido**; o que o diff muda e a spec
  não cobre, uma linha por item. O `test-author` devolve critério → arquivo e nome do teste, nomeia os testes não
  vistos falhando e mantém a lista de lacunas da spec. A economia não foi medida.
- **`acceptance-verifier` no nível `padrao`** (Sonnet), decisão registrada na
  [spec do roteamento](roteamento-de-modelos.md). Os tokens ficam parecidos; o preço por token cai. O risco é
  ele achar menos defeitos: a próxima corrida conta os **falhou**.

Fora: a compactação automática mais cedo (`CLAUDE_CODE_AUTO_COMPACT_WINDOW`), que ataca o maior custo, ficou
para depois (decisão da pessoa, 2026-11-12) e foi para o backlog; e proibir a sessão de delegar a implementação,
porque o código feito na própria sessão também faz o contexto dela crescer.

### 9. Meio-termo: sem verificador por fatia

Acrescentado em 2026-11-12, na branch `harness-meio-termo`, criada a partir da `harness-v2`. Na `novo2`, o
verificador por fatia foi a parte mais cara e mais lenta dos agents de contexto limpo: 18,1 mi de cache read e 52
minutos em 6 rodadas, com a fatia seguinte esperando. O `test-author` por fatia custou 2,7 mi e uns 14 minutos.

O que fica: a entrevista, a parada única, "dono do código" e "termine o trabalho"; o roteamento; o
`test-author` no começo de cada fatia, em primeiro plano; o plano dizendo quais critérios cada fatia entrega,
que é o que o `test-author` da fatia recebe; os portões "na iteração" e "antes do commit"; o
`acceptance-verifier` uma vez, na Etapa 3, sobre a spec inteira, com os reviewers.

O que sai: o `acceptance-verifier` ao fim de cada fatia, o brief de fatia dele e o limite de duas rodadas.

O conselheiro volta a ficar ligado nesta branch (decisão registrada na
[spec do roteamento](roteamento-de-modelos.md)): a consulta "antes de declarar pronto" é a conferência que sobra
dentro de cada fatia.

Custo aceito: um defeito de uma fatia só aparece no fim, e as correções vêm todas de uma vez. Na `novo2`, o
verificador por fatia achou 3 **falhou** reais nas fatias 2 e 3.

### 10. Dia zero completo na primeira tarefa

Acrescentado em 2026-11-12, na branch `harness-meio-termo`. A `novo` não fez nenhuma pergunta e não tratou o
dia zero. A `novo2` perguntou o idioma por conta própria ("as convenções de idioma do CLAUDE.md ainda são
placeholder") e commitou "base do jogo e dia zero do CLAUDE.md". O gatilho só citava a `## Stack` e os
portões, então o resultado dependia da sessão.

Na primeira tarefa do repositório, se ainda forem placeholder:

- o idioma de "Convenções" (código, docs, interface) vira uma pergunta da entrevista;
- "Projeto em um parágrafo" vira **Proposta (agente)** na spec.

A aprovação é a da parada da spec, sem parada nova. Depois dela, a `## Stack`, os portões, o idioma e o
parágrafo entram no `CLAUDE.md` no primeiro commit da tarefa. Com os trechos preenchidos, nada disso roda. A
adoção do ECC continua fora da tarefa (seção 7).

### 11. Classificar a tarefa antes de escrever spec

Acrescentado em 2026-11-12, na branch `harness-meio-termo`. No MN-Clinic, que usa uma versão anterior deste
harness, entraram umas 30 specs em `planned/` e `in-progress/` em 10 dias. Três regras geravam spec onde não
precisava: só "sem efeito de comportamento" escapava da spec, então uma correção de bug ganhava spec própria
(`prescricao-quebra-de-pagina-formula.md`); a sobra de uma feature virava spec em `planned/`
(`bottombar-migracao-dos-editores.md`, nascida num commit `fix`); e um defeito de revisão virava spec
(`sair-da-conta-fila-e-chave.md`: "este documento registra o defeito para a correção ter uma spec própria").

A `/k0d3r-task` passa a pôr a tarefa numa via logo depois de entender o estado atual, de cima para baixo:

| Via | Quando | Doc | Entrevista e `test-author` |
| --- | --- | --- | --- |
| Sem spec | Não muda comportamento nem contrato | Nenhum | Não |
| Correção | Devolve o que um doc de `implemented/` já descreve | Nenhum doc novo; cita o doc e a seção | Não; o teste é da sessão |
| Ajuste pontual | Muda pouco algo que existe, sem fluxo novo, num PR, sem decisão aberta | Edita a spec de `implemented/` direto | Não; o teste é da sessão |
| Editar a spec ou delta | Muda uma feature além do pontual | Critério de spec × delta | Sim |
| Spec nova | Comportamento novo | Spec nova | Sim |

- Na dúvida, a sessão desce uma via, não mais: dúvida nunca vira spec nova.
- A parada começa pela via e pelo motivo; a pessoa pode trocar a via.
- O verificador do fim recebe, na correção, a afirmação "devolve o que `<doc> › <seção>` descreve" e, no
  ajuste pontual, a seção editada.
- A sobra de feature e o defeito fora do caminho viram uma linha em
  [`docs/planned/backlog.md`](../../planned/backlog.md), novo. Vira spec em `planned/` só a sobra cujo desenho já
  foi escrito e aprovado. A `/audit-docs` também passa a mandar divergência para o backlog.

### 12. A tarefa propõe e adota as ferramentas do ECC que ajudam nela

Acrescentado em 2026-11-12, na branch `harness-meio-termo`. Com a adoção fora da tarefa (seção 7), o CRM-k0d3r
nunca adotou um pacote da stack: na corrida `gramma` (importação de dados, Go e Vue), o catálogo tinha
`go-reviewer`, `typescript-reviewer`, `vue-reviewer`, `golang-testing`, `vue-patterns` e `postgres-patterns`
sem adotar, e a revisão do fim só teria os revisores genéricos. O aviso "adoção pendente" não bastou.

- **Na investigação**, nas vias com spec, a tarefa cruza as linguagens e camadas que a spec toca com o
  `catalog.json` e escreve na spec a seção "Ferramentas do ECC para esta tarefa", como **Proposta (agente)**: uma
  linha por item, com o que faz, por que ajuda e em qual etapa entra. As regras de linguagem vêm separadas e
  desmarcadas, porque ficam no contexto de toda sessão.
- **Na parada**, a pessoa corta o que quiser; aprovar a spec aprova a adoção do resto. Não há pergunta à parte.
- **Depois da aprovação**, antes do primeiro `test-author`, a tarefa adota os itens num commit só, pelo passo de
  adoção do `/sync-ecc-tools`: nível no roteamento (`padrao` para revisores) e `description` sem "MUST BE
  USED", com a troca na nota `adaptation`. Agent adotado só fica disponível pelo nome numa sessão nova; nesta, a
  tarefa o chama por um `general-purpose` com o arquivo dele e confere o `git status` depois (regra 9 do
  `verification.md`).
- **Na entrega**, ela diz o que adotou, o que a pessoa cortou e qual linguagem do diff ficou sem revisor.
- O `/sync-ecc-tools --adopt` continua para adotar fora de uma tarefa.

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
| Seção 6 (portões rápidos e lentos) | `CLAUDE.md` (coluna "Quando" e a linha sobre quando rodar), `verification.md` (rodar só os rápidos na iteração, todos antes do commit), `k0d3r-task.md` ("Implemente até o fim"), seções 0 e 3 do `feature-lifecycle.md` e a linha Construir das duas tabelas, item do checklist do `README.md` da raiz |
| Seção 6 (testes por fatia) | `k0d3r-task.md` ("Testes por contexto limpo"), `test-author.md` (brief de fatia), `agents.md` (brief), `testing.md` e `development-workflow.md` ("antes do código"), linha Construir do `CLAUDE.md` e do `feature-lifecycle.md` e a seção 3 deste, inventário do `.claude/README.md`, notas `adaptation` do manifest |
| Seção 8 (cortes de custo) | `k0d3r-task.md` (conferência ao fim de cada fatia), seção 3 do `feature-lifecycle.md` e a linha Construir das duas tabelas, "O que devolver" do `acceptance-verifier.md` e do `test-author.md`, nível do `acceptance-verifier` no `model-routing.json` e o frontmatter dele, linha da compactação no [`toolset-backlog.md`](../../planned/processo/toolset-backlog.md) |
| Seção 9 (sem verificador por fatia) | `k0d3r-task.md` (sai a "Conferência ao fim de cada fatia"), `acceptance-verifier.md` (sai o brief de fatia), `agents.md` (tabela, ordem dos agents e brief), seção 3 do `feature-lifecycle.md` e a linha Construir das duas tabelas, inventário do `.claude/README.md`, comentário de "Escopo e fatias" no [`feature-spec-template.md`](../../implemented/processo/feature-spec-template.md), nota `adaptation` do `agents.md` no manifest |
| Seção 10 (dia zero completo) | `k0d3r-task.md` ("Dia zero e adoção do ECC"), gatilho da `## Stack` no `CLAUDE.md`, linha Dia zero das duas tabelas, seção 0 do `feature-lifecycle.md`, checklist do `README.md` da raiz |
| Seção 11 (classificar a tarefa) | `k0d3r-task.md` ("Classifique a tarefa", item 1 e 3 da parada, testes, brief do verificador, defeito na Etapa 3), `acceptance-verifier.md` (briefs de correção e ajuste), `agents.md` (brief), `audit-docs.md`, regra de feature parcial no `CLAUDE.md` e no `feature-lifecycle.md`, parágrafo da `/k0d3r-task` nos dois, "spec × delta" do `feature-lifecycle.md`, [`docs/planned/backlog.md`](../../planned/backlog.md) (novo) e o `README.md` de `planned/` |
| Seção 12 (ferramentas do ECC na spec) | `k0d3r-task.md` (seção do dia zero, item 4 da parada, "Adote as ferramentas aprovadas", item 5 da entrega), `sync-ecc-tools.md` (chamada pela tarefa), gatilho da `## Stack` no `CLAUDE.md`, linhas Dia zero e Iniciar das duas tabelas, seções 0 e 2 do `feature-lifecycle.md`, `README.md` da raiz, `.claude/README.md`, "Quando rodar" do [`ecc-sync.md`](../../implemented/processo/ecc-sync.md), [`feature-spec-template.md`](../../implemented/processo/feature-spec-template.md) |
| Seção 7 (adoção fora da tarefa) | `k0d3r-task.md` (a linha da parada e da entrega), gatilho da `## Stack` no `CLAUDE.md`, linhas Dia zero e Iniciar das duas tabelas, seções 0 e 2 do `feature-lifecycle.md`, "Quando rodar" do [`ecc-sync.md`](../../implemented/processo/ecc-sync.md), checklist e tabela de gatilhos do `README.md` da raiz |

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
12. (Substituído pela seção 9 em 2026-11-12; ver o critério 28.) A `/k0d3r-task` manda, numa tarefa com spec e mais de uma fatia, chamar um `acceptance-verifier` novo ao
    fim de cada fatia com critério ligado, menos a última, com um brief de três itens: o caminho da spec, a ref
    base da fatia e o nome da fatia. E manda a fatia seguinte esperar a conferência, em no máximo duas rodadas
    (redação de 2026-11-12, com o limite da seção 8; antes: "não começar a fatia seguinte enquanto houver um
    **falhou**").
13. A `/k0d3r-task` e o comentário de "Escopo e fatias" do `feature-spec-template.md` pedem que o plano diga
    quais critérios cada fatia entrega, quando há mais de uma fatia.
14. (Substituído pela seção 9 em 2026-11-12; ver o critério 28.) `acceptance-verifier.md` descreve o brief de fatia: confere só os critérios ligados à fatia, com o diff a
    partir da ref base da fatia, e lista o que esse diff muda e a spec não cobre.
15. (Substituído pela seção 9 em 2026-11-12; ver o critério 28.) `agents.md` descreve o brief do verificador de fatia, e a linha Construir, igual no `CLAUDE.md` e no
    `feature-lifecycle.md`, cita a conferência por fatia.
16. A `/k0d3r-task` manda, numa tarefa com mais de uma fatia, chamar o `test-author` no começo de cada fatia
    com critério ligado, com um brief de dois itens (o caminho da spec e o nome da fatia), em primeiro plano, e
    não escrever código da fatia antes de ele devolver. Ela proíbe chamá-lo em segundo plano e esperar por ele
    com laço de espera. Numa tarefa de uma fatia, o brief continua sendo só o caminho da spec.
17. `test-author.md` descreve o brief de fatia: testes só dos critérios que o plano liga à fatia; se o plano
    não tem a fatia ou não liga critério a ela, ele diz isso e para.
18. `agents.md` traz o brief de fatia do `test-author`. A linha Construir, igual no `CLAUDE.md` e no
    `feature-lifecycle.md`, diz que os testes vêm por fatia, antes do código dela. `testing.md`,
    `development-workflow.md` e a seção 3 do `feature-lifecycle.md` não dizem mais que todos os testes vêm
    antes de qualquer código.
19. A tabela **Portões de verificação** do `CLAUDE.md` tem a coluna "Quando" preenchida em toda linha, com
    "na iteração" ou "antes do commit", e o texto abaixo dela diz que na iteração rodam só os "na iteração" e
    que antes de qualquer commit rodam todos. A frase "Commit só com todos os portões verdes" continua lá.
20. `verification.md` e a `/k0d3r-task` dizem o mesmo que o critério 19 sobre quando rodar cada portão, e a
    seção 0 do `feature-lifecycle.md` pede a coluna "Quando" ao preencher a tabela.
21. (Substituído pela seção 12 em 2026-11-12; ver os critérios 36 a 39.) A `/k0d3r-task` diz que não propõe nem roda adoção do ECC, e que, quando a tarefa preenche ou muda a
    `## Stack`, a parada e a entrega trazem uma linha com a adoção pendente e o comando `/sync-ecc-tools
    --adopt`.
22. (Substituído pela seção 12 em 2026-11-12; ver os critérios 36 a 39.) O gatilho da `## Stack` no `CLAUDE.md`, as seções 0 e 2 do `feature-lifecycle.md` e as linhas Dia zero e
    Iniciar (iguais nas duas tabelas) dizem que a adoção é um passo da pessoa, fora da tarefa. Nenhum desses
    lugares manda a tarefa rodar o `--adopt`.
23. (Substituído pela seção 12 em 2026-11-12; ver os critérios 36 a 39.) A seção "Quando rodar" do `ecc-sync.md` e o checklist e a tabela de gatilhos do `README.md` da raiz dizem o
    mesmo que o critério 22.
24. (Substituído pela seção 9 em 2026-11-12; ver o critério 28.) A `/k0d3r-task` limita a conferência de cada fatia a duas rodadas: com um **falhou** na segunda, a sessão
    corrige, commita, anota no plano os critérios corrigidos sem nova conferência e segue, sem terceira rodada; a
    Etapa 3 continua exigindo nenhum **falhou**. A seção 3 do `feature-lifecycle.md` diz o mesmo, e a linha
    Construir, igual no `CLAUDE.md` e no `feature-lifecycle.md`, diz "em até duas rodadas".
25. `acceptance-verifier.md` pede uma linha por critério **visto funcionando** e, em **falhou** e **não
    conferido**, o que viu, o que a spec pedia e como reproduzir. `test-author.md` pede uma linha por critério →
    teste e mantém a lista de lacunas da spec.
26. A busca por "só começa sem nenhum" em `.claude/` e no `CLAUDE.md` não acha nada.
27. A `/k0d3r-task` não tem verificador por fatia: o `acceptance-verifier` é chamado só na Etapa 3, sobre a
    spec inteira. O `test-author` continua no começo de cada fatia.
28. A busca por "fim de cada fatia", "Fim de uma fatia", "end of each slice", "end of a slice", "duas rodadas" e
    "verificador da fatia" em `.claude/` (sem o `catalog.json`), no `CLAUDE.md` e no `feature-spec-template.md`
    não acha nada.
29. A linha Construir é igual no `CLAUDE.md` e no `feature-lifecycle.md` e não cita o `acceptance-verifier`;
    o `acceptance-verifier.md` tem dois tipos de brief, com spec e sem spec.
30. A `/k0d3r-task` manda, quando o idioma de "Convenções" ainda é placeholder, fazer dele uma pergunta da
    entrevista e, quando "Projeto em um parágrafo" ainda é placeholder, propô-lo na spec como **Proposta
    (agente)**; e manda os dois entrarem no `CLAUDE.md` no primeiro commit da tarefa, sem parada nova.
31. A linha Dia zero é igual no `CLAUDE.md` e no `feature-lifecycle.md` e cita o idioma e o parágrafo do
    projeto; o gatilho da `## Stack` e a seção 0 do `feature-lifecycle.md` dizem o mesmo que o command.
32. A `/k0d3r-task` tem a seção "Classifique a tarefa" com as cinco vias na ordem (sem spec, correção, ajuste
    pontual, editar a spec ou delta, spec nova), a regra "desça uma via, não mais" e, nas três primeiras, sem
    entrevista, sem spec e sem `test-author`, com o teste da sessão provado contra o código de antes.
33. O item 1 da parada começa pela via e pelo motivo; o `acceptance-verifier.md` e o `agents.md` têm os briefs
    de correção e de ajuste pontual.
34. A regra de feature parcial, igual em sentido no `CLAUDE.md` e no `feature-lifecycle.md`, manda a sobra para
    `docs/planned/backlog.md` e só a sobra com desenho aprovado para `planned/`; a Etapa 3 da `/k0d3r-task` e a
    `/audit-docs` mandam defeito e divergência para o backlog, e o arquivo existe.
35. A busca por "vira spec em `planned/`" e por "passa por ela sem spec" em `.claude/` e no `CLAUDE.md` não
    acha nada.
36. A `/k0d3r-task` manda, nas vias com spec, escrever a seção "Ferramentas do ECC para esta tarefa" a partir do
    `catalog.json`, como **Proposta (agente)**, com as regras de linguagem separadas e desmarcadas; e o
    `feature-spec-template.md` tem essa seção.
37. A parada diz que aprovar a spec aprova a adoção do que ficou na lista; a Etapa 2 tem "Adote as ferramentas
    aprovadas", antes do primeiro `test-author`, num commit à parte, com nível no roteamento, `description` sem
    ordem fixa de delegar e a chamada por `general-purpose` na mesma sessão; o `sync-ecc-tools.md` aceita a
    lista da parada como confirmação.
38. A entrega diz o que foi adotado, o que foi cortado e qual linguagem do diff ficou sem revisor.
39. A busca por "fora da tarefa" no `CLAUDE.md`, em `.claude/commands`, `.claude/rules`, nos dois READMEs e em
    `docs/implemented` não acha nada; as linhas Dia zero e Iniciar são iguais nas duas tabelas.

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
- Seção 7: os critérios 21 a 23 são texto de prompt e de doc, conferidos por leitura e busca (inclusive a busca
  por `--adopt` nos lugares do critério 22) e por um `acceptance-verifier` novo, sem `test-author`.
- Seção 6: os critérios 16 a 20 também são texto de prompt, conferidos por leitura e busca e por um
  `acceptance-verifier` novo, sem `test-author`, pelo mesmo motivo da seção 5. O efeito numa tarefa real (o
  `test-author` em primeiro plano, os testes falhando antes do código da fatia) só aparece rodando de novo o prompt da Estação
  Kepler, e fica **não conferido** até lá.

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
- **Testes por fatia, antes do código dela** (decisão da pessoa, 2026-11-12, depois do teste da Estação
  Kepler). Rejeitado: o `test-author` em paralelo com a fatia atual escrevendo a seguinte; manter os testes de
  uma vez no início, que travam o commit por fatia; pedir o menor número de fatias.
- **A tarefa volta a propor e adotar as ferramentas do ECC, na spec e aprovadas na parada** (decisão da pessoa,
  2026-11-12: "quero que o task identifique as necessidades para ajudar ele na spec igual antes"; "aprovo").
  Reverte em parte "a adoção do ECC sai da tarefa" (seção 7): a adoção volta, mas sem pergunta à parte. Rejeitado:
  só um aviso de adoção pendente, que no CRM-k0d3r não levou a nenhuma adoção.
- **Classificar a tarefa em cinco vias** (proposta do agente, aprovada pela pessoa em 2026-11-12: "sim e
  atualize o novo 4"), com o backlog do projeto para sobras e defeitos. Rejeitado: só alargar o "sem spec" sem
  tornar a escolha da via explícita; manter sobra e defeito como spec em `planned/`.
- **Dia zero completo na primeira tarefa** (proposta do agente, aprovada pela pessoa em 2026-11-12: "sim").
  O idioma vira pergunta da entrevista e o parágrafo do projeto vira proposta, na mesma parada da spec.
  Rejeitado: deixar a cargo da sessão, como antes (a `novo` não perguntou; a `novo2` perguntou).
- **Meio-termo: sem verificador por fatia** (decisão da pessoa, 2026-11-12: "aprovado o meio termo"). Fica o
  `test-author` por fatia, que é barato, e o verificador só no fim. Substitui o "Verificador ao fim de cada
  fatia" de 2026-11-11 e o limite de duas rodadas. Rejeitado: só roteamento e entrevista, sem `test-author`; manter
  o verificador por fatia (`harness-v2`), que fica como alternativa a medir.
- **No máximo duas rodadas de verificador por fatia** (decisão da pessoa, 2026-11-12, na branch `harness-v2`:
  "de resto aceito"). Substitui, no número de rodadas, a resposta "Espera e corrige" de 2026-11-11: a fatia
  seguinte continua esperando, mas não por uma terceira rodada. Rejeitado: rodadas sem limite, como na `novo2`;
  verificador por fatia em segundo plano.
- **Relatórios curtos do `test-author` e do `acceptance-verifier`** (proposta do agente, aprovada pela pessoa
  em 2026-11-12). Rejeitado: cortar também o detalhe de **falhou**, que a sessão precisa para corrigir.
- **Portões rápidos na iteração, todos antes do commit** (decisão da pessoa, 2026-11-12). Rejeitado: commit
  no meio da fatia só com os rápidos.
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

Critérios 1 a 39 conferidos, menos os substituídos (12, 14, 15, 21 a 24); nenhum **falhou** do `acceptance-verifier`; todos os portões com código de saída 0.

### Feito vs pendente

- [x] Fatia 1: agents, nível no roteamento, manifest.
- [x] Fatia 2: seção "Como trabalhar" e reescrita da `/k0d3r-task`.
- [x] Fatia 3: rules, tabelas de etapas, manifest.
- [x] Fatia 4: READMEs, docs de `implemented/` conferidos, backlog, conferência por contexto limpo e ensaio.

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

- [x] Fatia 5 (seção 5, critérios 12 a 15): command, `acceptance-verifier.md`, `agents.md`, tabelas Construir,
      seção 3 do `feature-lifecycle.md`, template de spec; conferência por contexto limpo.

Resultado da conferência da fatia 5, por um `acceptance-verifier` novo: critérios 12 a 15 vistos funcionando,
por leitura e busca (a igualdade das linhas Construir, por comparação de strings, com o controle de que a linha
antiga difere). Nenhum **falhou**. Ele listou o que o diff trazia e esta spec não dizia: o inventário e a nota do
manifest, o caso de borda "diga isso e pare" do agent e a falta da exceção "fatia sem critério" na seção 3 do
`feature-lifecycle.md`. Os dois primeiros entraram na tabela de contratos, o terceiro na seção 5, e a exceção
entrou no `feature-lifecycle.md`.

- [x] Fatia 6 (seção 6, critérios 16 a 20): command, `test-author.md`, `agents.md`, `testing.md`,
      `development-workflow.md`, `verification.md`, tabela de portões e linhas Construir, seções 0 e 3 do
      `feature-lifecycle.md`, inventário, manifest; conferência por contexto limpo.

Resultado da conferência da fatia 6, por um `acceptance-verifier` novo: critérios 16 a 20 vistos funcionando,
por leitura e busca (a linha Construir por comparação de strings, com controle; a frase antiga "before the
session writes any code" ausente em HEAD e presente em b88546b). Nenhum **falhou**. O que ele listou fora da
spec entrou nela: o `README.md` da raiz e a seção 3 na tabela de contratos, os dois casos de borda do
`test-author.md` na seção 6. Também alinhados: a nota do manifest do `agents.md` e três frases que ainda diziam
"antes do código" sem a fatia (`agents.md`, duas; `k0d3r-task.md`, uma). A ressalva dele, de que o texto do
`CLAUDE.md` e do command não tinha a palavra "só" que o critério 19 usa, foi resolvida acrescentando a palavra.

- [ ] Fatia 12 (seção 12, critérios 36 a 39): command, `sync-ecc-tools.md`, gatilho, linhas Dia zero e Iniciar,
      seções 0 e 2 do `feature-lifecycle.md`, os dois READMEs, `ecc-sync.md`, template de spec; conferência por
      contexto limpo.
- [x] Fatia 11 (seção 11, critérios 32 a 35): command, os dois agents, `agents.md`, `audit-docs.md`, regras de
      feature parcial e da `/k0d3r-task`, "spec × delta", backlog do projeto; conferência por contexto limpo.

Resultado da conferência da fatia 11, por um `acceptance-verifier` novo (base `4ccd685`): critérios 33 a 35
vistos funcionando, por leitura e busca; o 32 também, com uma ressalva: o command abria uma exceção à regra "sem
entrevista" ("salvo uma pergunta que mude a via"), que a pessoa não aprovou. A exceção saiu: se a via não está
clara, a sessão desce uma. Ele também apontou a `description` do command e a linha do inventário, que ainda
diziam só "sem efeito de comportamento passa sem spec"; as duas citam as vias agora. Não conferido: as vias numa
tarefa real.

- [x] Fatia 10 (seção 10, critérios 30 e 31): command, gatilho, linhas Dia zero, seção 0 do
      `feature-lifecycle.md`, `README.md`; conferência por contexto limpo.

Resultado da conferência da fatia 10, por um `acceptance-verifier` novo (base `8185305`): critérios 30 e 31
vistos funcionando, por leitura e por `diff` das duas linhas Dia zero. Fora dos critérios, ele listou o checklist do
`README.md`, que está na tabela de contratos da seção 10. Não conferido: o dia zero numa primeira tarefa real.

- [x] Fatia 9 (seção 9, critérios 27 a 29): command, `acceptance-verifier.md`, `agents.md`,
      `feature-lifecycle.md`, linhas Construir, inventário, template de spec, manifest; conferência por
      contexto limpo.

Resultado da conferência da fatia 9, por um `acceptance-verifier` novo (base `4538bc0`): critérios 27 a 29
vistos funcionando, por leitura e busca, nada no diff fora da spec. Uma observação dele, que não se confirmou: a
tabela do `agents.md` ainda diria "at the end of each slice"; no disco, a linha diz "once over the whole spec".
Não conferido: o meio-termo numa tarefa real.
- [x] Fatia 8 (seção 8, critérios 24 a 26): command, `feature-lifecycle.md`, linhas Construir, os dois agents;
      conferência por contexto limpo.

Resultado da conferência da fatia 8, em duas rodadas: na primeira, os critérios 25 e 26 vistos funcionando e o
24 **falhou**, porque a seção 3 do `feature-lifecycle.md` não dizia que a entrega continua sem nenhum
**falhou**. Corrigido, junto com a linha da seção 8 na tabela de contratos. Na segunda, por um verificador novo:
critérios 24 a 26 vistos funcionando, por leitura e busca, nada fora da spec. Os dois verificadores rodaram em
Opus: a sessão tinha carregado a definição antiga do agent. Não conferido: o limite de rodadas, os relatórios
curtos e o verificador em Sonnet numa tarefa real; fica para a próxima corrida.
- [x] Fatia 7 (seção 7, critérios 21 a 23): command, gatilho da `## Stack`, linhas Dia zero e Iniciar, seções 0
      e 2 do `feature-lifecycle.md`, `ecc-sync.md`, `README.md`; conferência por contexto limpo.

Resultado da conferência da fatia 7, por um `acceptance-verifier` novo: critérios 21 a 23 vistos funcionando,
por leitura e busca (as linhas Dia zero e Iniciar iguais nas duas tabelas, com controle; toda ocorrência de
`--adopt` nesses lugares vem com "passo da pessoa", "rodado pela pessoa" ou "só avisa"). Nenhum **falhou**.
Ressalvas dele, resolvidas: a lista da PARADA ganhou a linha da adoção pendente, que antes ficava só na Etapa 1;
a linha Iniciar, o `ecc-sync.md` e o `README.md` passaram a dizer "fora da tarefa" ao pé da letra. O que ele
listou fora da spec entrou na seção 7: o `conferido-em` do `ecc-sync.md`, a primeira tarefa preenchendo a
`## Stack` e as linhas de portões no gatilho.

Resultado da conferência final, por um `acceptance-verifier` novo, sobre a spec inteira (base `82696c0`):
critérios 1 a 9 e 11 a 23 vistos funcionando, nenhum **falhou**, nada no diff fora da spec. O critério 10 (o
ensaio) ficou **não conferido** de novo, porque não deixa registro no repositório. Ressalvas dele: o critério 9
só tem como prova a própria rodada; os critérios 12 a 20 foram conferidos pelo texto, e o efeito numa tarefa
real fica para a próxima corrida. Uma observação dele foi aplicada: o parágrafo de adoção do `.claude/README.md`
passou a dizer que quem roda o `--adopt` é a pessoa, fora da tarefa.
