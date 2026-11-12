# `.claude/` — o toolset de IA do projeto

Agents, skills, commands, rules e hooks que o Claude Code usa neste repositório. A maior parte vem do
**ECC** (`affaan-m/ECC`); alguns itens são **adaptados** (`adapt`) e outros são **locais** (`local`, sem
upstream). O que entrou e por quê está no manifest; o que o ECC oferece e ainda não foi adotado está no
catálogo.

- **Procedência:** [`ecc-sync/manifest.json`](ecc-sync/manifest.json) — origem, `policy` (`track` / `adapt` /
  `local`), `lastSyncedRef` e, nos `adapt`, a nota `adaptation` com o que mudou.
- **Catálogo do ECC:** [`ecc-sync/catalog.json`](ecc-sync/catalog.json) — todo item do ECC no ref do manifest,
  com `description` e `adopted`. É o que o projeto sabe do ECC sem clonar nada.
- **Processo:** [`../docs/implemented/processo/ecc-sync.md`](../docs/implemented/processo/ecc-sync.md).
- **Comandos de verificação:** nenhum item repete comando de stack; todos apontam para a tabela **Portões de
  verificação** do [`../CLAUDE.md`](../CLAUDE.md).
- **Modelo e esforço:** [`model-routing.json`](model-routing.json) decide em qual modelo e com qual esforço cada
  agent roda, e onde o Fable entra. As linhas `model:` e `effort:` dos agents são escritas pelo
  `model-routing.mjs apply`; não as edite à mão ([`rules/common/model-routing.md`](rules/common/model-routing.md)).

## Skills

| Skill | Origem | Quando usar |
|---|---|---|
| `search-first` | ECC (adapt) | Antes de escrever código ou adotar dependência: existe pronto? |
| `documentation-lookup` | ECC (adapt) | API atual de biblioteca/framework via Context7, em vez de memória de treino. |
| `tdd-workflow` | ECC (adapt) | Construir: teste falhando primeiro, verde mínimo, refatorar. |
| `verification-loop` | ECC (adapt) | Verificar: build, tipos, lint, testes, segurança e diff, com os portões do CLAUDE.md sem pipe. |
| `coding-standards` | ECC (adapt) | Convenções de qualidade e nomes, sem framework específico. |
| `error-handling` | ECC | Tipos de erro, retries, circuit breakers, mensagens de falha. |
| `security-review` | ECC | Auth, entrada de usuário, segredos, endpoints, pagamentos. |
| `api-design` | ECC | Desenho e revisão de endpoints REST. |
| `conventional-commit-review` | ECC (adapt) | Mensagem de commit no padrão Conventional Commits. |
| `pr-body` | local (de `mattpocock/skills`, MIT) | Corpo de PR em pt-BR, só quando a pessoa pede o PR. |
| `context-budget` | ECC (adapt) | Contexto ao vivo: aponta para o `/context` nativo; auditoria estática dos componentes só quando pedida. |
| `strategic-compact` | ECC (adapt) | Sessões longas: `/compact` nas fronteiras de fase (com hook). |

## Agents

| Agent | Origem | Quando usar |
|---|---|---|
| `planner` | ECC (adapt) | Especificar e planejar a build dentro da spec. |
| `architect` | ECC (adapt) | Mudança na forma do sistema; decisões vão para a seção Decisões do doc. |
| `code-architect` | ECC (adapt) | Blueprint de implementação a partir dos padrões do código existente. |
| `tdd-guide` | ECC (adapt) | Conduzir o ciclo RED/GREEN/REFACTOR na própria sessão, fora da `/k0d3r-task`. |
| `test-author` | local | Contexto limpo, antes do código (por fatia, quando há mais de uma, e a sessão espera por ele): escreve os testes que falham a partir só da spec aprovada. Não escreve implementação. |
| `acceptance-verifier` | local | Contexto limpo, depois dos portões verdes e ao fim de cada fatia (só os critérios dela): confere cada critério de aceite rodando, e lista o que o diff muda e a spec não cobre. Não edita. |
| `code-reviewer` | ECC (adapt) | Revisar todo diff de código. |
| `security-reviewer` | ECC (adapt) | Diff que toca auth, entrada de usuário, segredo ou dados sensíveis. |
| `silent-failure-hunter` | ECC (adapt) | Erros engolidos, fallbacks perigosos. |
| `code-simplifier` | ECC (adapt) | Simplificar sem mudar comportamento. |
| `type-design-analyzer` | ECC (adapt) | Invariantes e encapsulamento dos tipos. |
| `pr-test-analyzer` | ECC (adapt) | Qualidade da cobertura de testes de um PR. |
| `refactor-cleaner` | ECC (adapt) | Código morto e duplicação. |
| `doc-updater` | ECC (adapt) | Atualizar docs e codemaps; graduação de spec. |
| `docs-lookup` | ECC (adapt) | Pergunta sobre biblioteca/API respondida pelo Context7. |

Para explorar o código, use o subagent nativo `Explore` do Claude Code.

## Commands

| Command | Origem | Quando usar |
|---|---|---|
| `/feature-dev` | ECC (adapt) | Feature guiada: descoberta, exploração, arquitetura, implementação, revisão. |
| `/code-review` | ECC (adapt) | Revisão local (sem argumento) ou de PR (exige o `gh`). |
| `/build-fix` | ECC (adapt) | Build ou typecheck quebrado. |
| `/test-coverage` | ECC | Lacunas de cobertura. |
| `/refactor-clean` | ECC | Remoção segura de código morto. |
| `/update-docs` | ECC | Docs gerados a partir das fontes de verdade. |
| `/security-scan` | ECC (adapt) | Auditoria do `.claude/` com AgentShield (`npx ecc-agentshield@1.6.0`). |
| `/sync-ecc-tools` | local | Atualizar do ECC; `--adopt` para adotar itens da stack. |
| `/toolset-retro` | local | Retro do toolset no fim da sessão. |
| `/k0d3r-task` | local | O caminho padrão para qualquer mudança de código: investigação, entrevista (uma pergunta por vez), spec, uma parada para aprovação, testes pelo `test-author`, implementação até o fim, verificação (portões + `docs-check` + `acceptance-verifier`) e entrega. Sem spec quando não há efeito de comportamento. |
| `/audit-docs` | local | Auditoria dos docs desatualizados ou nunca conferidos: um subagente por doc, amostra relida, parada para aprovação, correção e `conferido-em`. |

## Rules (`rules/common/`)

| Rule | Origem | O que cobre |
|---|---|---|
| `feature-lifecycle.md` | local | O ciclo planned → in-progress → implemented e as peças de cada etapa. |
| `verification.md` | local | Como usar os portões sem se enganar com o resultado. |
| `docs-writing.md` | local | Como escrever e manter docs: `codigo:`, `conferido-em:`, resolver docs ligados ao código alterado. |
| `git-workflow.md` | ECC (adapt) | Commits, branch única por sessão, verificação de branch, PR só quando pedido. |
| `development-workflow.md` | ECC (adapt) | Pipeline de pesquisa, plano, TDD, revisão e commit. |
| `agents.md` | ECC (adapt) | Quais agents existem, quando delegar vale o custo e como escrever o brief de um agent de contexto limpo. |
| `code-review.md` | ECC (adapt) | Quando e como revisar. |
| `model-routing.md` | local | Modelo e esforço dos agents e dos subagents nativos; os quatro papéis do Fable; o que vence o arquivo. |
| `performance.md` | ECC (adapt) | Ponteiro para o roteamento de modelo, janela de contexto, esforço da sessão, troubleshooting de build. |
| `testing.md` | ECC (adapt) | Tipos de teste, cobertura e teste antes do código quando há critério de aceite; quem escreve os testes na `/k0d3r-task`. |
| `coding-style.md`, `security.md`, `hooks.md`, `patterns.md` | ECC | Estilo, segurança, hooks e padrões genéricos. |

## Hooks (`scripts/hooks/`, registrados em `settings.json`)

| Hook | Origem | O que faz |
|---|---|---|
| `guard-shell.mjs` | local | `PreToolUse` em `Bash`: bloqueia portão com pipe (inclusive o `model-routing`), operação destrutiva, `--no-verify` e push em `main`. Sem Node, bloqueia com mensagem. Ajuste `VERIFY_GATES` e `PROTECTED_BRANCHES` no topo. |
| `toolset-staleness.mjs` | local | `SessionStart`: uma linha quando o último sync com o ECC passou de `syncStaleDays` dias (campo do manifest), e outra quando há docs desatualizados ou nunca conferidos (`docs-check`). Em dia, sem manifest ou sem Node, não imprime nada; nunca bloqueia. |
| `suggest-compact.js` | ECC (adapt) | `PreToolUse` em `Edit`/`Write`: sugere `/compact` pelo tamanho do contexto. Só avisa; sem Node, não faz nada. |

## Scripts (`scripts/`, fora do manifest)

| Script | Origem | O que faz |
|---|---|---|
| `docs-check/docs-check.mjs` | local | `links`, `diff` e `stale`: liga docs ao código e aponta os que ficaram para trás ([`verificacao-de-docs.md`](../docs/implemented/processo/verificacao-de-docs.md)). |
| `ecc-sync/report.mjs` | local | Relatório, catálogo, inventário e bootstrap do sync com o ECC. |
| `model-routing/model-routing.mjs` | local | `check` (portão) e `apply`: derivam do `model-routing.json` o `model:` e o `effort:` de cada agent e o `advisorModel` do `settings.json`. |

## MCP

`.mcp.json` declara só o **Context7** (`@upstash/context7-mcp@4.4.4`, plano gratuito, sem chave), usado por
`documentation-lookup` e `docs-lookup`.

## Pacotes de stack (adicione quando precisar)

O caminho oficial para adotar um pacote é preencher a seção `## Stack` do `CLAUDE.md` e rodar
**`/sync-ecc-tools --adopt`**: o Claude lê o `catalog.json`, propõe uma lista curta com o motivo de cada item e
só copia o que você confirmar. Depois disso, o `/sync-ecc-tools` normal mantém o pacote atualizado.

A lista abaixo é uma seleção por família, gerada do `catalog.json` (ECC no ref `76aaa77d`), com a primeira frase
da descrição de cada item. A lista completa, com as descrições inteiras, está no catálogo.

**TS / web**

- `typescript-reviewer` (agent) — Expert TypeScript/JavaScript code reviewer specializing in type safety, async correctness, Node/web security, and idi...
- `react-reviewer` (agent) — Expert React/JSX code reviewer specializing in hook correctness, render performance, server/client component boundari...
- `build-error-resolver` (agent) — Build and TypeScript error resolution specialist.
- `e2e-runner` (agent) — End-to-end testing specialist using Vercel Agent Browser (preferred) with Playwright fallback.
- `frontend-patterns` (skill) — Frontend development patterns for React, Next.js, state management, performance optimization, and UI best practices.
- `react-patterns` (skill) — React 18/19 patterns including hooks discipline, server/client component boundaries, Suspense + error boundaries, for...
- `e2e-testing` (skill) — Playwright E2E testing patterns, Page Object Model, configuration, CI/CD integration, artifact management, and flaky ...
- rules `typescript/*` (5 arquivos: coding-style, hooks, patterns, security, testing)
- rules `web/*` (7 arquivos: coding-style, design-quality, hooks, patterns, performance, security, testing)

**Python**

- `python-reviewer` (agent) — Expert Python code reviewer specializing in PEP 8 compliance, Pythonic idioms, type hints, security, and performance.
- `python-patterns` (skill) — Pythonic idioms, PEP 8 standards, type hints, and best practices for building robust, efficient, and maintainable Pyt...
- `python-testing` (skill) — Python testing strategies using pytest, TDD methodology, fixtures, mocking, parametrization, and coverage requirements.
- rules `python/*` (6 arquivos: coding-style, fastapi, hooks, patterns, security, testing)

**Go**

- `go-reviewer` (agent) — Expert Go code reviewer specializing in idiomatic Go, concurrency patterns, error handling, and performance.
- `go-build-resolver` (agent) — Go build, vet, and compilation error resolution specialist.
- `golang-patterns` (skill) — Idiomatic Go patterns, best practices, and conventions for building robust, efficient, and maintainable Go applications.
- `golang-testing` (skill) — Go testing patterns including table-driven tests, subtests, benchmarks, fuzzing, and test coverage.
- rules `golang/*` (5 arquivos: coding-style, hooks, patterns, security, testing)

**Rust**

- `rust-reviewer` (agent) — Expert Rust code reviewer specializing in ownership, lifetimes, error handling, unsafe usage, and idiomatic patterns.
- `rust-build-resolver` (agent) — Rust build, compilation, and dependency error resolution specialist.
- `rust-patterns` (skill) — Idiomatic Rust patterns, ownership, error handling, traits, concurrency, and best practices for building safe, perfor...
- rules `rust/*` (5 arquivos: coding-style, hooks, patterns, security, testing)

**Java / Kotlin**

- `java-reviewer` (agent) — Expert Java code reviewer for Spring Boot and Quarkus projects.
- `kotlin-reviewer` (agent) — Kotlin and Android/KMP code reviewer.
- `springboot-patterns` (skill) — Spring Boot architecture patterns, REST API design, layered services, data access, caching, async processing, and log...
- rules `java/*` (5 arquivos: coding-style, hooks, patterns, security, testing)
- rules `kotlin/*` (5 arquivos: coding-style, hooks, patterns, security, testing)

**Outras (dados, infra, arquitetura)**

- `database-reviewer` (agent) — PostgreSQL database specialist for query optimization, schema design, security, and performance.
- `postgres-patterns` (skill) — PostgreSQL database patterns for query optimization, schema design, indexing, and security.
- `docker-patterns` (skill) — Docker and Docker Compose patterns for local development, hardened CLI installer harnesses, container security, netwo...
- `hexagonal-architecture` (skill) — Design, implement, and refactor Ports & Adapters systems with clear domain boundaries, dependency inversion, and test...

Há também itens para angular, arkts, cpp, csharp, dart, fsharp, nuxt, perl, php, react-native, react, ruby, swift, vue e outros domínios: procure por `description` no `catalog.json`.
