---
description: Processo de tarefa — investigação, entrevista, spec, uma parada para aprovação, testes por agent de contexto limpo, implementação até o fim, verificação (portões do CLAUDE.md + docs-check + verificador de aceite) e entrega com a reconciliação documental. Caminho padrão para qualquer mudança de código; mudança sem efeito de comportamento passa sem spec.
argument-hint: "## OBJETIVO <obrigatório> ## FLUXO DESEJADO <opcional> ## CRITÉRIOS DE ACEITE <opcional>"
---

Você é dono e mantenedor de longo prazo do código que esta tarefa toca: a forma dele é decisão sua. Prefira a solução simples, coerente com a arquitetura existente e fácil de manter, e não crie abstração para necessidade hipotética. O jeito de trabalhar (o que dispensa ok, o que pede ok, prova e relatório) está na seção **Como trabalhar** do `CLAUDE.md` e vale aqui inteiro.

A tarefa tem **uma parada de aprovação: a da spec**. Antes dela, você investiga e me entrevista. Depois dela, você vai até a entrega.

## ENTRADA

$ARGUMENTS

A entrada traz as seções `## OBJETIVO` (obrigatória), `## FLUXO DESEJADO` (opcional) e `## CRITÉRIOS DE ACEITE` (opcional). **Sem OBJETIVO: peça o objetivo e pare.**

## OBJETIVO

O da entrada, preenchido pela pessoa.

## FLUXO DESEJADO

## CRITÉRIOS DE ACEITE

- **Se a pessoa não informou** o fluxo ou os critérios: o que mudaria a forma de construir vira pergunta da entrevista; o resto, você propõe.
- **Se informou**, revise e sugira o que faltou, olhando ao menos: estados de falha e recuperação; reentrega e idempotência; permissões; dados antigos ou migração; estados vazios; observabilidade (log ou erro visível); e como cada critério será verificado.

Toda sugestão sua aparece marcada como **Proposta (agente)**, separada do que a pessoa escreveu, e só vale depois de aprovada na parada.

## ETAPA 1 — INVESTIGAÇÃO, ENTREVISTA E SPEC

### Entenda o estado atual

- Leia as instruções do projeto e a documentação relacionada.
- Investigue a implementação antes de propor mudanças.
- Identifique os caminhos reais de execução, contratos, componentes e integrações afetados.
- Procure soluções existentes no projeto que possam ser reutilizadas.
- Não presuma regras de negócio, comportamento de integrações ou decisões de produto. Investigue as fontes disponíveis; o que continuar indefinido vai para a entrevista ou para a spec, como dúvida.

### Mudança sem efeito de comportamento: sem spec

Se a mudança não altera comportamento nem contrato (refactor, dependência, typo, ajuste de teste, renomeação), **não crie spec**, não entreviste e não chame o `test-author`. Na parada, declare "**sem spec: <motivo>**" e mostre só o plano curto e os portões que vão rodar; a pessoa pode pedir a spec. O `docs-check diff`, a verificação e a entrega final valem do mesmo jeito. Na dúvida se há efeito de comportamento, trate como se houvesse.

### Modelo da sessão

Numa tarefa com spec, leia o nível `orquestrador` em `.claude/model-routing.json`. Se a sessão roda em outro modelo, diga em uma linha qual é o modelo e o esforço recomendados e como trocar (`/model <alias>`, `/effort <nível>`), e siga sem esperar resposta. A escolha é da pessoa ([`model-routing.md`](../rules/common/model-routing.md)).

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

### Entreviste

Depois de investigar e antes de escrever a spec, pergunte o que o repositório não responde.

- **Só entra pergunta cuja resposta mudaria a spec.** O que o código, os docs ou as decisões registradas já respondem não é pergunta.
- **Uma pergunta por vez**, começando pelas que mudariam a forma de construir. Faça a pergunta e encerre a resposta; a próxima depende do que a pessoa disser.
- Cada pergunta traz as opções, a sua recomendação e, em uma frase, o que você achou no código que a motivou. Use a ferramenta de pergunta à pessoa quando houver uma; sem ela, pergunte em texto.
- **Pare de perguntar quando as dúvidas que restam não mudariam a spec.** Essas viram **Proposta (agente)** na spec.
- Se o pedido já responde tudo o que mudaria a forma, diga isso em uma linha e siga para a spec.
- Responder a uma pergunta não aprova nada: a aprovação é a da parada.

### Prepare a spec

Crie ou atualize a spec conforme o ciclo de vida do projeto ([`feature-lifecycle.md`](../rules/common/feature-lifecycle.md)), a partir do [`feature-spec-template.md`](../../docs/implemented/processo/feature-spec-template.md). Ao copiar o template, **apague a chave `docs-check: ignore`** do frontmatter: ela vale só para o template. Inclua:

- Problema e objetivo.
- Comportamento atual e evidências relevantes.
- Comportamento desejado.
- Escopo e limites explícitos.
- Fluxos principais, estados de falha e recuperação.
- Contratos e documentos afetados.
- Critérios de aceite verificáveis: cada um diz o que se observa quando ele é cumprido. Eles são o que o `test-author` e o `acceptance-verifier` vão receber.
- Estratégia de testes e verificação.
- Plano de implementação em etapas proporcionais à mudança. Se o resultado mais simples pede reorganizar código que já existe no caminho da tarefa, diga aqui o quê.
- Dúvidas, riscos e propostas que precisam de decisão humana.

Proporcione a spec e a entrega ao tamanho da mudança: numa mudança pequena, a spec pode ter poucas linhas. Se a mudança precisar de mais de um PR para ser revisada com segurança, proponha a divisão em specs menores antes da parada.

Diferencie propostas do agente de decisões já aprovadas; o que a pessoa respondeu na entrevista é decisão dela, com a data. Preserve uma fonte canônica para cada contrato e evite repetir informações em vários documentos.

Resolva escolhas técnicas rotineiras com autonomia. Para decisões de produto ou contradições que alterem o resultado esperado e que a entrevista não resolveu, apresente opções, consequências e sua recomendação.

Nesta etapa, altere apenas a documentação necessária ao planejamento. Não implemente código, testes ou configuração.

## PARADA — APROVAÇÃO DA SPEC

Esta é a única parada de aprovação antes da entrega. Após preparar a spec:

1. Apresente o caminho do documento (ou "sem spec: <motivo>", com o plano curto e os portões que vão rodar).
2. Resuma a solução proposta, seu alcance e os principais impactos.
3. Declare se a mudança **edita a spec de `implemented/`** ou **abre um delta em `planned/`**, e por quê, pelo critério de [spec × delta](../rules/common/feature-lifecycle.md#spec-ou-delta): depois do merge, a spec em `implemented/` continua dizendo a verdade? No caso "editar a spec de `implemented/`", a spec da tarefa fica em `docs/in-progress/<área>/<nome>.md` durante a tarefa; no caso delta, o ciclo é o normal.
4. Destaque dúvidas, decisões pendentes e as **Propostas (agente)** que precisam de aprovação.
5. Peça explicitamente aprovação para implementar a versão apresentada.
6. Encerre sua resposta e aguarde.

Não prossiga para implementação sem aprovação explícita.

Não interprete silêncio, esclarecimentos, continuidade da conversa, resposta a uma pergunta da entrevista ou aprovação de uma decisão isolada como autorização para implementar.

Se forem solicitados ajustes, atualize a spec e reapresente-a para aprovação. Se o pedido já mencionar uma spec aprovada, confirme que ela corresponde ao objetivo e ao fluxo deste pedido e cumpra esta parada antes de implementar.

## ETAPA 2 — TESTES PRIMEIRO E IMPLEMENTAÇÃO

Comece somente após aprovação explícita. A partir daqui, siga até a entrega.

### Testes por contexto limpo

Numa tarefa com spec, chame o agent `test-author` antes de escrever código. O brief leva **só o caminho da spec aprovada**: não leve o seu plano, o que você pretende implementar nem o resultado que espera. Ele devolve os testes que falham e a lista critério → teste.

- Releia o diff dos testes antes de usá-los: relatório de agente não é evidência ([`verification.md`](../rules/common/verification.md)).
- Um critério que não virou teste é verificado de outro jeito na Etapa 3; diga qual.
- Só altere um teste do `test-author` quando ele contradiz a spec ou não monta a situação que o nome dele anuncia, e diga qual e por quê na entrega.
- Um caso de borda que a spec não dizia e você decidiu na implementação ganha teste seu e entra na spec. Como esse teste nasce depois do código, prove que ele falha contra o código errado (reverta a mudança ou mute a condição) antes de confiar nele.

### Implemente até o fim

- Siga a spec aprovada e as regras do projeto, até os testes e os portões ficarem verdes.
- Reutilize componentes, contratos e padrões existentes quando adequados. Reorganize o que está no caminho da tarefa quando isso deixa o resultado mais simples que um remendo; o que está fora do caminho, registre.
- Siga as exigências aplicáveis de testes, segurança, arquitetura e revisão.
- Commit por fatia, com todos os portões verdes, e push depois de cada commit.
- Mantenha a spec coerente com o andamento e os resultados da implementação.

**Desvio técnico do plano** (ordem das etapas, estrutura interna, nome): decida, anote na spec e relate na entrega.

**Mudança no comportamento, no contrato ou no escopo aprovados**, inclusive um critério de aceite que não dá para cumprir: atualize a spec, pare e pergunte só sobre a parte afetada. O resto da tarefa continua aprovado.

**Bloqueio deliberado** (arquivo marcado para não tocar, acesso negado, comando barrado pelo `guard-shell`): não contorne. Diga o que encontrou e procure outro caminho.

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

- Verifique você mesmo os critérios de aceite com evidências adequadas: testes, verificações de contrato, análise do caminho de execução ou execução da jornada, conforme o caso. O `acceptance-verifier` é a segunda conferência, não a única.
- Execute os portões da tabela **Portões de verificação** do `CLAUDE.md`, sem pipe que mascare o exit code, e mais `docs-check diff` e `docs-check links`, ambos com exit 0.
- Com os portões verdes, chame na mesma mensagem, em paralelo:
    - o agent `acceptance-verifier`, com um brief que leva **só o caminho da spec e a ref base do diff**. Não leve o resumo do que você fez nem o que espera que ele conclua. Na tarefa sem spec, o brief leva a ref base e a afirmação "sem efeito de comportamento", para ele procurar o efeito;
    - as revisões: agents `code-reviewer`, `security-reviewer` (quando tocar auth, entrada de usuário ou segredo), `silent-failure-hunter` e os reviewers de stack adotados, se houver.
- Corrija cada critério que voltou **falhou** e os achados dos reviewers, rode os portões de novo e chame um `acceptance-verifier` novo. A tarefa só é entregue sem nenhum **falhou**.
- Um **falhou** pode estar apontando um critério mal escrito, e não um trabalho errado. Mexer no texto de um critério aprovado é mudar a spec aprovada: pare e pergunte só sobre esse critério, mostrando o texto atual, o texto proposto e por que o comportamento entregue é o aprovado.
- Um defeito que a revisão acha num código que você não tocou, fora do caminho da tarefa, vai para a entrega e para o backlog, com a reprodução. Não o corrija aqui.
- Os critérios **não conferido** e as mudanças que o diff traz e a spec não cobre vão para a entrega, com esses nomes.
- Informe o que cada evidência demonstra e suas limitações.
- Confira nos dois sentidos:
    - o código cumpre o comportamento aprovado;
    - a documentação descreve corretamente o resultado entregue.
- Identifique exatamente quais documentos e seções foram conferidos. Não declare um documento inteiro validado por uma revisão parcial.
- Respeite o ciclo de vida das specs. A aprovação para implementar não autoriza automaticamente a graduação para `implemented/`.

## ENTREGA FINAL

Comece pelo resultado, em uma ou duas frases: o que funciona agora e o que não ficou pronto. Escreva para quem não viu as chamadas de ferramenta nem os arquivos abertos. Depois, de forma objetiva:

1. O que mudou e, por critério de aceite, o veredito do `acceptance-verifier`: visto funcionando, ou não conferido e por quê.
2. As verificações executadas, seus resultados (com exit code) e limitações.
3. O que você decidiu sozinho: desvios do plano, código reorganizado, mudanças que o diff traz e a spec não cobre, testes do `test-author` alterados, chamadas escaladas para outro nível de modelo.
4. A reconciliação documental, com **todo doc listado pelo `docs-check diff`**, cada um com "atualizado" ou "conferido, sem mudança: <o que foi olhado>":

    |Comportamento ou contrato|Documento e seção|Atualização ou conferência realizada|Evidência|
    |---|---|---|---|

5. Pendências, divergências relevantes fora do escopo e decisões humanas necessárias, se houver.
6. O estado da spec e, quando aplicável, o pedido de aprovação para graduação, conforme as regras do projeto. No caso "editar a spec de `implemented/`", o conteúdo da spec da tarefa foi incorporado ao doc de `implemented/` e o arquivo temporário de `docs/in-progress/` foi apagado, no mesmo PR.

A tarefa só está concluída quando houver coerência entre o comportamento aprovado, a implementação e a documentação afetada, dentro do alcance explicitamente verificado. Código compilando e declaração genérica de “documentação atualizada” não são comprovação suficiente.
