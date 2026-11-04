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
| Dia zero | Stack detectada, `## Stack` preenchida, pacotes do ECC propostos e adotados com confirmação | gatilho do CLAUDE.md, `/sync-ecc-tools --adopt`, `catalog.json` |
| Pesquisar | Antes de escrever código ou adotar dependência: existe pronto? qual a API atual? | `search-first`, `documentation-lookup`, agent `docs-lookup` |
| Especificar | Spec nova em `docs/planned/<área>/` a partir do `feature-spec-template.md` | agent `planner` (e `architect` se mexer na forma do sistema) |
| Iniciar | `git mv` para `docs/in-progress/<área>/`; plano de build dentro da spec; aprovação humana antes do código; se a stack muda, `## Stack` + `--adopt` no mesmo commit | `planner`, `/feature-dev`, `/sync-ecc-tools --adopt` |
| Construir | Fatia por fatia, testes primeiro onde couber, commit e push por fatia | `tdd-workflow`, agent `tdd-guide`, skills de stack adotadas |
| Verificar | Portões do CLAUDE.md, sem mascarar exit code | `verification-loop` |
| Revisar | Revisão do diff; segurança quando tocar auth, entrada de usuário ou segredo | `/code-review`, agents `code-reviewer`, `security-reviewer`, `silent-failure-hunter`, reviewers de stack adotados |
| Graduar | Só com aprovação humana explícita na sessão: `git mv` para `docs/implemented/<área>/`, aparar as seções de plano, atualizar docs | agent `doc-updater`, `/update-docs` |
| Encerrar | Commit, PR só se pedirem; retro do toolset, com o lembrete de sync e a consulta ao catálogo antes do backlog | `conventional-commit-review`, `pr-body`, `/toolset-retro` |
| Manter o toolset | Atualizar os itens adotados, regenerar o catálogo, ver candidatos novos; podar o que pesa | `/sync-ecc-tools`, `context-budget`, `/security-scan` |

Sessões longas: `strategic-compact` (com hook) sugere `/compact` nas fronteiras de fase. Escreva o estado
(a spec, o checklist) em arquivo antes de compactar.

## 0. Dia zero

Se a seção `## Stack` do `CLAUDE.md` estiver vazia ou não refletir os arquivos do repositório, antes da primeira
tarefa de código: detecte a stack, proponha o texto da seção e as linhas da tabela "Portões de verificação", e
rode `/sync-ecc-tools --adopt`. Nada é adotado sem confirmação humana.

## 1. Pesquisar e especificar

Antes de escrever código ou adotar dependência, pesquise o que já existe (`search-first`) e a API atual da
biblioteca (`documentation-lookup` / `docs-lookup`, via Context7). A spec nova nasce em
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
commit do `git mv` e rode `/sync-ecc-tools --adopt` para propor as peças do ECC da stack nova.

## 3. Construir — commit e push por fatia

Testes primeiro onde couber (`tdd-workflow`, `tdd-guide`), usando as skills de stack adotadas. Commit por
fatia e **push depois de cada commit**, tudo na branch única da sessão (Conventional Commits, ver
[`git-workflow.md`](./git-workflow.md)), e só com todos os portões verdes ([`verification.md`](./verification.md)).
Mantenha o checklist do plano honesto conforme as fatias entram.

## 4. Verificar e revisar

Rode os portões da tabela do `CLAUDE.md` com `verification-loop`, sem mascarar exit code. Revise o diff com
`/code-review` e o agent `code-reviewer`; use `security-reviewer` quando o diff tocar auth, entrada de usuário ou
segredo, `silent-failure-hunter` nos caminhos de erro, e os reviewers da stack que o projeto adotou.

## 5. Graduar — mover in-progress → implemented {#graduar}

**Portão humano: pergunte na sessão, não presuma.** A spec só gradua depois que a pessoa **aprova durante a
sessão** (na conversa, não por review de PR). O agente pergunta explicitamente (ex.: *"a fatia `<nome>` está
entregue e verde — aprova mover para `implemented/`?"*) e só age com um sim explícito; nunca se autogradua.
Até lá a spec fica em `in-progress/`. Então:

1. `git mv` da spec para `docs/implemented/<área>/<nome>.md`; a parte não construída sai como spec em
   `docs/planned/<área>/`.
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

## Mudando uma feature já entregue

**Mudança pequena**: edite a spec implementada no mesmo PR do código, sem spec intermediária. **Mudança grande ou
reescrita**: abra uma spec delta em `planned/` e rode o ciclo normal (a spec implementada continua sendo a
verdade viva até o delta graduar e ser incorporado a ela).

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
