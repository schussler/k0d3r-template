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

<O que o sistema é, para quem, quais são as partes principais (apps, serviços, jobs) e o que está fora do
escopo. Detalhe em [`docs/vision-and-scope.md`](docs/vision-and-scope.md).>

## Regras de arquitetura

Nenhuma regra registrada ainda. Cada regra entra numerada, com **o porquê** e o link para o doc que a detalha.
Mudar uma regra exige uma decisão registrada na seção **Decisões** do doc afetado e aprovação humana.

<!-- 1. **<regra>.** <por quê>. Detalhe: `docs/implemented/arquitetura/<doc>.md`. -->

## Stack

> O `/sync-ecc-tools` lê esta seção para sugerir os itens do ECC ligados ao projeto (ver "Pacotes de stack" em
> [`.claude/README.md`](.claude/README.md)). Uma linha por item, sem `<...>` depois de preenchida.

- Linguagens: <linguagens e versões>
- Frameworks: <frameworks e versões>
- Banco de dados: <bancos e versões>
- Infraestrutura: <hospedagem, filas, serviços externos>
- Testes: <runner de teste e de e2e>

> **Gatilho:** se esta seção estiver vazia ou não refletir os arquivos do repo, antes da primeira tarefa de
> código: detecte a stack e proponha o texto desta seção e as linhas da tabela de portões. Na mesma tarefa, o
> idioma de "Convenções" vira pergunta da entrevista e "Projeto em um parágrafo" vira proposta, se ainda forem
> placeholder. A adoção dos itens do ECC ligados à stack é um passo da pessoa, fora da tarefa:
> `/sync-ecc-tools --adopt`.

## Portões de verificação

Fonte única dos comandos de verificação. Skills, agents e commands apontam para esta tabela em vez de repetir
comandos. Marque `n/a` no portão que a stack não tem.

| Portão | Comando | Quando | Observação |
| --- | --- | --- | --- |
| Lint | `<comando de lint>` | na iteração | zero warning |
| Typecheck | `<comando de typecheck>` | na iteração | |
| Teste | `<comando de teste>` | na iteração | |
| Build | `<comando de build>` | antes do commit | |
| Auditoria de dependências | `<auditoria de dependências>` | antes do commit | |
| Docs ligados ao código alterado | `node scripts/docs-check/docs-check.mjs diff` | na iteração | todo doc listado resolvido ([`docs-writing.md`](.claude/rules/common/docs-writing.md)) |
| Links e âncoras dos docs | `node scripts/docs-check/docs-check.mjs links` | na iteração | |
| Modelo e esforço dos agents | `node scripts/model-routing/model-routing.mjs check` | na iteração | o frontmatter dos agents e o `advisorModel` batem com o `.claude/model-routing.json` ([`model-routing.md`](.claude/rules/common/model-routing.md)) |

- **Quando rodar.** Enquanto itera numa mudança, rode só os portões "na iteração", que são rápidos. Antes de
  qualquer commit, rode **todos**, os "antes do commit" também. Ao preencher a tabela, marque como "antes do
  commit" o portão que demora (build, E2E, auditoria) e como "na iteração" o resto.
- **Nunca mascare o código de saída.** Nada de `| tail`, `| head` ou `| grep` num portão: redirecione para
  arquivo, imprima o código e só então leia o log
  (`<comando> > "$TMPDIR/x.log" 2>&1; echo "EXIT: $?"; tail -20 "$TMPDIR/x.log"`).
- **Commit só com todos os portões verdes**, condicionado ao código de saída de cada um, não à leitura do `echo`.
- Rode os portões da **raiz** do repositório.
- **Ao preencher esta tabela, ajuste o hook `guard-shell`** (`VERIFY_GATES` em `scripts/hooks/guard-shell.mjs`)
  para reconhecer os nomes dos seus portões. O `docs-check` e o `model-routing` já estão lá.
- Regras completas: [`.claude/rules/common/verification.md`](.claude/rules/common/verification.md).

## Convenções

- **Idioma:** <idioma do código: identificadores, comentários, nomes de arquivo> no código;
  <idioma dos docs e da interface> nos docs em `docs/` e no texto de interface. O toolset `.claude/` fica em
  inglês nos itens vindos do ECC.
- **Comentários explicam o porquê**, nunca o quê. Sem código morto, sem import sem uso.
- **Erros nunca são engolidos.** Erro tipado, levado à interface ou ao log com contexto; um `catch` vazio é
  defeito.
- **Segredos** nunca entram no repositório; `.env` com valor real nunca é versionado.

## Como trabalhar

Você é dono e mantenedor de longo prazo do código que a tarefa toca: a forma dele é decisão sua. Se o
resultado mais simples pede reorganizar o que já existe no caminho da tarefa, reorganize em vez de remendar
ao lado, e avise no plano da spec quando der para prever. Problema fora do caminho da tarefa é registrado
na entrega, não corrigido.

**Termine o trabalho.** Depois da spec aprovada, siga até a entrega. Erro, timeout, teste quebrado e
ferramenta falhando são obstáculos comuns: ache a causa e resolva com o acesso que você tem. Não ofereça
para esperar e não peça de novo o que já foi aprovado.

**Não precisa de ok:** ler e buscar no repositório; rodar portões e testes; repetir um comando que falhou;
criar e editar arquivos dentro do escopo aprovado; chamar subagentes; commit e push na branch da sessão com
os portões verdes; escolhas técnicas rotineiras (nomes, estrutura interna, ordem das etapas).

**Peça ok antes de:** implementar uma spec que ainda não foi aprovada; mudar comportamento, contrato ou
escopo aprovados; graduar uma spec; abrir um PR; mudar uma regra de arquitetura; adotar um item do ECC;
fazer uma operação destrutiva ou difícil de desfazer. Um bloqueio deliberado (arquivo marcado para não
tocar, acesso negado, comando barrado pelo `guard-shell`) não é obstáculo a contornar: diga o que encontrou
e procure outro caminho.

**Prova.** Só diga que algo funciona se você viu funcionar. O que não deu para conferir, diga que não
conferiu.

**Relatório.** A entrega começa pelo resultado, em frases curtas, para quem não viu as chamadas de
ferramenta nem os arquivos abertos.

## Workflow

| Etapa | O que acontece | Peça |
| --- | --- | --- |
| Dia zero | Stack detectada, `## Stack`, tabela de portões, idioma (pergunta da entrevista) e parágrafo do projeto (proposta) preenchidos pela primeira tarefa; a adoção dos pacotes do ECC é um passo da pessoa, fora da tarefa, com confirmação | gatilho do CLAUDE.md; `/sync-ecc-tools --adopt` e `catalog.json`, rodados pela pessoa |
| Pesquisar | Antes de escrever código ou adotar dependência: existe pronto? qual a API atual? | `search-first`, `documentation-lookup`, agent `docs-lookup` |
| Especificar | Investigação, entrevista (uma pergunta por vez, só o que o repositório não responde) e spec nova em `docs/planned/<área>/` a partir do `feature-spec-template.md` | `/k0d3r-task`, agent `planner` (e `architect` se mexer na forma do sistema) |
| Iniciar | `git mv` para `docs/in-progress/<área>/`; plano de build dentro da spec; aprovação humana antes do código; se a stack muda, `## Stack` no mesmo commit e aviso de adoção pendente | `planner`, `/feature-dev`; `/sync-ecc-tools --adopt`, rodado pela pessoa, fora da tarefa |
| Construir | Fatia por fatia até o fim. Em cada uma: testes primeiro, escritos por um agent de contexto limpo a partir só da spec, antes do código da fatia; só os portões "na iteração" enquanto ajusta; todos antes do commit, com commit e push por fatia | agent `test-author`, `tdd-workflow`, skills de stack adotadas; agent `tdd-guide` fora da `/k0d3r-task` |
| Verificar | Portões do CLAUDE.md, sem mascarar exit code, incluindo o `docs-check diff` (docs ligados ao código alterado, resolvidos) e o `docs-check links`; depois, cada critério de aceite conferido por um agent de contexto limpo | `verification-loop`, `docs-check diff`, agent `acceptance-verifier` |
| Revisar | Revisão do diff; segurança quando tocar auth, entrada de usuário ou segredo | `/code-review`, agents `code-reviewer`, `security-reviewer`, `silent-failure-hunter`, reviewers de stack adotados |
| Graduar | Só com aprovação humana explícita na sessão: `git mv` para `docs/implemented/<área>/`, frontmatter com `conferido-em`, aparar as seções de plano, atualizar docs | agent `doc-updater`, `/update-docs` |
| Encerrar | Commit, PR só se pedirem; retro do toolset, com o lembrete de sync e a consulta ao catálogo antes do backlog | `conventional-commit-review`, `pr-body`, `/toolset-retro` |
| Manter o toolset | Atualizar os itens adotados, regenerar o catálogo, ver candidatos novos; podar o que pesa | `/sync-ecc-tools`, `context-budget`, `/security-scan` |
| Manter os docs | Conferir contra o código os docs desatualizados ou nunca conferidos | `/audit-docs`, `docs-check stale` |

Sessões longas: `strategic-compact` (com hook) sugere `/compact` nas fronteiras de fase.

- **A `/k0d3r-task` é o caminho padrão para qualquer mudança de código**, de Especificar a Encerrar:
  investigação, entrevista (uma pergunta por vez, só o que o repositório não responde), spec, **uma parada
  para aprovação**, testes escritos por um agent de contexto limpo, implementação até o fim, verificação por
  outro agent de contexto limpo e entrega. Mudança sem efeito de comportamento (refactor, dependência, typo,
  ajuste de teste, renomeação) passa por ela **sem spec**. Se um pedido chegar fora do command
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
