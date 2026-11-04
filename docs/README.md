# Mapa da documentação

Este é um repositório **docs-first**: a spec lidera, e a **pasta de ciclo de vida** de cada spec declara a
distância entre spec e código ([`../CLAUDE.md`](../CLAUDE.md), diretiva principal).

## Organizado por ciclo de vida × área

A própria árvore de pastas é o índice. O primeiro nível é o estado do código; o segundo, a área:

| Estado | Significado |
| --- | --- |
| [`implemented/`](implemented/README.md) ✅ | Verdadeiro e alcançável agora, mais o corpus estável que o sustenta (decisões aceitas, runbooks, templates). |
| [`in-progress/`](in-progress/README.md) 🚧 | **Vazia entre sprints**; guarda uma spec só enquanto a feature está em código. |
| [`planned/`](planned/README.md) 🔲 | Spec à frente do código: o backlog docs-first (inclui o construído mas não alcançável). |

| Área | O que entra |
| --- | --- |
| `arquitetura/` | Sistema, stack, dados, infraestrutura e decisões técnicas. |
| `produto/` | Features, regras de negócio, telas e fluxos. |
| `processo/` | Workflow, toolset `.claude/`, runbooks e contribuição. |

As três pastas de estado têm sempre as mesmas áreas, cada uma com um `README.md` que diz o que entra e o que não
entra. Um doc mantém o mesmo caminho relativo ao trocar de estado: a graduação é sempre
`git mv docs/<estado>/<área>/x.md docs/<novo-estado>/<área>/x.md`.

**Áreas extras** (ex.: `conformidade/` para obrigações legais, `apendices/` para glossário) são opcionais. Crie
uma quando um assunto não couber nas três áreas padrão e for crescer além de um doc, e crie-a **nas três pastas
de estado ao mesmo tempo**, cada uma com o seu `README.md`, para o caminho relativo continuar estável.

Fora do ciclo de vida só existe [`references/`](references/README.md): **material-fonte** sem estado de build
(dados brutos, documentos recebidos, arquivos de marca). Nada ali descreve comportamento do sistema; o que
descreve vai para uma das três pastas de estado.

## Ordem de leitura

1. [`../CLAUDE.md`](../CLAUDE.md) — acordo de trabalho, stack, portões de verificação, workflow.
2. [`vision-and-scope.md`](vision-and-scope.md) — produto, usuários, princípios, escopo.
3. A árvore `implemented/` · `in-progress/` · `planned/` — o que está feito e o que está por fazer.

## Para onde vai um doc novo?

- **Spec de feature** → comece pelo [`implemented/processo/feature-spec-template.md`](implemented/processo/feature-spec-template.md)
  e coloque-a pelo estado do código: não construída ou não alcançável → `planned/produto/`; em código agora →
  `in-progress/produto/`; entregue de ponta a ponta → `implemented/produto/`.
- **Mudança na forma do sistema** (serviço novo ou aposentado, fronteira, protocolo, banco) → o doc de
  `arquitetura/` correspondente, no mesmo PR.
- **Decisão técnica** → a seção **Decisões** do doc de arquitetura ou de produto que ela afeta, no mesmo PR
  (o quê, por quê, alternativa rejeitada; 2 a 6 linhas). Sem ADRs, sem ledger, sem numeração.
- **Processo, runbook, toolset `.claude/`** → `processo/`.
- **Convenções e workflow** → [`../CLAUDE.md`](../CLAUDE.md).

> Quando o estado do código de uma feature muda, **mova a spec para a pasta correspondente** no mesmo PR. Uma
> spec na pasta errada, ou um doc `implemented/` que afirma comportamento ainda não construído, é um defeito. O
> processo completo é a [`feature-lifecycle.md`](../.claude/rules/common/feature-lifecycle.md).

## Idioma

<idioma dos docs> nos docs (fonte única, sem cópia paralela em outro idioma); a regra de idioma do código está
em **Convenções** no [`../CLAUDE.md`](../CLAUDE.md).
