---
description: Processo de tarefa — spec, parada obrigatória para aprovação, implementação, verificação (portões do CLAUDE.md + docs-check) e entrega com a reconciliação documental. Caminho padrão para qualquer mudança de código; mudança sem efeito de comportamento passa sem spec.
argument-hint: "## OBJETIVO <obrigatório> ## FLUXO DESEJADO <opcional> ## CRITÉRIOS DE ACEITE <opcional>"
---

Atue como líder técnico sênior responsável pela implementação e manutenção deste produto. Priorize uma solução simples, consistente com a arquitetura existente e fácil de manter. Não crie abstrações para necessidades hipotéticas.

Esta é uma sessão de implementação e planejamento. Seu primeiro passo é preparar a spec da tarefa. Quando estiver pronta, me avise para eu revisar e aprovar a implementação.

## ENTRADA

$ARGUMENTS

A entrada traz as seções `## OBJETIVO` (obrigatória), `## FLUXO DESEJADO` (opcional) e `## CRITÉRIOS DE ACEITE` (opcional). **Sem OBJETIVO: peça o objetivo e pare.**

## OBJETIVO

O da entrada, preenchido pela pessoa.

## FLUXO DESEJADO

## CRITÉRIOS DE ACEITE

- **Se a pessoa não informou** o fluxo ou os critérios, proponha-os.
- **Se informou**, revise e sugira o que faltou, olhando ao menos: estados de falha e recuperação; reentrega e idempotência; permissões; dados antigos ou migração; estados vazios; observabilidade (log ou erro visível); e como cada critério será verificado.

Toda sugestão sua aparece marcada como **Proposta (agente)**, separada do que a pessoa escreveu, e só vale depois de aprovada na parada.

## ETAPA 1 — INVESTIGAÇÃO E SPEC

### Entenda o estado atual

- Leia as instruções do projeto e a documentação relacionada.
- Investigue a implementação antes de propor mudanças.
- Identifique os caminhos reais de execução, contratos, componentes e integrações afetados.
- Procure soluções existentes no projeto que possam ser reutilizadas.
- Não presuma regras de negócio, comportamento de integrações ou decisões de produto. Investigue as fontes disponíveis e explicite o que continuar indefinido.

### Mudança sem efeito de comportamento: sem spec

Se a mudança não altera comportamento nem contrato (refactor, dependência, typo, ajuste de teste, renomeação), **não crie spec**. Na parada obrigatória, declare "**sem spec: <motivo>**" e mostre só o plano curto e os portões que vão rodar; a pessoa pode pedir a spec. O `docs-check diff` e a entrega final valem do mesmo jeito. Na dúvida se há efeito de comportamento, trate como se houvesse.

### Reconcilie a documentação necessária ao planejamento

- Identifique a spec principal e os documentos que descrevem os comportamentos e contratos afetados.
- Rode `node scripts/docs-check/docs-check.mjs stale` e trate como **não confiável** qualquer documento usado no planejamento que apareça como desatualizado ou nunca conferido: confira-o contra o código antes de apoiar decisões nele. Não faça auditoria de outros documentos.
- Compare as seções relevantes com o código atual, distinguindo:
    - comportamento confirmado;
    - mudança pretendida;
    - divergência preexistente;
    - intenção que precisa de esclarecimento.
- Não trate o código existente como prova da intenção. Use requisitos aprovados e decisões registradas para avaliar divergências.
- Proponha o tratamento das divergências que interfiram na tarefa.
- Registre problemas relevantes fora do escopo sem ampliar automaticamente o trabalho.
- Não faça uma auditoria geral do repositório.

### Prepare a spec

Crie ou atualize a spec conforme o ciclo de vida do projeto ([`feature-lifecycle.md`](../rules/common/feature-lifecycle.md)), a partir do [`feature-spec-template.md`](../../docs/implemented/processo/feature-spec-template.md). Ao copiar o template, **apague a chave `docs-check: ignore`** do frontmatter: ela vale só para o template. Inclua:

- Problema e objetivo.
- Comportamento atual e evidências relevantes.
- Comportamento desejado.
- Escopo e limites explícitos.
- Fluxos principais, estados de falha e recuperação.
- Contratos e documentos afetados.
- Critérios de aceite verificáveis.
- Estratégia de testes e verificação.
- Plano de implementação em etapas proporcionais à mudança.
- Dúvidas, riscos e propostas que precisam de decisão humana.

Proporcione a spec e a entrega ao tamanho da mudança: numa mudança pequena, a spec pode ter poucas linhas. Se a mudança precisar de mais de um PR para ser revisada com segurança, proponha a divisão em specs menores antes da parada.

Diferencie propostas do agente de decisões já aprovadas. Preserve uma fonte canônica para cada contrato e evite repetir informações em vários documentos.

Resolva escolhas técnicas rotineiras com autonomia. Para decisões de produto ou contradições que alterem o resultado esperado, apresente opções, consequências e sua recomendação.

Nesta etapa, altere apenas a documentação necessária ao planejamento. Não implemente código, testes ou configuração.

## PARADA OBRIGATÓRIA — APROVAÇÃO DA SPEC

Após preparar a spec:

1. Apresente o caminho do documento (ou "sem spec: <motivo>", com o plano curto e os portões que vão rodar).
2. Resuma a solução proposta, seu alcance e os principais impactos.
3. Declare se a mudança **edita a spec de `implemented/`** ou **abre um delta em `planned/`**, e por quê, pelo critério de [spec × delta](../rules/common/feature-lifecycle.md#spec-ou-delta): depois do merge, a spec em `implemented/` continua dizendo a verdade? No caso "editar a spec de `implemented/`", a spec da tarefa fica em `docs/in-progress/<área>/<nome>.md` durante a tarefa; no caso delta, o ciclo é o normal.
4. Destaque dúvidas, decisões pendentes e as **Propostas (agente)** de fluxo e critérios que precisam de aprovação.
5. Peça explicitamente aprovação para implementar a versão apresentada.
6. Encerre sua resposta e aguarde.

Não prossiga para implementação sem aprovação explícita.

Não interprete silêncio, esclarecimentos, continuidade da conversa ou aprovação de uma decisão isolada como autorização para implementar.

Se forem solicitados ajustes, atualize a spec e reapresente-a para aprovação. Se o pedido já mencionar uma spec aprovada, confirme que ela corresponde ao objetivo e ao fluxo deste pedido e cumpra esta parada antes de implementar.

## ETAPA 2 — IMPLEMENTAÇÃO DA SPEC APROVADA

Comece somente após aprovação explícita para implementação.

### Implemente dentro do escopo

- Siga a spec aprovada e as regras do projeto.
- Reutilize componentes, contratos e padrões existentes quando adequados.
- Faça mudanças proporcionais ao problema.
- Siga as exigências aplicáveis de testes, segurança, arquitetura e revisão.
- Mantenha a spec coerente com o andamento e os resultados da implementação.

Resolva detalhes técnicos rotineiros com autonomia. Se surgir a necessidade de mudar o escopo ou o comportamento aprovado, atualize a spec e aguarde aprovação da alteração antes de implementar a parte afetada.

### Atualize a documentação afetada

- Atualize as seções relacionadas junto com o código.
- Corrija descrições antigas que a mudança tornou incompatíveis com o comportamento entregue.
- Rode `node scripts/docs-check/docs-check.mjs diff` e resolva cada doc listado (atualize-o ou confira-o, mudando o `conferido-em`, conforme [`docs-writing.md`](../rules/common/docs-writing.md)). Depois, procure além da lista os docs que descrevem o comportamento sem citar o código.
- Preserve a fonte canônica de cada contrato; prefira referências a cópias do mesmo conteúdo.
- Diferencie comportamento entregue de comportamento ainda planejado.
- Não reescreva a documentação para legitimar um possível bug.
- Resolva divergências preexistentes que impeçam implementar ou validar corretamente a tarefa. Quando a intenção não estiver comprovada, apresente a decisão necessária.
- Registre problemas relevantes fora do escopo sem ampliar automaticamente a implementação.

## ETAPA 3 — VERIFICAÇÃO E REVISÃO

- Verifique os critérios de aceite com evidências adequadas: testes, verificações de contrato, análise do caminho de execução ou execução da jornada, conforme o caso.
- Execute os portões da tabela **Portões de verificação** do `CLAUDE.md`, sem pipe que mascare o exit code, e mais `docs-check diff` e `docs-check links`, ambos com exit 0.
- Execute as revisões: agents `code-reviewer`, `security-reviewer` (quando tocar auth, entrada de usuário ou segredo), `silent-failure-hunter` e os reviewers de stack adotados, se houver.
- Informe o que cada evidência demonstra e suas limitações.
- Confira nos dois sentidos:
    - o código cumpre o comportamento aprovado;
    - a documentação descreve corretamente o resultado entregue.
- Identifique exatamente quais documentos e seções foram conferidos. Não declare um documento inteiro validado por uma revisão parcial.
- Respeite o ciclo de vida das specs. A aprovação para implementar não autoriza automaticamente a graduação para `implemented/`.

## ENTREGA FINAL

Apresente de forma objetiva:

1. O que mudou e quais critérios de aceite foram atendidos.
2. As verificações executadas, seus resultados (com exit code) e limitações.
3. A reconciliação documental, com **todo doc listado pelo `docs-check diff`**, cada um com "atualizado" ou "conferido, sem mudança: <o que foi olhado>":

    |Comportamento ou contrato|Documento e seção|Atualização ou conferência realizada|Evidência|
    |---|---|---|---|

4. Pendências, divergências relevantes fora do escopo e decisões humanas necessárias, se houver.
5. O estado da spec e, quando aplicável, o pedido de aprovação para graduação, conforme as regras do projeto. No caso "editar a spec de `implemented/`", o conteúdo da spec da tarefa foi incorporado ao doc de `implemented/` e o arquivo temporário de `docs/in-progress/` foi apagado, no mesmo PR.

A tarefa só está concluída quando houver coerência entre o comportamento aprovado, a implementação e a documentação afetada, dentro do alcance explicitamente verificado. Código compilando e declaração genérica de “documentação atualizada” não são comprovação suficiente.
