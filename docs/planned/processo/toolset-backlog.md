# Backlog do toolset (melhorias planejadas do `.claude/`)

Melhorias adiadas do toolset de IA `.claude/`: a saída "guardada para depois" do
[`/toolset-retro`](../../../.claude/commands/toolset-retro.md). Quando uma é aplicada, a mudança chega no
toolset (rules, manifest, scripts) e a justificativa vai na mensagem de commit; não há log de feedback
permanente.

Antes de registrar "falta uma ferramenta para X", consulte o
[`catalog.json`](../../../.claude/ecc-sync/catalog.json): se o ECC já tem, o caminho é adotar com
`/sync-ecc-tools --adopt`, não escrever uma cópia local.

| Item | Por quê | Origem (retro de quando) |
| --- | --- | --- |
| **`report.mjs`: o `parseArgs` engole a flag seguinte.** `report --json --to 76aaa77d` grava um arquivo chamado `--to` (238 KB, medido numa cópia do template em 2026-11-04) e ignora o `--to`, usando o alvo padrão. Vale para qualquer `--flag` seguida de outra flag. | Saída gravada no lugar errado e alvo trocado em silêncio. Correção prevista: o `parseArgs` não consome um token que começa com `--` como valor, com teste; e decidir se `--json` sem valor imprime no stdout. Vai ser a primeira `/k0d3r-task` real. | Dry-run da `/k0d3r-task`, 2026-11-04 |
