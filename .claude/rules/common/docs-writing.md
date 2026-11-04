---
paths:
  - "docs/**/*.md"
---

# Escrita de docs — regras locais (obrigatórias)

> Regra local do projeto. O mecanismo (frontmatter, `docs-check`, hook, `/audit-docs`) está em
> [`verificacao-de-docs.md`](../../../docs/implemented/processo/verificacao-de-docs.md); aqui ficam só as
> regras de quem escreve.

## Frontmatter: o que `codigo:` e `conferido-em:` querem dizer

- `codigo:` (opcional) lista os arquivos que o doc descreve. Sem ele, valem os caminhos citados no texto.
- `conferido-em: AAAA-MM-DD` quer dizer **só** "o código citado não mudou desde esta data". **Não** quer
  dizer "o doc está certo". É data, não SHA, para sobreviver a squash e rebase.
- `docs-check: ignore` marca **só templates**: tira o doc do `diff`, do `stale` e da linha do hook. A spec
  copiada de um template **apaga** a chave. Os `README.md` de pasta ficam fora por regra, sem a chave.

## Resolver um doc ligado ao código alterado

O `docs-check diff` lista os docs ligados ao código que a branch mudou. Resolver cada um é **atualizá-lo ou
conferi-lo, e mudar o `conferido-em`** para a data da conferência. Um doc com `conferido-em` de hoje já conta
como resolvido, esteja ou não no diff: confira-o mesmo assim, porque o `docs-check` não vê mudança de código
feita no mesmo dia da conferência. Quando a conferência não muda nada, a
tabela da entrega diz "conferido, sem mudança: <o que foi olhado>". Mudar a data sem olhar o código é
falsificar o registro.

## Como escrever

- **Um fato mora num doc só**; os outros linkam para ele.
- **Cite caminho e símbolo** (`scripts/x.mjs#funcao`), nunca número de linha.
- **Texto de interface só entre aspas se foi lido no código.**
- **Afirmação negativa diz onde se procurou** ("o script de deploy não lê `FOO`", não "`FOO` não existe").
- **Relatório de agente não é evidência**: releia o diff do doc antes de commitar.
- **Comportamento futuro não fica em `implemented/`**: vai para uma spec em `planned/`.

## O que não fazer

- Não reescreva o doc para legitimar um possível bug: registre a divergência e pergunte.
- Não junte nem apague linhas de tabela.
- Não reescreva uma seção `Decisões` sem pedido.
