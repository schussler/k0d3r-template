# Template de projeto com Claude Code

Ponto de partida para um projeto **docs-first** conduzido com o Claude Code, em qualquer linguagem. Traz:

- o ciclo de vida das specs `planned → in-progress → implemented` ([`docs/`](docs/README.md) e
  [`feature-lifecycle.md`](.claude/rules/common/feature-lifecycle.md));
- um [`CLAUDE.md`](CLAUDE.md) com os placeholders do projeto (stack, portões de verificação, regras de
  arquitetura);
- um toolset `.claude/` curado do **ECC** (`affaan-m/ECC`), agnóstico de stack, com o mecanismo de sync e o
  catálogo de tudo que o ECC oferece ([`.claude/README.md`](.claude/README.md));
- dois hooks: `guard-shell` (bloqueia portão com pipe, operação destrutiva, `--no-verify` e push em `main`) e
  `strategic-compact` (sugere `/compact` nas fronteiras de fase);
- o MCP Context7, para documentação atual de bibliotecas;
- um arquivo único de modelo e esforço dos agents ([`.claude/model-routing.json`](.claude/model-routing.json)),
  com o Fable nos papéis em que ele é pertinente.

## Pré-requisitos

Estes são pré-requisitos **da máquina de quem usa o Claude Code**, não do projeto:

- **Claude Code.**
- **Node.js** no `PATH`. Os hooks e o script de sync são Node puro (só módulos `node:*`, sem `package.json` e
  sem `node_modules`). Sem Node, o `guard-shell` bloqueia todo comando de shell com uma mensagem, e o hook de
  compact apenas se desliga: o aviso de compactação fica mudo, e quem denuncia a falta de Node é o
  `guard-shell`, na primeira chamada de shell.
- **`npx`** (vem com o Node), para o Context7 e para o `/security-scan`.
- **`gh`** (opcional): só o modo PR do `/code-review` precisa dele.
- **`git`**, que o `scripts/docs-check/docs-check.mjs` usa para ligar docs ao código: é o portão de docs da
  tabela do `CLAUDE.md`, usado pela `/k0d3r-task` (o processo de tarefa) e pela `/audit-docs` (a auditoria
  dos docs que ficaram para trás).
- **Clone completo do ECC** (opcional, só para sincronizar ou adotar): por padrão em `../ECC`, ao lado do
  projeto. O `/sync-ecc-tools` pergunta antes de clonar.

## MCP: Context7

O [`.mcp.json`](.mcp.json) declara o Context7 (`@upstash/context7-mcp`, versão fixada). Na primeira sessão o
Claude Code **pede aprovação** para o servidor do projeto; aprove para que `documentation-lookup` e
`docs-lookup` funcionem. Ele roda no **plano gratuito, sem chave de API**, que tem limite de requisições: se o
limite estourar, as consultas falham até a janela renovar.

## Variáveis de ambiente do toolset

| Variável | Para quê |
| --- | --- |
| `ECC_CONTEXT_WINDOW_TOKENS` | Tamanho da janela de contexto, em tokens, para o hook de compact. Defina num modelo de janela grande cujo id não traz o marcador `[1m]`; sem ela, o hook presume 200k e sugere `/compact` cedo demais. |
| `COMPACT_THRESHOLD`, `COMPACT_CONTEXT_THRESHOLD`, `COMPACT_CONTEXT_INTERVAL` | Ajustes finos do hook de compact (ver a skill `strategic-compact`). |

## Como iniciar um projeto

1. Copie o template para o repositório novo (ou use-o como template no GitHub) e rode `git init` se preciso.
2. Abra o Claude Code na raiz e aprove o servidor MCP do Context7.
3. Siga o checklist abaixo na primeira sessão.

## Checklist da primeira sessão

- [ ] Preencher **Projeto em um parágrafo** no `CLAUDE.md` e o [`docs/vision-and-scope.md`](docs/vision-and-scope.md).
- [ ] **Dia zero:** se a seção `## Stack` do `CLAUDE.md` estiver vazia ou não refletir os arquivos do repo,
      detectar a stack, propor o texto da seção e rodar **`/sync-ecc-tools --adopt`** (nada é adotado sem
      confirmação).
- [ ] Preencher a tabela **Portões de verificação** do `CLAUDE.md` e ajustar `VERIFY_GATES` (e, se preciso,
      `PROTECTED_BRANCHES`) no topo de `scripts/hooks/guard-shell.mjs`.
- [ ] Definir o idioma do código e dos docs em **Convenções** no `CLAUDE.md`.
- [ ] Registrar as primeiras **Regras de arquitetura**, cada uma com o porquê e o doc que a detalha.
- [ ] Rodar os testes do toolset: `node --test` em `scripts/hooks/guard-shell.test.mjs`,
      `scripts/hooks/toolset-staleness.test.mjs`, `scripts/ecc-sync/report.test.mjs`,
      `scripts/docs-check/docs-check.test.mjs` e `scripts/model-routing/model-routing.test.mjs`.
- [ ] Conferir o [`.claude/model-routing.json`](.claude/model-routing.json) contra os modelos que a sua conta
      tem (ver "Modelo e esforço dos agents" abaixo) e rodar `node scripts/model-routing/model-routing.mjs check`.
- [ ] Rodar `node scripts/docs-check/docs-check.mjs links` e `stale` para ver o estado dos docs.
- [ ] Fazer a primeira tarefa de código com a **`/k0d3r-task`** (o caminho padrão: ela entrevista você, para
      uma vez para aprovar a spec e depois vai até a entrega); a **`/audit-docs`** cuida
      dos docs desatualizados ou nunca conferidos.
- [ ] Escrever a primeira spec em `docs/planned/<área>/` a partir do
      [`feature-spec-template.md`](docs/implemented/processo/feature-spec-template.md).

## Modelo e esforço dos agents

Um arquivo só, o [`.claude/model-routing.json`](.claude/model-routing.json), decide em qual modelo e com qual
esforço cada agent roda. Ele tem quatro níveis (`fronteira`, `raciocinio`, `padrao`, `rapido`), o nível de cada
agent e o papel do Fable: orquestrador recomendado da sessão, planejamento aberto e conselheiro.

| Quando | O que fazer |
| --- | --- |
| Saiu um modelo novo, ou você quer gastar mais ou menos | Edite `niveis` e rode `node scripts/model-routing/model-routing.mjs apply`. |
| Sua conta não tem acesso ao Fable | Troque o `model` do nível `fronteira` e o `conselheiro` para `opus` (ou `conselheiro: null`) e rode o `apply`. |
| Entrou um agent novo | Dê um nível a ele em `agents` e rode o `apply`. |

O `apply` escreve `model:` e `effort:` no frontmatter de cada agent e a chave `advisorModel` no
`.claude/settings.json`. O `check` é portão: falha quando algo diverge do arquivo. O conselheiro usa o recurso
advisor do Claude Code, que é experimental e exige a API da Anthropic ou a Claude Platform on AWS; onde ele não
está disponível, a sessão roda sem conselheiro e sem erro. As regras de uso estão em
[`model-routing.md`](.claude/rules/common/model-routing.md).

## Mantendo o toolset atualizado

O toolset não pode ficar para trás do ECC. Três papéis:

- **O hook avisa:** `scripts/hooks/toolset-staleness.mjs`, no início de cada sessão, imprime uma linha quando o último sync passou de `syncStaleDays` dias (campo do manifest, 30 por padrão).
- **A retro checa:** o `/toolset-retro` repete a checagem e consulta o catálogo antes de mandar uma ferramenta faltante para o backlog.
- **A pessoa decide:** nada é adotado nem sobrescrito sem confirmação.

O mesmo hook imprime uma segunda linha quando há docs com código alterado desde a última conferência ou nunca
conferidos ("docs: X …, Y … (/audit-docs)"); o detalhe está em
[`verificacao-de-docs.md`](docs/implemented/processo/verificacao-de-docs.md).

Os gatilhos:

| Gatilho | O que fazer |
| --- | --- |
| Dia zero | `## Stack` preenchida → `/sync-ecc-tools --adopt`. |
| Início de feature que muda a stack | Atualizar `## Stack` no mesmo commit do `git mv` para `in-progress/` → `/sync-ecc-tools --adopt`. |
| Início de sessão | O hook `toolset-staleness` avisa quando o último sync passou de `syncStaleDays` dias. |
| Retro do toolset | O `/toolset-retro` faz a mesma checagem e consulta o `catalog.json` antes de mandar uma ferramenta faltante para o backlog. |
| Sync manual | `/sync-ecc-tools` a qualquer momento: atualiza os itens adotados, regenera o catálogo e lista os candidatos novos, separados entre os ligados à stack e os outros. |

**Opção, fora do template:** um workflow mensal de CI que clone o ECC, rode
`node scripts/ecc-sync/report.mjs report` e abra uma issue com o relatório. Ele só avisa; a adoção continua sendo
feita numa sessão, com confirmação.

**Adotar é sempre decisão humana.** O código entrega o catálogo e o relatório; o Claude propõe uma lista curta
com o motivo de cada item; a pessoa confirma. Nada é copiado antes disso. O processo está em
[`docs/implemented/processo/ecc-sync.md`](docs/implemented/processo/ecc-sync.md).
