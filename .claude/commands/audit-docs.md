---
description: Auditoria intencional de docs — escolhe pelo docs-check stale os docs desatualizados ou nunca conferidos, confere cada um contra o código com um subagente, relê uma amostra, para para aprovação e só então corrige os docs e atualiza o conferido-em.
argument-hint: "[<área> | <caminho do doc> | <caminho>#<seção>] [--limite N]"
---

# Auditoria de docs

**Entrada:** $ARGUMENTS

| Entrada | Alvos |
| --- | --- |
| vazia | os 5 docs mais desatualizados do repositório |
| `<área>` (ex.: `produto`) | os desatualizados da área, até 5 |
| `<caminho do doc>` | só aquele doc |
| `<caminho>#<seção>` | só aquela seção (para doc com mais de ~800 linhas) |
| `--limite N` | até N alvos, no máximo 10 |

O mecanismo e o significado de `codigo:` e `conferido-em:` estão em
[`verificacao-de-docs.md`](../../docs/implemented/processo/verificacao-de-docs.md); as regras de escrita, em
[`docs-writing.md`](../rules/common/docs-writing.md).

## Limites

- **Nunca altera código.** Uma divergência que pede mudança de código vira spec em `planned/`.
- **Nunca gradua** spec nenhuma.
- **Não reescreve seções `Decisões`.**
- **Não cita texto de interface que não leu no código.**
- **No máximo 10 docs por rodada.**

## Etapa 0 — Seleção (somente leitura)

Rode `node scripts/docs-check/docs-check.mjs stale` (com `--area <área>` no modo área e `--json` se precisar dos
detalhes). Mostre os alvos, cada um com o motivo ("código alterado em N commits desde AAAA-MM-DD" ou "nunca
conferido") e o tamanho em linhas.

## Etapa 1 — Conferência, um subagente por doc, somente leitura

Use um subagente nativo (`Explore` ou `general-purpose`), **um por doc**, para não estourar o contexto da sessão
principal. O brief manda ler o doc e o código, não editar nada, e devolver a tabela das **afirmações de
comportamento** do doc (seções `Decisões` ficam fora):

| Classe | Significado | Proposta |
| --- | --- | --- |
| Confirmada | O código faz o que o doc diz | Cita `arquivo#símbolo` e um trecho curto |
| Divergente | O código faz outra coisa | Corrigir o doc, **ou** spec em `planned/` se o código contraria uma decisão registrada |
| Sem evidência | Ninguém acha onde isso acontece | Remover a frase ou apontar a âncora |
| Ainda não existe | Comportamento futuro num doc de `implemented/` | Mover o trecho para uma spec em `planned/` |

O subagente também sugere o `codigo:` do doc, com os arquivos que precisou abrir.

## Etapa 2 — Checagem da sessão principal

O relatório do subagente não é evidência:

- rode `node scripts/docs-check/docs-check.mjs links` para confirmar as âncoras citadas;
- releia pessoalmente **uma afirmação "confirmada" de cada doc**, por amostragem, abrindo o arquivo e o símbolo.
  Se a amostra falhar, o doc volta para a conferência.

## Etapa 3 — Só no modo área: checagem cruzada

Compare as tabelas do lote. Um fato presente em mais de um doc vira proposta de **lar único**; contradições entre
docs viram pergunta.

## PARADA OBRIGATÓRIA — APROVAÇÃO DA AUDITORIA

Mostre a tabela resumo e as propostas:

| Doc | Confirmadas | Divergentes | Sem evidência | Ainda não existe | Proposta |
| --- | --- | --- | --- | --- | --- |

Depois:

1. Destaque as perguntas e decisões pendentes.
2. Peça explicitamente aprovação para aplicar as propostas apresentadas.
3. Encerre sua resposta e aguarde.

Não prossiga para a aplicação sem aprovação explícita.

Não interprete silêncio, esclarecimentos, continuidade da conversa ou aprovação de uma decisão isolada como autorização para aplicar.

Se forem solicitados ajustes, atualize as propostas e reapresente-as para aprovação.

## Etapa 4 — Aplicação, depois do sim

1. Edite os docs e crie as specs aprovadas em `planned/`.
2. Preencha o `codigo:` aprovado.
3. **Atualize o `conferido-em` só nos docs totalmente resolvidos.** Um doc com pergunta em aberto mantém a data e
   segue desatualizado.
4. Rode `node scripts/docs-check/docs-check.mjs links` e confirme exit 0.
5. Commit `docs: auditoria <alvo>`, com a tabela resumo na mensagem.
