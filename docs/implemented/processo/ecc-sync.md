---
codigo:
  - scripts/ecc-sync/report.mjs
  - scripts/ecc-sync/report.test.mjs
  - .claude/commands/sync-ecc-tools.md
  - .claude/ecc-sync/manifest.json
  - .claude/ecc-sync/catalog.json
  - CLAUDE.md
  - scripts/hooks/toolset-staleness.mjs
  - .claude/settings.json
  - .claude/commands/toolset-retro.md
  - .claude/skills/search-first/SKILL.md
conferido-em: 2026-11-12
---

# Mantendo o toolset `.claude/` em sincronia com o ECC

Os agents, skills, commands, rules e o hook de compact deste repositório vieram do **ECC** (`affaan-m/ECC`),
o upstream vivo. O ECC segue melhorando, e o projeto precisa de duas coisas sem atropelar as adaptações locais
(itens `adapt`) nem as ferramentas próprias (itens `local`):

- **puxar as atualizações** do que já adotou;
- **adotar** o que o ECC oferece para a stack do projeto, inclusive no dia zero, antes de qualquer sync.

É um processo **com humano no loop, conduzido por agente**: o Claude calcula e propõe, a pessoa aprova, o
Claude aplica e registra. Adotar é sempre decisão humana.

## Como funciona

- **Procedência (lockfile):** [`.claude/ecc-sync/manifest.json`](../../../.claude/ecc-sync/manifest.json). Cada
  item registra o `source` no ECC, a `policy` e o `lastSyncedRef` (o commit do ECC ao qual corresponde). Cada
  item `adapt` traz a nota **`adaptation`**, uma linha com *o que divergiu do upstream e por quê*; mantenha-a
  verdadeira ao portar à mão. Um item que colou código de outros arquivos do ECC lista esses arquivos em
  **`alsoTracks`**, e o relatório acompanha todas as origens: o `source` e cada arquivo do `alsoTracks` (no hook de compact, quatro).

  | policy  | significado | ação no sync |
  |---------|-------------|--------------|
  | `track` | espelho byte a byte do upstream | sobrescrever a partir do upstream quando mudar |
  | `adapt` | adaptado localmente | **nunca editar automaticamente**: portar à mão, com aprovação |
  | `local` | sem origem no ECC | pular |

- **Catálogo:** [`.claude/ecc-sync/catalog.json`](../../../.claude/ecc-sync/catalog.json). Todo item do ECC
  (skills, agents, commands, rules) no ref do manifest, com `name`, `type`, `description`, `source` e `adopted`.
  Ficam de fora só os itens da lista de exclusão por política (`POLICY_EXCLUSIONS` no `report.mjs`: hoje, os de
  saúde, healthcare/HIPAA); a mesma lista manda esses itens para a seção "Excluídos por política" do relatório. É o que o projeto sabe do ECC **sem clone**: o
  `/sync-ecc-tools --adopt`, o `search-first` e o `/toolset-retro` consultam o catálogo. Ele é determinístico
  (ordenado, sem timestamp) e é regenerado sempre que o `targetRef` avança.

- **Helper:** [`scripts/ecc-sync/report.mjs`](../../../scripts/ecc-sync/report.mjs), Node sem dependências, com
  testes em `node --test scripts/ecc-sync/report.test.mjs`. Subcomandos:

  | Subcomando | O que faz | Escreve |
  |---|---|---|
  | `report` | Classifica cada item (`update` / `review` / `drifted` / `unchanged` / `local` / `removed-upstream` / `missing-downstream`), mostra o diff de cada origem que mudou nos itens em revisão e lista **todos** os candidatos novos, separados entre "Ligados à sua stack" (casam com a `## Stack` do `CLAUDE.md`), "Outros" e "Excluídos por política" | nada (`--json` opcional) |
  | `catalog` | Gera o `catalog.json` a partir do clone do ECC no `targetRef` do manifest | o catálogo |
  | `inventory` | Resumo adotados × descartados × disponíveis | stdout, ou `--out` |
  | `bootstrap` | Recria o manifest a partir do `.claude/` (preserva `adaptation`, `alsoTracks` e itens fora do `.claude/`) | o manifest |

  Ele nunca escreve conteúdo dentro de `.claude/` além do manifest e do catálogo.

- **O workflow:** o command [`/sync-ecc-tools`](../../../.claude/commands/sync-ecc-tools.md), nos modos sync
  (padrão) e `--adopt`.

## Quando rodar

| Gatilho | Modo |
| --- | --- |
| Dia zero (a `## Stack` acabou de ser preenchida) | `/sync-ecc-tools --adopt`, rodado pela pessoa, fora da tarefa |
| Uma spec que muda a stack vai para `in-progress/` | `/sync-ecc-tools --adopt`, rodado pela pessoa, fora da tarefa, depois que a tarefa atualiza a `## Stack` |
| O hook de `SessionStart` (`toolset-staleness.mjs`) ou o `/toolset-retro` avisa que o último sync passou de `syncStaleDays` dias (campo do manifest) | `/sync-ecc-tools` |
| A retro acha uma ferramenta faltante que o catálogo tem | `/sync-ecc-tools --adopt` |
| A qualquer momento | `/sync-ecc-tools` |

## O alvo do sync: 14 dias

O alvo padrão é o **commit mais recente do `main` do ECC com pelo menos 14 dias** (`MIN_TARGET_AGE_DAYS` no
`report.mjs`), a mesma regra que vale para as versões fixadas de pacotes npm: um commit recente ainda pode ser
corrigido ou revertido no upstream. Sem `--to`, o `report`, o `inventory` e o `bootstrap` escolhem esse commit
(`git rev-list -1 --first-parent --before=<hoje − 14 dias> origin/main`), e o cabeçalho do relatório mostra a data
e a idade do alvo. Um alvo **mais novo** só entra por **escolha explícita da pessoa**, registrada nas notas da linha
do log; o cabeçalho do relatório marca esse caso com `[!]`.

## Executando um sync à mão

> **Use um clone completo, nunca raso.** O helper se recusa a rodar num clone raso; aprofunde antes com
> `git -C ../ECC fetch --unshallow`.

```bash
# 1. testes do classificador (leia o código de saída; sem pipe)
node --test scripts/ecc-sync/report.test.mjs > "$TMPDIR/ecc-sync-test.log" 2>&1; echo "EXIT: $?"
# 2. o que mudou no upstream para a fatia adotada, e os candidatos novos (alvo padrão: regra dos 14 dias)
node scripts/ecc-sync/report.mjs report --ecc ../ECC
# 3. depois de aplicar o que foi aprovado e avançar o targetRef no manifest
node scripts/ecc-sync/report.mjs catalog --ecc ../ECC
```

Depois rode `/sync-ecc-tools` e deixe o Claude planejar → confirmar → aplicar.

### Primeira vez / re-bootstrap

Se o manifest se perdeu ou o conjunto adotado mudou muito:

```bash
node scripts/ecc-sync/report.mjs bootstrap --ecc ../ECC
```

O bootstrap fixa cada item `track` no commit mais recente do ECC cujo conteúdo bate com a cópia local, marca
como `adapt` o que não bate com commit nenhum e como `local` o que não existe no upstream. Revise as policies
geradas antes de confiar nelas.

## Escopo e guardrails

- **No escopo:** ECC → o `.claude/` (e o hook vendorizado) deste repositório.
- **Fora do escopo:** adotar automaticamente, fazer merge automático de itens `adapt`.
- Ferramentas novas do upstream são **opt-in**: o relatório lista todas, o Claude propõe uma lista curta, a
  pessoa decide.
- **Modelo e esforço dos agents não vêm do upstream.** As linhas `model:` e `effort:` do frontmatter de cada
  agent são derivadas do `.claude/model-routing.json`. Depois de portar ou adotar um agent, o
  `/sync-ecc-tools` dá um nível a ele nesse arquivo e roda `node scripts/model-routing/model-routing.mjs apply`;
  o portão `check` falha enquanto um agent não tem nível. As regras estão em
  [`model-routing.md`](../../../.claude/rules/common/model-routing.md).

## Log de syncs

Mais recente primeiro. **Data** é o `syncedAt`: o dia em que a conferência contra o upstream foi feita (é o que o
aviso de sync mede). **Data do alvo** é o `targetRefDate`: a data do commit do ECC gravado em `targetRef`. "ECC
ref" é o commit ao qual o toolset corresponde depois da execução. Nas notas, todo item revisado sem porte diz o que
mudou no upstream e por que não foi portado: depois que o `lastSyncedRef` avança, esse diff some dos relatórios.

| Data | Data do alvo | ECC ref (de → para) | Atualizados | Revisados | Adotados | Notas |
|------|--------------|---------------------|-------------|-----------|----------|-------|
| 2026-11-04 | 2026-10-15 | `4eb71d92` → `76aaa77d` | 1 | 6 | 0 | **Atualizado:** `rules/common/hooks.md` (permissões em `permissions.allow` do `settings.json`, não mais `allowedTools` em `~/.claude.json`). **Portados:** `/code-review` (`argument-hint` entre aspas); `performance.md` (seção de raciocínio adaptativo com `/effort`); `context-budget` (reescrita para o `/context` nativo, sem as linhas e o link do Codex); hook `suggest-compact.js` (o `transcript-context.js` passou a importar o novo `file-tail.js`; o `readFileTail` mudou de módulo sem mudar de código; `file-tail.js` colado e incluído no `alsoTracks`). **Sem porte:** `rules/common/agents.md`: o upstream reescreveu o parágrafo sobre agents instalados por plugin (`ecc:<nome>`) ou manualmente (nome sem prefixo); esse parágrafo não existe aqui, porque a adaptação o trocou pela lista dos agents do template. `verification-loop`: o upstream pôs `set -o pipefail` e trocou `head` por `sed -n` nos portões com pipe, para não mascarar o exit code; aqui os portões já rodam sem pipe, redirecionados para arquivo. Alvo `76aaa77d` = `origin/main` do clone, sem fetch; o `main` do GitHub já estava em `b38be6a7`. |
| 2026-11-04 | 2026-10-09 | — → `4eb71d92` | — | — | 42 itens do ECC (+ 5 locais) | Baseline do template: toolset conferido byte a byte contra este ref e catálogo gerado nele. |
