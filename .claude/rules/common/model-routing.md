# Roteamento de modelo e esforço — regra local

> Regra local do projeto. A fonte única é [`.claude/model-routing.json`](../../model-routing.json): os níveis,
> o nível de cada agent e o papel do Fable. Esta regra **não repete os valores**; leia o arquivo. O desenho e
> as decisões estão em
> [`roteamento-de-modelos.md`](../../../docs/in-progress/processo/roteamento-de-modelos.md).

## O arquivo manda

- Cada agent de `.claude/agents/` roda no modelo e no esforço do seu nível. As linhas `model:` e `effort:` do
  frontmatter são **derivadas**: quem as escreve é `node scripts/model-routing/model-routing.mjs apply`. Para
  mudar um agent, mude o nível dele no arquivo e rode o `apply`; não edite o frontmatter à mão.
- `node scripts/model-routing/model-routing.mjs check` é portão (tabela do [`CLAUDE.md`](../../../CLAUDE.md)):
  falha quando um agent não tem nível, quando o frontmatter diverge ou quando o arquivo tem valor inválido.
- Ao chamar um agent que tem arquivo, não passe `model` nem `effort` na chamada: o frontmatter decide. A
  exceção é a escalada, abaixo.

## Subagents nativos

`Explore`, `Plan` e `general-purpose` não têm arquivo no repositório. Antes de chamar um deles, leia a chave
`nativos` do arquivo e passe na chamada o `model` e o `effort` do nível indicado.

## Onde o Fable entra

O Fable é para o trabalho aberto e ambicioso, não para tarefa bem especificada. Ele entra em quatro papéis:

- **Orquestrador.** O nível `orquestrador` do arquivo é o recomendado para a sessão que conduz uma tarefa com
  spec. É recomendação: quem escolhe o modelo e o esforço da sessão é a pessoa (`/model`, `/effort`). A
  `/k0d3r-task` avisa em uma linha quando a sessão está em outro modelo, e segue.
- **Planejamento aberto.** Os agents do nível `fronteira`.
- **Conselheiro.** A chave `conselheiro` vira `advisorModel` no `.claude/settings.json`: a sessão e os agents
  em modelos menores consultam o conselheiro antes de fechar uma abordagem, num erro que se repete e antes de
  declarar pronto.
- **Escalada.** Se um agent do nível `raciocinio` não achou a causa, ou falhou duas vezes na mesma coisa, refaça
  a chamada passando o `model` e o `effort` do nível `fronteira`, e diga isso na entrega.

## O que vence o arquivo

O `check` confere o repositório, não a máquina. Quatro coisas fora dele mudam o que roda de fato:

- `CLAUDE_CODE_SUBAGENT_MODEL` com `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` faz o Claude Code ignorar o `model:` do
  frontmatter;
- `CLAUDE_CODE_EFFORT_LEVEL` vence o `effort:`;
- uma lista de modelos permitidos da organização troca o modelo pedido por outro;
- um `advisorModel` em `.claude/settings.local.json` ou nas settings do usuário, que é onde o `/advisor` grava,
  vence o do projeto.

O conselheiro é um recurso experimental do Claude Code: exige a API da Anthropic ou a Claude Platform on AWS e
acesso ao Fable. Onde falta uma dessas condições, a sessão roda sem conselheiro e sem erro.
