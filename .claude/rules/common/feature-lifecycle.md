---
paths:
  - "docs/**/*.md"
---

# Ciclo de vida da feature — planned → in-progress → implemented

Processo canônico deste repositório docs-first. É o detalhe operacional da diretiva docs-first do
[`CLAUDE.md`](../../../CLAUDE.md), que guarda só um resumo e aponta para cá.

## Invariante

A **pasta de ciclo de vida é a fonte única do estado de build**, e quem decide é o **sistema rodando**, não o
log de build:

- `docs/implemented/<área>/` — entregue **e alcançável de ponta a ponta** (o usuário chega lá por um caminho
  real), não apenas "o código existe e os testes unitários passam".
- `docs/in-progress/<área>/` — em código **agora**; **vazia entre sprints**.
- `docs/planned/<área>/` — à frente do código (inclui o construído mas ainda não alcançável).

Um doc na pasta errada, ou um doc em `implemented/` que afirma comportamento que o código ainda não tem, é um
defeito. **Feature parcial é dividida, nunca estacionada**: a parte construída e alcançável vai para
`implemented/`, o resto vira spec em `planned/`. Não há painel de status: a árvore de pastas é o estado.

Um doc mantém o mesmo caminho relativo ao trocar de estado:
`git mv docs/<estado>/<área>/x.md docs/<novo-estado>/<área>/x.md`.

## As etapas e as peças do toolset

| Etapa | O que acontece | Peça |
| --- | --- | --- |
| Dia zero | Stack detectada, `## Stack` e tabela de portões preenchidas pela primeira tarefa; a adoção dos pacotes do ECC é um passo da pessoa, fora da tarefa, com confirmação | gatilho do CLAUDE.md; `/sync-ecc-tools --adopt` e `catalog.json`, rodados pela pessoa |
| Pesquisar | Antes de escrever código ou adotar dependência: existe pronto? qual a API atual? | `search-first`, `documentation-lookup`, agent `docs-lookup` |
| Especificar | Investigação, entrevista (uma pergunta por vez, só o que o repositório não responde) e spec nova em `docs/planned/<área>/` a partir do `feature-spec-template.md` | `/k0d3r-task`, agent `planner` (e `architect` se mexer na forma do sistema) |
| Iniciar | `git mv` para `docs/in-progress/<área>/`; plano de build dentro da spec; aprovação humana antes do código; se a stack muda, `## Stack` no mesmo commit e aviso de adoção pendente | `planner`, `/feature-dev`; `/sync-ecc-tools --adopt`, rodado pela pessoa, fora da tarefa |
| Construir | Fatia por fatia até o fim. Em cada uma: testes primeiro, escritos por um agent de contexto limpo a partir só da spec, antes do código da fatia; só os portões "na iteração" enquanto ajusta; todos antes do commit, com commit e push por fatia; com mais de uma fatia, os critérios de cada uma conferidos por um agent de contexto limpo antes da seguinte, em até duas rodadas | agents `test-author` e `acceptance-verifier`, `tdd-workflow`, skills de stack adotadas; agent `tdd-guide` fora da `/k0d3r-task` |
| Verificar | Portões do CLAUDE.md, sem mascarar exit code, incluindo o `docs-check diff` (docs ligados ao código alterado, resolvidos) e o `docs-check links`; depois, cada critério de aceite conferido por um agent de contexto limpo | `verification-loop`, `docs-check diff`, agent `acceptance-verifier` |
| Revisar | Revisão do diff; segurança quando tocar auth, entrada de usuário ou segredo | `/code-review`, agents `code-reviewer`, `security-reviewer`, `silent-failure-hunter`, reviewers de stack adotados |
| Graduar | Só com aprovação humana explícita na sessão: `git mv` para `docs/implemented/<área>/`, frontmatter com `conferido-em`, aparar as seções de plano, atualizar docs | agent `doc-updater`, `/update-docs` |
| Encerrar | Commit, PR só se pedirem; retro do toolset, com o lembrete de sync e a consulta ao catálogo antes do backlog | `conventional-commit-review`, `pr-body`, `/toolset-retro` |
| Manter o toolset | Atualizar os itens adotados, regenerar o catálogo, ver candidatos novos; podar o que pesa | `/sync-ecc-tools`, `context-budget`, `/security-scan` |
| Manter os docs | Conferir contra o código os docs desatualizados ou nunca conferidos | `/audit-docs`, `docs-check stale` |

A **`/k0d3r-task`** conduz uma tarefa inteira, de Especificar a Encerrar: investigação, entrevista, spec, **uma
parada para aprovação**, testes por agent de contexto limpo, implementação até o fim, verificação e entrega.
Mudança sem efeito de comportamento passa por ela sem spec. O que dispensa aprovação e o que a pede está na
seção **Como trabalhar** do [`CLAUDE.md`](../../../CLAUDE.md).

Sessões longas: `strategic-compact` (com hook) sugere `/compact` nas fronteiras de fase. Escreva o estado
(a spec, o checklist) em arquivo antes de compactar.

## 0. Dia zero

Se a seção `## Stack` do `CLAUDE.md` estiver vazia ou não refletir os arquivos do repositório, antes da primeira
tarefa de código: detecte a stack, proponha o texto da seção e as linhas da tabela "Portões de verificação" (com
a coluna "Quando": "na iteração" para os portões rápidos, "antes do commit" para os lentos). A adoção dos itens
do ECC é um passo da pessoa, fora da tarefa (`/sync-ecc-tools --adopt`): a `/k0d3r-task` só avisa que ela está
pendente. Nada é adotado sem confirmação humana.

## 1. Pesquisar e especificar

Antes de escrever código ou adotar dependência, pesquise o que já existe (`search-first`) e a API atual da
biblioteca (`documentation-lookup` / `docs-lookup`, via Context7). Depois de investigar, pergunte à pessoa o
que o repositório não responde: uma pergunta por vez, começando pelas que mudariam a forma de construir. A spec
nova nasce em
`docs/planned/<área>/` a partir do
[`feature-spec-template.md`](../../../docs/implemented/processo/feature-spec-template.md), com o agent `planner`
(e o `architect` quando a mudança mexe na forma do sistema: um serviço novo, uma fronteira, um protocolo).

## 2. Iniciar — mover planned → in-progress

`git mv docs/planned/<área>/<nome>.md docs/in-progress/<área>/<nome>.md` e conserte os links que a mudança
quebrou. "Montar o plano de uma spec planejada" **é** começar: faça este passo, não deixe a spec em `planned/`.

Escreva o plano de build **dentro da própria spec**, sem roadmap ou handoff separado (`planner`, `/feature-dev`):
escopo e fatias verticais; definição de pronto (os portões do `CLAUDE.md` verdes, testes da fatia); decisões e
questões abertas; um checklist "feito vs pendente". Marque essas seções como **seções de plano** (são aparadas
na graduação). **Aprovação humana antes do código.**

**Se a spec introduz linguagem, framework, banco ou serviço novo**, atualize a `## Stack` do `CLAUDE.md` no mesmo
commit do `git mv` e avise que a adoção das peças do ECC da stack nova está pendente: ela é um passo da pessoa,
fora da tarefa (`/sync-ecc-tools --adopt`).

## 3. Construir — commit e push por fatia

Testes primeiro: na `/k0d3r-task`, o agent `test-author` escreve os testes que falham a partir só da spec
aprovada, de uma vez numa tarefa de uma fatia e no começo de cada fatia nas outras, e a sessão espera por ele
antes de escrever o código que eles cobrem e implementa até ficarem verdes (`tdd-workflow`, skills de stack adotadas); fora dela, a
própria sessão conduz o ciclo, com o `tdd-guide`. Depois da aprovação, a sessão segue até a entrega e só volta a
parar se o comportamento, o contrato ou o escopo aprovados tiverem de mudar. Commit por
fatia e **push depois de cada commit**, tudo na branch única da sessão (Conventional Commits, ver
[`git-workflow.md`](./git-workflow.md)), e só com todos os portões verdes ([`verification.md`](./verification.md));
durante a fatia, rodam só os portões "na iteração".
Mantenha o checklist do plano honesto conforme as fatias entram.

Numa tarefa com mais de uma fatia, o plano diz quais critérios de aceite cada fatia entrega. Ao fim de cada
fatia com critério ligado, menos a última, um `acceptance-verifier` novo confere os critérios dela, recebendo só a spec, a ref base
da fatia e o nome da fatia. A fatia seguinte espera, em no máximo duas rodadas: o que ainda falha na segunda é
corrigido e commitado sem nova rodada e fica anotado no plano. O verificador final confere a spec inteira, e a
entrega continua sem nenhum "falhou".

## 4. Verificar e revisar

Rode os portões da tabela do `CLAUDE.md` com `verification-loop`, sem mascarar exit code. O `docs-check diff`
lista os docs ligados ao código que a branch mudou: resolva cada um, atualizando-o ou conferindo-o e mudando o
`conferido-em` ([`docs-writing.md`](./docs-writing.md)); ele e o `docs-check links` saem com 0. Revise o diff com
`/code-review` e o agent `code-reviewer`; use `security-reviewer` quando o diff tocar auth, entrada de usuário ou
segredo, `silent-failure-hunter` nos caminhos de erro, e os reviewers da stack que o projeto adotou. Com os
portões verdes, o agent `acceptance-verifier` confere cada critério de aceite com contexto limpo: recebe só a
spec e a ref base do diff, e devolve, por critério, "visto funcionando", "falhou" ou "não conferido".

## 5. Graduar — mover in-progress → implemented {#graduar}

**Portão humano: pergunte na sessão, não presuma.** A spec só gradua depois que a pessoa **aprova durante a
sessão** (na conversa, não por review de PR). O agente pergunta explicitamente (ex.: *"a fatia `<nome>` está
entregue e verde — aprova mover para `implemented/`?"*) e só age com um sim explícito; nunca se autogradua.
Até lá a spec fica em `in-progress/`. Então:

1. `git mv` da spec para `docs/implemented/<área>/<nome>.md`; a parte não construída sai como spec em
   `docs/planned/<área>/`. **Graduar exige o frontmatter preenchido**: `codigo:` (opcional) e `conferido-em` na
   data da graduação ([`verificacao-de-docs.md`](../../../docs/implemented/processo/verificacao-de-docs.md)).
2. **Apare as seções de plano** (escopo, fatias, definição de pronto, checklist, log de decisões), deixando a spec
   durável.
3. **Reescreva os docs que a mudança tocou**, no mesmo PR (`doc-updater`, `/update-docs`): os docs transversais
   de arquitetura, a seção **Decisões** de cada doc afetado e os READMEs das pastas se o contrato deles mudou.
4. Conserte todo link que as mudanças quebraram: zero link quebrado antes do push.

## 6. Encerrar

Commit com `conventional-commit-review`; PR só se a pessoa pedir, com o corpo do `pr-body`. Ao fim de uma sessão
substantiva, `/toolset-retro`: ele avisa quando o último sync com o ECC está velho e consulta o
`catalog.json` antes de mandar uma ferramenta faltante para o backlog.

## 7. Manter o toolset

`/sync-ecc-tools` atualiza os itens adotados, regenera o `catalog.json` e lista os candidatos novos;
`context-budget` mostra o que pesa no contexto; `/security-scan` audita o `.claude/`.

## 8. Manter os docs

O hook de abertura avisa quantos docs de `implemented/` têm código alterado desde a última conferência e quantos
nunca foram conferidos. A `/audit-docs` confere esses docs contra o código, para para aprovação e só então os
corrige ([`verificacao-de-docs.md`](../../../docs/implemented/processo/verificacao-de-docs.md)).

## Mudando uma feature já entregue {#spec-ou-delta}

A pergunta que decide:

> **Depois do merge deste PR, a spec em `implemented/` continua dizendo a verdade?**
> Sim (a mudança cabe num PR e a spec editada nele descreve exatamente o entregue) → edite a spec de
> `implemented/` no mesmo PR. Não (mais de um PR, ou decisões de produto em aberto) → spec delta em
> `planned/`; a spec implementada só muda quando o delta entrega.

**Onde fica a spec da tarefa.** No caso "editar a spec de `implemented/`", ela fica em
`docs/in-progress/<área>/<nome>.md` durante a tarefa; na entrega, o conteúdo é incorporado ao doc de
`implemented/` e o arquivo temporário é apagado, no mesmo PR. No caso delta, o ciclo é o normal
(`planned/` → `in-progress/` → `implemented/`).

## Decisões

Registre toda decisão técnica numa seção **Decisões** do doc de arquitetura ou de produto que ela afeta, no mesmo
PR (o quê / por quê / alternativa rejeitada, 2 a 6 linhas). Sem arquivos de ADR, sem ledger, sem numeração; o
porquê extenso vai na descrição do PR. Decisão substituída: edite a seção e anote a troca.

**Diga de quem é a decisão.** Uma decisão que uma pessoa tomou e uma que o agente *propôs* não são a mesma
coisa, e uma seção Decisões que mistura as duas transforma proposta em decisão. Até a pessoa dizer sim na
sessão, escreva a entrada como proposta e diga isso; só então reescreva como decisão. O custo de errar não é uma
linha errada num doc: é código construído sobre uma premissa que ninguém escolheu.

## Iniciativas grandes (vários docs, várias fases) {#iniciativas}

O ciclo acima trata uma feature por vez, com o plano dentro da spec. Uma **iniciativa transversal** (muitos docs,
muitas fases, várias sessões) usa um **roadmap dedicado na raiz de `docs/in-progress/`**:

1. O roadmap por fases é a **última seção** do documento: uma **tabela com checkbox e coluna de SHA do commit**,
   que cada sessão de implementação marca (⬜→✅).
2. **A primeira fase move e reescreve para o alvo** os docs que a iniciativa muda (se estão em `implemented/`, vão
   para `in-progress/` reescritos no estado-alvo). Em dois commits para o diff ficar limpo: (a) só o `git mv`;
   (b) as edições.
3. **Cada fase atualiza os docs que toca antes de fechar.**
4. **A última fase devolve os docs a `implemented/`, restaura todos os links e remove o roadmap.**
5. **Comentários no código citam a spec, nunca o roadmap**: o roadmap é apagado na última fase, e um comentário
   que aponta para ele vira ponteiro para nada.

Essa é a exceção explícita ao "sem roadmap separado"; uma feature isolada mantém o plano dentro da spec.
