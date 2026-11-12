# Portões de verificação — regras de uso (obrigatórias)

> Regra local do projeto. Os comandos ficam na tabela **Portões de verificação** do
> [`CLAUDE.md`](../../../CLAUDE.md); aqui está **como** usá-los e como não se enganar com o resultado. Onde esta
> regra e uma skill vendorizada discordarem, esta regra vence.

## 1. Nunca mascare o código de saída

`| tail`, `| head`, `| grep` e flags de silêncio trocam o `$?` do portão pelo do pipe: um portão vermelho lê
verde. O único idioma seguro é não usar pipe:

```sh
<comando do portão> > "$TMPDIR/portao.log" 2>&1; echo "EXIT: $?"; tail -20 "$TMPDIR/portao.log"
```

Não confie em variáveis de status de pipe como saída de emergência: o nome e a indexação mudam de um shell para
outro, e a grafia errada expande para vazio, o que lê como sucesso. O hook `guard-shell` bloqueia portão com
pipe; ajuste os padrões dele (`VERIFY_GATES`) ao preencher a tabela do `CLAUDE.md`.

## 2. O commit depende do código de saída, não de você ter lido o `echo`

Ler o código de saída não impede de ignorá-lo: `portão; echo; git commit` commita mesmo com `EXIT: 1`, porque o
`;` não para em falha. Num comando que roda portões **e** commita, guarde cada código e condicione o commit a
todos:

```sh
<comando de lint> > "$TMPDIR/l.log" 2>&1; L=$?
<comando de teste> > "$TMPDIR/t.log" 2>&1; T=$?
echo "LINT $L TESTE $T"
if [ $L -eq 0 ] && [ $T -eq 0 ]; then git add <arquivos> && git commit -m "<mensagem>"; fi
```

Um commit vermelho que já subiu custa um `fix:` a mais no histórico; um que entrou num merge custa mais.

**Na iteração, só os rápidos; antes do commit, todos.** A coluna "Quando" da tabela separa os portões que
rodam a cada ajuste ("na iteração") dos que demoram e rodam só antes do commit ("antes do commit"). Ela não
muda a regra acima: o comando que commita roda todos os portões, os dois grupos.

**"Rodei os portões locais" e "o CI vai passar" são afirmações diferentes.** Se o CI roda portões que a tabela
não lista, a tabela está incompleta: acrescente-os.

## 3. Uma afirmação negativa vale só onde você procurou

"X não existe", "X não é usado", "X não é afetado" são afirmações sobre o escopo da busca, não sobre o
repositório. Diga **onde** procurou, no próprio enunciado: "o script de deploy não lê `FOO`", não "`FOO` não
existe". Se a afirmação larga for mesmo necessária, a busca tem de ser larga: repositório inteiro, sem filtro de
extensão e **sem truncar a saída** (um `head` numa varredura esconde exatamente o arquivo que faltava).

Ao trocar um dado versionado (tabela, lista de constantes, texto de interface, caminho), busque também por um
**trecho literal do próprio dado**, não só pelo nome do módulo: busca por consumidor não acha quem copiou o dado.

## 4. Merge limpo não é merge verificado

Conflito de merge é sobreposição **textual**. Uma regra nova encontrando chamadas antigas, um texto renomeado
encontrando uma asserção intocada, uma prop nova encontrando um arquivo que nasceu sem ela: nada disso conflita,
e tudo quebra. Depois de todo merge numa branch de integração, rode **todos** os portões antes do push. O verde
de cada branch antes do merge não é evidência do verde depois dele.

## 5. A regra que vale é a do disco, não a do contexto

O conteúdo de `CLAUDE.md` e de `.claude/rules/**` entra no contexto no início da sessão, a partir do checkout
daquele instante. Se a sessão troca de base (`git checkout -B <branch> origin/<outra>`), o disco passa a ser
outro e nada avisa. **Antes de citar uma regra como razão para agir, e sempre antes de "corrigi-la", leia o
arquivo do disco.** O texto no contexto é plausível e já esteve certo, e é isso que torna o erro traiçoeiro.

## 6. Teste que passa de primeira é um resultado a investigar

Um teste escrito para falhar que passa na primeira execução não é atalho: pode estar medindo outra coisa.
Prove que ele falha contra o código errado (reverta a mudança, ou mute a condição) antes de confiar nele.

Testes de **determinismo, idempotência ou cache** que comparam duas execuções podem concordar por acidente de
granularidade (timestamp de baixa resolução, relógio de segundo inteiro, chave de cache por minuto). Afirme a
invariante **direto no artefato** (o campo cru que vai para os bytes, não um objeto reconstruído por um parser) e,
se a invariante é "igual em qualquer máquina", encarne duas máquinas no teste (fuso, locale, ordem de leitura de
diretório). Um portão que roda num único ambiente é cego a tudo que varia com o ambiente.

## 7. Antes de concluir de uma sonda: qual outro estado produziria a mesma resposta?

Uma sonda só decide algo se o estado alternativo produziria uma resposta diferente. Estabeleça o **controle**
antes: um caso sabidamente bom e um sabidamente ruim, medidos do mesmo jeito. Ao medir durante uma operação em
curso, a resposta é o estado **antes** dela, não o resultado dela.

Vale também para perguntas sobre o código, sem ambiente no meio: a forma do dado armazenado não decide o que a
tela mostra; quem decide é o caminho de leitura. Antes de responder "X não é afetado por Y", ache o ponto em que
X lê Y. Se não achar, diga que não achou.

Quando o valor comparado vem de uma fonte externa (uma API, um serviço), **capture os dois lados do ambiente
real** antes de escrever a comparação. Um teste construído sobre o formato que você supôs codifica a suposição.

## 8. Recurso que pode degradar sem mudar a saída precisa de detector

Se um recurso pode parar de funcionar e a saída continuar igual (um cache que nunca acerta, um "pular o que não
mudou" que nunca pula, um filtro que nunca filtra), nenhum teste do caminho feliz vai notar. Na hora do desenho,
pergunte: **se isto parar de funcionar, o que na saída muda?** "Nada" é uma resposta válida, e obriga a
construir antes um detector que faça a degradação aparecer (uma contagem, um diagnóstico, um alarme quando o
número é zero).

## 9. Relatório de agente não é evidência

O resumo de um subagente volta no mesmo tom confiante, acerte ou erre. Antes de commitar o que um agente
escreveu, **leia o diff de volta** (`git diff`) e confira no código cada fato que ele afirmou. Num brief de
edição de docs, proíba explicitamente citar texto de interface que o agente não leu no código, fundir ou apagar
linhas de tabela e reescrever decisões datadas.

**Agent imitado não tem as restrições do agent de verdade.** Um agent criado durante a sessão pode só ficar
disponível pelo nome depois que o Claude Code o recarrega. Até lá, quem o chama por um `general-purpose` mandado
"seguir `.claude/agents/<nome>.md`" ganha o prompt, mas não o `tools:` nem o `model:` dele: um verificador que
"não edita" pode editar. Depois de cada chamada imitada, confira `git status` antes de confiar no relatório, e
diga na entrega que o agent foi imitado.

## 10. Ferramenta que escreve em ambiente real: teste a escotilha primeiro

Numa ferramenta que escreve dados reais, os caminhos de exceção (flag de força, rollback, modo de reparo) rodam
no pior dia e costumam ser os menos testados. Eles vêm **antes** do caminho normal na lista de testes, e cada
um precisa de um teste que prove **o que ele preserva**, não só que ele roda. A pergunta que pega a classe: "o
que este caminho faz com a entrada que o caminho normal nunca produz?"
