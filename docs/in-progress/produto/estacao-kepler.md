---
conferido-em: 2026-11-12
---

# Feature — Estação Kepler

> Spec em `in-progress/`: em construção. A forma técnica (motor, módulos, orçamento de desempenho) está em
> [`../arquitetura/estacao-kepler-motor.md`](../arquitetura/estacao-kepler-motor.md); aqui fica só o que o
> jogador vê e faz.
>
> Convenção desta spec: o que a pessoa escreveu no pedido aparece sem marca. O que o agente acrescentou está
> marcado **Proposta (agente)**; a pessoa aprovou a spec inteira, com essas propostas e as recomendações de
> "Dúvidas e decisões", na sessão de 2026-11-12. A marca fica como registro de origem.

## Propósito

FPS 3D no navegador, de uma sessão só, para aparecer num vídeo como demonstração. Precisa impressionar nos
primeiros 10 segundos e ser gostoso de jogar; **a sensação de tiro é o requisito que não pode falhar**.

Premissa: você é a última técnica acordada numa estação em órbita de um planeta gelado; a inteligência da
estação virou os robôs de manutenção contra a tripulação. Você cruza a estação setor por setor até a sala do
núcleo para desligá-la. O ritmo é: entrar numa sala, ler os inimigos, usar cobertura e a arma certa, sair quase
sem munição.

Restrições do pedido: Vite e Three.js; tudo gerado no código (modelos, texturas, luzes, efeitos, sons), sem
arquivo de fora; ícones e interface em SVG desenhado à mão no código, sem emoji e sem biblioteca de ícones; som
com Web Audio; roda com `npm run dev`.

## Comportamento atual

O repositório é o template docs-first sem nenhum código de aplicação: não há `package.json`, `src/` nem `## Stack`
preenchida no `CLAUDE.md` (procurado na raiz do repositório e em `docs/`). Não há spec anterior a reconciliar;
`docs-check stale` saiu com 0 docs desatualizados (os 2 docs conferidos são de processo e não tocam esta tarefa).

## Rotas e navegação

Página única servida pelo Vite na raiz (`npm run dev` → `http://localhost:5173/`). As telas são estados do jogo,
não rotas:

```
Título ──Jogar──▶ Setor 1 Hangar ──saída──▶ Setor 2 Laboratórios ──saída──▶ Setor 3 Estufa ──saída──▶ Núcleo (chefe)
                       │                          │                              │                       │
                       └──────── Esc ──▶ Pausa (Continuar · Recomeçar setor · Sair para o título)        └─chefe morre─▶ Vitória
                       └──────── vida 0 ──▶ Morte (Tentar de novo do começo do setor · Título)
```

## Fluxo desejado

1. **Título**: a estação girando no fundo, o planeta gelado atrás, botão de jogar.
2. **Setor 1, hangar**: espaço grande, luz fria, poucos inimigos, para aprender.
3. **Setor 2, laboratórios**: corredores estreitos, luz vermelha de alarme piscando, portas que abrem com
   interruptor.
4. **Setor 3, estufa**: plantas, vidro com o planeta lá fora e neblina.
5. **Núcleo**: o chefe, um robô gigante com 3 fases de ataque e barra de vida no topo da tela.
6. **Vitória**: tela com o tempo total.

Em qualquer ponto, Esc pausa; ao morrer, a tela de morte oferece tentar de novo do começo do setor. Cada setor tem
cobertura, caixas, munição e vida espalhadas e um caminho claro até a saída.

**Proposta (agente)** — detalhes do fluxo que o pedido não fixa:

- **Primeiros 10 segundos.** O título já é a vitrine: a estação girando com luz de borda, o planeta com
  atmosfera e as estrelas, e um texto curto de premissa. Do clique em "Jogar" ao primeiro controle não há
  carregamento perceptível (tudo é gerado no código, sem download).
- **Progressão de armas.** A pistola vem desde o início; o **rifle** fica no hangar, no caminho da primeira luta
  de verdade; a **escopeta** fica no começo dos laboratórios, antes do primeiro brutamontes. Assim o jogador
  aprende a arma certa para cada robô. Alternativa: as três desde o início (mais simples, menos "leitura").
- **Saída do setor.** Uma porta de saída marcada com luz verde, que destrava quando o setor é limpo (hangar e
  estufa) ou quando o último interruptor é acionado (laboratórios). Uma seta no HUD aponta a saída depois que o
  setor é liberado.
- **Transição de setor.** Fade curto com o nome do setor ("Setor 2 — Laboratórios"); o progresso do setor
  anterior é salvo em memória como ponto de reinício.
- **Pausa.** Esc solta o mouse (comportamento nativo do navegador) e a soltura do mouse **é** o gatilho da pausa:
  o jogo para (simulação, tempo e música de combate). "Continuar" exige um clique para travar o mouse de novo.
  Opções: Continuar, Recomeçar setor, Sair para o título.
- **Morte.** Câmera cai, tela escurece em vermelho; opções: Tentar de novo (começo do setor) e Título.
- **Reinício do setor.** Restaura o estado do jogador **na entrada do setor** (vida, escudo, armas e munição) e
  recria inimigos, caixas, pickups e portas do setor como no início. É o mesmo caminho para a morte e para
  "Recomeçar setor".
- **Tempo total.** Conta o tempo de jogo real desde o clique em "Jogar" até a morte do chefe, **sem pausas** e
  **somando as tentativas** (a morte custa tempo). A vitória mostra o tempo total e o número de mortes; botão
  "Jogar de novo".
- **Vitória e "Jogar de novo"** zeram tudo e voltam ao hangar.

## Controle

Mira no centro, mouse travado na tela, WASD, pulo, agachar e correr com Shift.

**Proposta (agente)**: Espaço pula, Ctrl ou C agacha (segurar), Shift corre só para a frente e não deixa atirar
(a arma baixa enquanto corre, como compromisso de leitura). Agachar reduz a altura do olho, a velocidade e a
abertura da mira, e esconde o corpo atrás de cobertura baixa. Sensibilidade fixa; sem menu de opções.

## Armas

Pistola com munição infinita, rifle automático e escopeta potente de perto. Troca pelo 1, 2, 3 e pela roda do
mouse, com animação de troca e de recarga (R).

Em **todas** as armas, atirar tem: coice que sobe a mira e volta; clarão no cano e cápsula voando; som próprio;
balanço da arma ao andar.

**Proposta (agente)** — números iniciais, ajustados no playtest:

| Arma | Modo | Pente / reserva | Dano corpo | Cabeça | Cadência | Recarga |
| --- | --- | --- | --- | --- | --- | --- |
| Pistola | semiautomática | 12 / infinita | 22 | ×2 | 4 tiros/s | 1,1 s |
| Rifle | automático | 30 / 120 (máx. 240) | 16 | ×2 | 10 tiros/s | 1,8 s |
| Escopeta | bomba | 6 / 24 (máx. 36) | 9 balins × 12 | ×1,5 | 1,1 tiros/s | 0,45 s por cartucho, interrompível |

- Mira: as quatro marcas do centro abrem a cada tiro e ao mover, pular ou correr, e fecham ao parar ou agachar;
  a abertura **é** a dispersão do tiro (o que se vê é o que acerta).
- Sem munição no pente: clique seco com som próprio; R recarrega; pente vazio recarrega sozinho ao tentar
  atirar se houver reserva.
- Trocar de arma cancela a recarga em curso.

## Inimigos

- **Drone** voador rápido que dá rasante.
- **Sentinela** que atira de longe e se esconde atrás de cobertura.
- **Brutamontes** lento com escudo frontal, que só cai pelas costas ou com a escopeta.

Todos patrulham, ouvem tiro, cercam pelo lado e não ficam presos em parede. O robô atingido solta faísca e recua;
ao morrer, desmonta em pedaços com física e às vezes solta munição ou vida.

**Proposta (agente)** — como cada um fica diferente de jogar:

| | Drone | Sentinela | Brutamontes |
| --- | --- | --- | --- |
| Vida | 40 | 70 | 260 |
| Ponto fraco (cabeça) | olho central | sensor da cabeça | cabeça, só alcançável de lado ou por trás |
| Movimento | voa rápido, oscila na altura | anda a meia velocidade entre pontos de cobertura | anda devagar, sempre virando para o jogador |
| Ataque | rasante: mira, avisa com luz e som, mergulha e passa por você (dano de contato) | rajada de 3 tiros de longe, com traçante visível e telegrafada por um laser vermelho | soco de perto e investida curta quando você fica parado na frente |
| Leitura | mata-se rápido, mas é difícil acertar no ar | sai da cobertura para atirar e volta; flanqueia se você fica escondido muito tempo | o escudo bloqueia pistola e rifle pela frente (faísca azul e "tim" metálico); a escopeta atravessa a 50%; por trás, dano cheio |

- **Estados de IA** comuns: patrulha → alerta (ouviu tiro ou viu) → combate → busca (perdeu o jogador) → patrulha.
  Tiro do jogador é ouvido num raio por arma; o robô que ouve avisa os vizinhos próximos.
- **Cercar pelo lado**: em combate, os robôs escolhem posições de ataque espalhadas em ângulo ao redor do jogador
  em vez de virem em fila; a sentinela troca de cobertura para um flanco.
- **Não ficar preso em parede**: todo movimento de chão segue caminhos calculados no mesmo mapa que define as
  paredes; drones contornam pelo alto e pelos mesmos caminhos.
- **Atingido**: faísca no ponto do acerto, recuo curto proporcional ao dano, pisca branco.
- **Morte**: o modelo desmonta nas peças de que é feito, que voam com gravidade, quicam no chão e somem depois de
  alguns segundos. Chance de drop: 35% munição da arma atual (ou de uma arma que esteja com reserva baixa), 15%
  vida, conforme a tabela de drop.

**Proposta (agente)** — distribuição por setor (ajustada no playtest):

- Hangar: 3 drones e 2 sentinelas, em duas levas; cobertura generosa.
- Laboratórios: drones e sentinelas em corredores, 2 brutamontes; 3 interruptores de porta.
- Estufa: a mistura dos três, em mais quantidade, com a neblina reduzindo o alcance das sentinelas.

## Chefe — Núcleo

Robô gigante com 3 fases de ataque e barra de vida no topo da tela.

**Proposta (agente)**:

- **Fase 1 (100–66%)**: metralhadora em rajadas que varrem a arena, com aviso por laser; caminha devagar. A
  cobertura da arena aguenta os tiros.
- **Fase 2 (66–33%)**: troca de fase com um grito sonoro e tremor; lança mísseis lentos que perseguem o jogador
  (podem ser derrubados a tiro) e chama 2 drones.
- **Fase 3 (33–0%)**: blindagem cai e o núcleo vermelho do peito fica exposto (dano ×2); varre a arena com um
  laser baixo que obriga a pular e um alto que obriga a agachar; ondas de choque no chão.
- A barra de vida no topo mostra as três fases como divisões. Pickups de munição reaparecem na arena a cada troca
  de fase, para o jogador não ficar sem saída.
- Ao morrer: desmonta em pedaços grandes, a luz da sala apaga em sequência, e a tela de vitória entra.

## Tela durante o jogo (HUD)

Vida, escudo, munição da arma atual, setor atual e uma mira que abre quando você atira. Acertar dá marcador de
acerto com som e um tremor leve na câmera; o tiro na cabeça tem marcador e som diferentes.

**Proposta (agente)**: HUD em SVG desenhado no código, sobre o canvas, em estilo de visor de capacete (ciano frio,
laranja de alerta). Indicador de direção do dano na borda da mira; vinheta vermelha com vida baixa; ícone da arma
atual; aviso "RECARREGAR" com pente vazio. O **escudo** absorve o dano primeiro e se recarrega sozinho depois de 4 s
sem levar dano; a **vida** só volta com pickup.

## Som

Ambiente por setor, música que acelera no combate e alarme no laboratório.

**Proposta (agente)**: tudo sintetizado com Web Audio (osciladores, ruído filtrado, envelopes). Cada arma tem
disparo, recarga e troca próprios; cápsulas tilintam no chão; robôs têm som de passo/rotor, alerta, dano e morte;
marcador de acerto e de tiro na cabeça diferentes. A música é um loop sintetizado cujo andamento e camadas sobem
quando algum robô está em combate e voltam ao calmo quando não há. O áudio liga no primeiro clique (exigência do
navegador).

## Formato dos dados

Nada é persistido: sem salvamento, sem `localStorage`, sem servidor. O estado vive em memória durante a partida:

- **Jogador**: vida, escudo, armas que possui, munição por arma (pente e reserva), posição.
- **Snapshot de entrada do setor**: cópia do estado do jogador ao entrar no setor; é o que a morte e o
  "Recomeçar setor" restauram.
- **Setor**: definido em dados no código (mapa de células + entidades), recriado do zero a cada reinício.
- **Cronômetro**: tempo de jogo acumulado e número de mortes. **Derivado**: o tempo exibido na vitória.

## Estados de falha e recuperação

**Proposta (agente)**:

- **Mouse solto** (Esc, alt-tab, perda de foco da janela, aba escondida): vira pausa; nada roda enquanto
  pausado. O áudio também pausa com a aba escondida.
- **Pedido de trava do mouse recusado** pelo navegador (por exemplo, logo depois de soltar): o jogo continua em
  pausa e mostra "Clique para continuar"; a recusa não vira erro no console.
- **Áudio bloqueado** antes do primeiro clique: o jogo funciona mudo até o clique, sem erro no console.
- **WebGL indisponível**: tela de mensagem explicando que o navegador precisa de WebGL, em vez de tela branca.
- **Queda de desempenho**: a resolução interna cai sozinha quando o quadro passa do orçamento (detalhe em
  arquitetura).
- **Itens não aplicáveis**: reentrega e idempotência, permissões, migração de dados antigos e persistência não
  se aplicam (jogo local, sem servidor, sem usuário, sem dado salvo). Estado vazio: não existe; todo setor nasce
  dos seus dados.

## Observabilidade

**Proposta (agente)**: em `npm run dev`, um painel de diagnóstico ligado por F3 mostra FPS, tempo de quadro,
draw calls e triângulos (`renderer.info`) e o estado de IA de cada robô; e um gancho de teste
`window.__kepler` (só em desenvolvimento, removido do build) permite pular de setor, matar os inimigos do setor e
ligar imortalidade, para o teste de ponta a ponta. Erro inesperado na simulação vai para o console com contexto e
mostra uma tela de erro em vez de travar em silêncio.

## Fora de escopo

**Proposta (agente)**: menu de opções (sensibilidade, volume, gráficos), salvamento entre sessões, celular e
toque, controle de videogame, multiplayer, placar online, tradução para outro idioma, acessibilidade além do
básico (legível, sem depender só de cor nos avisos críticos).

## Critérios de aceite e como cada um é verificado

Os critérios são os do pedido; a coluna **Verificação** é **Proposta (agente)**. "Manual" quer dizer jogado por
uma pessoa, com o que foi observado relatado na entrega.

| # | Critério (do pedido) | Verificação |
| --- | --- | --- |
| 1 | Dá para sair do hangar, passar pelos 3 setores e vencer o chefe, do começo ao fim, numa partida só. | **E2E** (Playwright): título → jogar → em cada setor, limpa os inimigos pelo gancho de teste, atravessa até a saída → chefe derrotado → tela de vitória com tempo. **Unitário**: em cada setor existe caminho da entrada até a saída e todo pickup é alcançável. **Manual**: uma partida completa sem gancho. |
| 2 | Os 3 tipos de robô se comportam de jeitos diferentes, e dá para notar isso jogando. | **Unitário**: transições de estado de cada IA (patrulha, alerta por tiro ouvido, combate, flanco, busca) e a regra do escudo frontal do brutamontes. **Manual**: playtest descrevendo o comportamento observado de cada um. |
| 3 | Em todas as armas, atirar tem coice que sobe a mira e volta; clarão no cano e cápsula voando; som próprio; balanço da arma ao andar. | **Unitário**: o coice sobe e volta ao zero (mola) e o estado de tiro/recarga/troca de cada arma. **E2E**: captura de tela no quadro do disparo de cada arma (clarão e cápsula visíveis). **Manual**: som e balanço. |
| 4 | Acertar dá marcador de acerto com som e um tremor leve na câmera; o tiro na cabeça tem marcador e som diferentes. | **Unitário**: a regra de dano separa corpo e cabeça e devolve o tipo de acerto que o HUD usa. **Manual**: marcador, som e tremor. |
| 5 | O robô atingido solta faísca e recua; ao morrer, desmonta em pedaços com física e às vezes solta munição ou vida. | **Unitário**: tabela de drop com sorteio determinístico (semente) cobre os três resultados. **Manual** + captura de tela da morte. |
| 6 | Roda liso num notebook comum, e o console do navegador não mostra nenhum erro durante a partida. | **E2E**: o teste da partida completa falha se houver qualquer `console.error` ou `pageerror`. **Medição**: FPS e draw calls do painel F3 em cada setor, nesta máquina, relatados na entrega. **Limitação**: "notebook comum" não é medível daqui; o orçamento da arquitetura é o substituto. |

**Proposta (agente)** — critérios que faltaram no pedido:

| # | Critério | Verificação |
| --- | --- | --- |
| 7 | Esc pausa em qualquer setor e no chefe; "Continuar" volta exatamente de onde parou; o tempo não corre na pausa. | **Unitário**: cronômetro. **E2E**: pausa pelo gancho (o navegador sem tela não trava o mouse de verdade). **Manual**: Esc real. |
| 8 | Morrer em qualquer setor e tentar de novo restaura o jogador ao estado de entrada do setor e recria o setor. | **Unitário**: snapshot e restauração. **E2E**: morte forçada pelo gancho → tentar de novo → setor e munição como na entrada. |
| 9 | Nenhum arquivo externo: o build não contém imagem, áudio, modelo ou fonte além do código. | **Verificação de build**: listar `dist/` e conferir que só há HTML, JS e CSS. |
| 10 | O brutamontes não toma dano de pistola nem de rifle pela frente; toma da escopeta e por trás. | **Unitário** na regra de dano por ângulo. **Manual**. |

## Decisões

Aprovadas pela pessoa em 2026-11-12, com as recomendações abaixo: uma spec em 4 fatias (A), interface em
pt-BR, tempo sem pausas somando tentativas, reinício pelo estado de entrada do setor, rifle no hangar e escopeta
no laboratório. As decisões técnicas estão em
[`../arquitetura/estacao-kepler-motor.md`](../arquitetura/estacao-kepler-motor.md#decisões).

## Dúvidas e decisões (resolvidas em 2026-11-12)

1. **Divisão em PRs.** Um jogo inteiro do zero é grande para revisar de uma vez. Opções:
   - **(A, recomendada)** uma spec só, construída em 4 fatias jogáveis, cada uma com commit e push próprios, na
     ordem do pedido: (1) controle, armas e sensação de tiro numa sala de teste; (2) os 3 robôs; (3) setores,
     portas, fluxo de telas, reinício e chefe; (4) som, título e acabamento. O revisor lê fatia por fatia pelos
     commits, e o PR sai quando você pedir. Sem risco de produção: é um projeto novo, sem usuário e sem dado.
   - **(B)** 4 specs e 4 PRs, um por fatia. Mais cerimônia e mais tempo de revisão; vale se a revisão for feita
     por outra pessoa, fatia a fatia, antes da próxima começar.
2. **Idioma da interface**: recomendo **pt-BR** (o pedido, os nomes dos setores e o público do vídeo estão em
   português). Alternativa: inglês, se o vídeo for para fora.
3. **Tempo total**: recomendo contar **sem pausas e somando as tentativas** (ver Fluxo). Alternativa: só a
   tentativa vencedora de cada setor.
4. **Reinício do setor**: recomendo restaurar o estado de **entrada** do setor e recriar o setor inteiro.
5. **Progressão de armas**: recomendo pegar o rifle no hangar e a escopeta no laboratório. Alternativa: as três
   desde o início.

## Riscos

- **Sensação de tiro é subjetiva.** Só o playtest decide; os números da tabela de armas são ponto de partida, e
  o plano reserva uma rodada de ajuste depois da fatia 1.
- **"Roda liso num notebook comum"** não é medível nesta máquina; a mitigação é o orçamento de desempenho e a
  resolução adaptativa.
- **Navegador sem tela não trava o mouse.** O E2E prova o fluxo, os setores e a ausência de erro, não a sensação
  de controle; isso fica para o playtest manual.

<!-- Seções de plano: entram quando a spec vai para in-progress/ e saem na graduação. -->

## Plano de build

### Escopo e fatias

Na ordem do pedido (o mais difícil primeiro). Cada fatia termina jogável e com os portões verdes.

1. **Sensação de tiro** — projeto Vite na raiz, laço de jogo, trava do mouse e pausa, movimento (WASD, pulo,
   agachar, correr) com colisão, as 3 armas com coice, clarão, cápsula, balanço, troca e recarga, mira dinâmica,
   marcador de acerto e de cabeça com tremor, sons de arma e de acerto; numa sala de teste com alvos. **Parada para
   playtest** da sensação antes da fatia 2.
2. **Inimigos** — percepção (visão e audição), navegação em grade, flanco, e os 3 robôs; faísca e recuo; morte
   que desmonta; drops; dano no jogador, escudo e vida; HUD de vida e escudo.
3. **Setores e fluxo** — dados e construção dos 3 setores e da arena do núcleo (cobertura, caixas, pickups,
   portas, interruptores, saída), luzes e neblina por setor, transições, morte e reinício, pausa completa, chefe
   de 3 fases com barra, vitória com tempo; gancho de teste e E2E da partida completa.
4. **Som e acabamento** — ambiente por setor, música adaptativa, alarme do laboratório; título com a estação
   girando; pós-processamento e ajuste de desempenho; rodada de ajuste de números.

### Definição de pronto

Todos os portões do `CLAUDE.md` verdes (lint, typecheck, teste com cobertura, build, auditoria, E2E,
`docs-check diff` e `docs-check links`); os 10 critérios verificados como na tabela; playtest manual relatado;
revisões `code-reviewer`, `silent-failure-hunter` e `typescript-reviewer` (se adotado) sem item CRÍTICO ou ALTO
aberto.

### Feito vs pendente

- [x] Dia zero: `## Stack`, portões, `VERIFY_GATES`, `.gitignore` (commit do `git mv`)
- [x] Adoção do ECC: `typescript-reviewer` e as rules `typescript/*` e `web/*`
- [x] Fatia 1 — sensação de tiro (sala de treino no hangar, com alvos; F2 em desenvolvimento dá as três armas)
- [x] Playtest da fatia 1 (feito pela pessoa em 2026-11-12; sem ajustes pedidos)
- [x] Fatia 2 — inimigos
- [x] Fatia 3 — setores e fluxo
- [ ] Fatia 4 — som e acabamento
- [ ] Verificação, revisão e entrega
