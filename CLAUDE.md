# CLAUDE.md

> Acordo de trabalho para quem constrói este projeto, pessoa ou agente. Os trechos entre `<...>` são
> placeholders: preencha-os na primeira sessão (ver o checklist no [`README.md`](README.md)).

## Diretiva principal: docs-first

O projeto é **docs-first**: a spec é escrita e acordada **antes** do código e é a fonte da **intenção de
design**. O código implementa a spec e é revisado contra ela.

- **A spec lidera.** Uma spec pode estar *à frente* do código em `main`; isso é esperado.
- **A pasta de ciclo de vida é a fonte única do estado de build**, decidido pelo sistema rodando:
  - `docs/implemented/<área>/` — entregue **e alcançável** de ponta a ponta;
  - `docs/in-progress/<área>/` — em código **agora**; **vazia entre sprints**;
  - `docs/planned/<área>/` — à frente do código (inclui o construído mas ainda não alcançável).
- As áreas padrão são `arquitetura/`, `produto/` e `processo/`, iguais nas três pastas. Um doc mantém o caminho
  relativo ao trocar de estado (`git mv docs/<estado>/<área>/x.md docs/<novo-estado>/<área>/x.md`). Regras de
  placement em [`docs/README.md`](docs/README.md).
- **Feature parcial é dividida, nunca estacionada**: a parte construída e alcançável vai para `implemented/`, o
  resto vira spec em `planned/`. Um doc em `implemented/` que afirma comportamento que o código não tem é um
  defeito.
- **Spec e código andam juntos** no mesmo PR, e quando o estado de uma feature muda, a spec muda de pasta no mesmo
  PR. O processo completo está em [`.claude/rules/common/feature-lifecycle.md`](.claude/rules/common/feature-lifecycle.md).

## Projeto em um parágrafo

Estação Kepler: um FPS 3D que roda no navegador, feito para demonstração em vídeo. Uma aplicação de página
única (Vite + Three.js) na raiz do repositório, sem servidor, sem dado persistido e sem arquivo de mídia externo:
modelos, texturas, sons e interface são gerados no código. Spec: [`docs/in-progress/produto/estacao-kepler.md`](docs/in-progress/produto/estacao-kepler.md).

## Regras de arquitetura

Nenhuma regra registrada ainda. Cada regra entra numerada, com **o porquê** e o link para o doc que a detalha.
Mudar uma regra exige uma decisão registrada na seção **Decisões** do doc afetado e aprovação humana.

<!-- 1. **<regra>.** <por quê>. Detalhe: `docs/implemented/arquitetura/<doc>.md`. -->

## Stack

> O `/sync-ecc-tools` lê esta seção para sugerir os itens do ECC ligados ao projeto (ver "Pacotes de stack" em
> [`.claude/README.md`](.claude/README.md)). Uma linha por item, sem `<...>` depois de preenchida.

- Linguagens: TypeScript 6.0.3, Node 24
- Frameworks: Vite 8.3.5, Three.js 0.186.1, Web Audio API (nativa)
- Banco de dados: nenhum
- Infraestrutura: nenhuma (aplicação estática no navegador)
- Testes: Vitest 4.1.12 (unidade, cobertura v8) e Playwright 1.64.1 (e2e, Chromium)

> **Gatilho:** se esta seção estiver vazia ou não refletir os arquivos do repo, antes da primeira tarefa de
> código: detecte a stack, proponha o texto desta seção e rode `/sync-ecc-tools --adopt`.

## Portões de verificação

Fonte única dos comandos de verificação. Skills, agents e commands apontam para esta tabela em vez de repetir
comandos. Marque `n/a` no portão que a stack não tem.

| Portão | Comando | Observação |
| --- | --- | --- |
| Lint | `npm run lint` | zero warning |
| Typecheck | `npm run typecheck` | |
| Teste | `npm run test` | Vitest com cobertura; meta 80% em `src/rules/` e `src/level/` |
| Build | `npm run build` | |
| E2E | `npm run e2e` | Playwright; sobe o `npm run dev` e falha em erro no console |
| Auditoria de dependências | `npm audit --audit-level=high` | |
| Docs ligados ao código alterado | `node scripts/docs-check/docs-check.mjs diff` | todo doc listado resolvido ([`docs-writing.md`](.claude/rules/common/docs-writing.md)) |
| Links e âncoras dos docs | `node scripts/docs-check/docs-check.mjs links` | |

- **Nunca mascare o código de saída.** Nada de `| tail`, `| head` ou `| grep` num portão: redirecione para
  arquivo, imprima o código e só então leia o log
  (`<comando> > "$TMPDIR/x.log" 2>&1; echo "EXIT: $?"; tail -20 "$TMPDIR/x.log"`).
- **Commit só com todos os portões verdes**, condicionado ao código de saída de cada um, não à leitura do `echo`.
- Rode os portões da **raiz** do repositório.
- **Ao preencher esta tabela, ajuste o hook `guard-shell`** (`VERIFY_GATES` em `scripts/hooks/guard-shell.mjs`)
  para reconhecer os nomes dos seus portões. O `docs-check` já está lá.
- Regras completas: [`.claude/rules/common/verification.md`](.claude/rules/common/verification.md).

## Convenções

- **Idioma:** inglês no código (identificadores, nomes de arquivo); pt-BR nos comentários, nos docs em `docs/`
  e no texto de interface. O toolset `.claude/` fica em
  inglês nos itens vindos do ECC.
- **Comentários explicam o porquê**, nunca o quê. Sem código morto, sem import sem uso.
- **Erros nunca são engolidos.** Erro tipado, levado à interface ou ao log com contexto; um `catch` vazio é
  defeito.
- **Segredos** nunca entram no repositório; `.env` com valor real nunca é versionado.

## Workflow

| Etapa | O que acontece | Peça |
| --- | --- | --- |
| Dia zero | Stack detectada, `## Stack` preenchida, pacotes do ECC propostos e adotados com confirmação | gatilho do CLAUDE.md, `/sync-ecc-tools --adopt`, `catalog.json` |
| Pesquisar | Antes de escrever código ou adotar dependência: existe pronto? qual a API atual? | `search-first`, `documentation-lookup`, agent `docs-lookup` |
| Especificar | Spec nova em `docs/planned/<área>/` a partir do `feature-spec-template.md` | `/k0d3r-task`, agent `planner` (e `architect` se mexer na forma do sistema) |
| Iniciar | `git mv` para `docs/in-progress/<área>/`; plano de build dentro da spec; aprovação humana antes do código; se a stack muda, `## Stack` + `--adopt` no mesmo commit | `planner`, `/feature-dev`, `/sync-ecc-tools --adopt` |
| Construir | Fatia por fatia, testes primeiro onde couber, commit e push por fatia | `tdd-workflow`, agent `tdd-guide`, skills de stack adotadas |
| Verificar | Portões do CLAUDE.md, sem mascarar exit code, incluindo o `docs-check diff` (docs ligados ao código alterado, resolvidos) e o `docs-check links` | `verification-loop`, `docs-check diff` |
| Revisar | Revisão do diff; segurança quando tocar auth, entrada de usuário ou segredo | `/code-review`, agents `code-reviewer`, `security-reviewer`, `silent-failure-hunter`, reviewers de stack adotados |
| Graduar | Só com aprovação humana explícita na sessão: `git mv` para `docs/implemented/<área>/`, frontmatter com `conferido-em`, aparar as seções de plano, atualizar docs | agent `doc-updater`, `/update-docs` |
| Encerrar | Commit, PR só se pedirem; retro do toolset, com o lembrete de sync e a consulta ao catálogo antes do backlog | `conventional-commit-review`, `pr-body`, `/toolset-retro` |
| Manter o toolset | Atualizar os itens adotados, regenerar o catálogo, ver candidatos novos; podar o que pesa | `/sync-ecc-tools`, `context-budget`, `/security-scan` |
| Manter os docs | Conferir contra o código os docs desatualizados ou nunca conferidos | `/audit-docs`, `docs-check stale` |

Sessões longas: `strategic-compact` (com hook) sugere `/compact` nas fronteiras de fase.

- **A `/k0d3r-task` é o caminho padrão para qualquer mudança de código**, de Especificar a Encerrar: spec,
  parada para aprovação, implementação, verificação e entrega. Mudança sem efeito de comportamento (refactor,
  dependência, typo, ajuste de teste, renomeação) passa por ela **sem spec**. Se um pedido chegar fora do command
  e mudar comportamento ou contrato, sugira a `/k0d3r-task` antes de implementar. Em qualquer caso, os portões
  valem, incluindo `docs-check diff` e `docs-check links`.
- **Docs:** escreva conforme [`docs-writing.md`](.claude/rules/common/docs-writing.md); a manutenção dos docs
  que ficaram para trás é a `/audit-docs`.

- **Commits:** Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `ci:`, `perf:`).
- **Uma branch por sessão.** Commit por fatia e **push depois de cada commit**. Antes de trabalhar numa branch
  citada na tarefa, confira-a no remoto (`git ls-remote --heads origin <nome>`); se não existir ou divergir da
  branch da sessão, **pare e pergunte**.
- **PR só quando a pessoa pede** aquele PR na conversa.
- **Graduação só com aprovação humana explícita na sessão**; o agente pergunta e nunca se autogradua.
- **Fim de sessão substantiva:** `/toolset-retro`.
- Detalhe: [`feature-lifecycle.md`](.claude/rules/common/feature-lifecycle.md) e
  [`git-workflow.md`](.claude/rules/common/git-workflow.md).

## Decisões

Toda decisão técnica fica na seção **Decisões** do doc de arquitetura ou de produto que ela afeta, no mesmo PR
da mudança: **o quê / por quê / alternativa rejeitada**, em 2 a 6 linhas. Sem ADRs numerados, sem ledger; o
porquê extenso vai na descrição do PR. Decisão que o agente propôs e a pessoa ainda não aprovou é escrita como
proposta.

## Toolbox

O inventário do `.claude/` (skills, agents, commands, rules, hooks, MCP) e os pacotes de stack disponíveis no ECC
estão em [`.claude/README.md`](.claude/README.md).
