---
codigo:
  - scripts/docs-check/docs-check.mjs
  - scripts/hooks/toolset-staleness.mjs
  - .claude/commands/audit-docs.md
  - .claude/rules/common/docs-writing.md
conferido-em: 2026-11-04
---

# Verificação de docs

Como o projeto mantém os docs de `docs/implemented/` ligados ao código que descrevem e acha os que
ficaram para trás. As regras de quem escreve estão em
[`docs-writing.md`](../../../.claude/rules/common/docs-writing.md).

## Frontmatter

```yaml
---
codigo:
  - caminho/relativo/arquivo.ext
conferido-em: AAAA-MM-DD
---
```

- `codigo:` é opcional: os arquivos que o doc descreve. Sem ele, valem os caminhos citados no texto.
- `conferido-em:` quer dizer só "o código citado não mudou desde esta data", não "o doc está certo".
- Um doc se liga ao código pelo `codigo:` e pelos caminhos do repositório que cita no texto (com ou sem
  `#símbolo`, dentro ou fora de crase). Só contam caminhos que o `git ls-files` conhece, comparados inteiros,
  nunca por nome base. Arquivos sob `docs/` não são código. Os `README.md` das pastas são índices e ficam de
  fora por regra; um template marca `docs-check: ignore` no frontmatter e fica fora do `diff`, do `stale` e da
  linha do hook (a cópia dele não mantém a chave).

## O script `scripts/docs-check/docs-check.mjs`

| Modo | O que faz | Saída |
| --- | --- | --- |
| `links` | Links markdown relativos resolvem (com âncora); caminhos de `codigo:` existem; o `#símbolo` citado aparece no arquivo fora das linhas de comentário | exit 1 com a lista de problemas |
| `diff [--base <ref>]` | Código alterado na branch desde a base (padrão `origin/main`, senão `main`; na própria base, só o working tree) mais o working tree, inclusive não rastreado. Lista os docs de `implemented/` e `in-progress/` ligados a ele. Um doc está resolvido se o `conferido-em` já é a data de hoje (esteja ou não no diff), ou se mudou no diff **e** o `conferido-em` mudou | exit 1 com os não resolvidos, no formato "doc ← arquivos" |
| `stale [--area <área>] [--limit N] [--json]` | Para cada doc de `implemented/`: desatualizado se um arquivo ligado teve commit (data de **commit**, não de autor) depois do `conferido-em`; "nunca conferido" sem a data; também os caminhos de `codigo:` que não existem | relatório, exit 0 |

O símbolo é buscado como texto: um símbolo que sobrou só dentro de uma string passa. As linhas de
comentário (`//`, `#`, `--`, `*`, `/* … */`) são ignoradas. O `stale` lê a história numa passada só de
`git log --name-only`.

## Onde cada peça age

- **Gate:** `docs-check diff` e `docs-check links` estão na tabela de portões do `CLAUDE.md`. A sessão que
  mexe no código resolve os docs ligados a ele no mesmo PR, e a `/k0d3r-task` exige os dois com exit 0.
- **Hook de abertura:** `scripts/hooks/toolset-staleness.mjs` imprime, depois da linha do sync, uma linha
  "docs: X com código alterado desde a última conferência, Y nunca conferidos (/audit-docs)" quando há o que
  dizer. Com erro, sem git ou acima de 2 s, fica calado; nunca bloqueia a sessão.
- **`/audit-docs`:** a auditoria intencional. Escolhe os alvos pelo `stale`, confere cada doc com um
  subagente, relê uma amostra, para para aprovação e só então corrige e atualiza o `conferido-em`
  ([`audit-docs.md`](../../../.claude/commands/audit-docs.md)).

## O que garante × o que não garante

| Garante | Não garante |
| --- | --- |
| A sessão que mexe no código resolve os docs ligados a ele, no mesmo PR | Que a conferência foi bem feita |
| Todo doc tem uma data de última conferência visível | Detectar doc que não cita o código e não tem `codigo:` |
| O desatualizado aparece na abertura da sessão e entra na auditoria | Que alguém rode a auditoria |
| | Mudanças de código feitas no mesmo dia da conferência de um doc não são detectadas, nem pelo `diff` nem pelo `stale`; a defesa é a busca de docs da `/k0d3r-task` e a tabela de docs do PR |
