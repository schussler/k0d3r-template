---
conferido-em: 2026-11-12
---

# Feature — Estação Kepler

> Spec em `in-progress/`: em construção. Marcação usada no texto:
> **[pessoa]** é o que a pessoa escreveu no pedido; **Aprovado (proposta do agente)** é sugestão do agente que a
> pessoa aprovou na parada da `/k0d3r-task` em 2026-11-12. Números de ajuste (dano, velocidade, tempos) são **valores
> iniciais** de tuning, não contrato.

## Propósito

**[pessoa]** FPS em 3D no navegador. A jogadora é a última técnica acordada numa estação espacial em órbita
de um planeta gelado; a IA da estação virou os robôs de manutenção contra a tripulação. Ela atravessa a
estação setor por setor até a sala do núcleo para desligá-la. A graça é o ritmo: entrar numa sala, ler os
inimigos, usar a cobertura e a arma certa, e sair quase sem munição.

**[pessoa]** O jogo vai aparecer num vídeo para milhares de pessoas: precisa impressionar nos primeiros 10
segundos de tela e ser gostoso de jogar. **O que não pode falhar é a sensação de tiro.**

## Comportamento atual

Não há jogo nem aplicação. Evidência (2026-11-12, branch `medusa`): o repositório não tem `package.json` nem
pasta `src/`; o `git ls-files` lista só o toolset (`.claude/`, `scripts/`) e os docs; a seção `## Stack` e a
tabela "Portões de verificação" do `CLAUDE.md` estão com placeholders. É uma feature nova: ciclo normal
`planned/` → `in-progress/` → `implemented/`, sem spec em `implemented/` a editar.

## Rotas e navegação

- **[pessoa]** O jogo abre com `npm run dev` (servidor do Vite), numa página única.
- **Aprovado (proposta do agente):** `?debug` na URL liga o medidor de FPS e o gancho de teste (`window.__kepler`, ver
  [Estratégia de verificação](#estratégia-de-verificação)). Sem o parâmetro, nada disso existe na página,
  inclusive no `npm run dev`, que é o modo em que o jogo é avaliado.

## Fluxo do jogo

**[pessoa]**

1. Tela de título com a estação girando no fundo.
2. Setor 1, hangar: espaço grande, luz fria, poucos inimigos, para aprender.
3. Setor 2, laboratórios: corredores estreitos, luz vermelha de alarme piscando, portas que abrem com
   interruptor.
4. Setor 3, estufa: plantas, vidro com o planeta lá fora e neblina.
5. Núcleo: o chefe, um robô gigante com 3 fases de ataque e barra de vida no topo da tela.
6. Tela de vitória com o tempo total.

Em qualquer ponto Esc pausa; ao morrer, a tela de morte oferece tentar de novo do começo do setor. Cada setor
tem cobertura, caixas, munição e vida espalhadas e um caminho claro até a saída.

**Aprovado (proposta do agente)**, detalhes que o pedido deixa em aberto:

- **Saída do setor:** uma porta com interruptor no fim do setor; abrir não exige matar todos os inimigos (o
  ritmo vem do posicionamento das salas, não de trava). O interruptor e a porta têm luz-guia verde visível de
  longe. Ao atravessar, uma transição curta (fade + nome do setor) carrega o próximo.
- **Tentar de novo:** restaura o retrato tirado na entrada do setor (vida, escudo, munição e armas que a
  jogadora tinha ao entrar), recria inimigos e itens do setor. O cronômetro total **não** volta: o tempo da
  vitória inclui as mortes.
- **Escudo:** absorve o dano antes da vida e regenera depois de 4 s sem levar dano. Vida só volta com item.
- **Armas por setor:** pistola desde o início; rifle encontrado no hangar; escopeta encontrada no começo dos
  laboratórios (antes do primeiro brutamontes).
- **Tela de título:** botão "Jogar" (clique, que também é o gesto que libera áudio e trava o mouse) e um
  resumo dos controles.
- **Pausa:** "Continuar", "Recomeçar setor", sensibilidade do mouse e volume geral; essas duas configurações
  ficam no `localStorage` (leitura e escrita em `try/catch`; sem armazenamento, valem os padrões).

## Comportamento e regras

### Controle

**[pessoa]** Mira no centro, mouse travado na tela, WASD, pulo, agachar e correr com Shift.

**Aprovado (proposta do agente):**

- Teclas por `KeyboardEvent.code` (posição física: funciona em teclado ABNT2 e AZERTY). Pulo no Espaço,
  **agachar no C** (Ctrl é arriscado: Ctrl+W fecha a aba no meio do jogo).
- Correr aumenta a velocidade e a abertura da mira; não dá para atirar correndo (a arma abaixa), o que cria a
  troca "correr para a cobertura" × "atirar".
- Agachar reduz altura (passa sob obstáculos baixos e esconde atrás de caixas) e a abertura da mira.
- Colisão da jogadora: cápsula contra caixas alinhadas aos eixos (AABB) do mapa, com subpassos para não
  atravessar parede em queda ou corrida; escorrega ao longo da parede em vez de travar.

### Armas

**[pessoa]** Pistola com munição infinita, rifle automático e escopeta potente de perto. Troca pelo 1, 2, 3 e
pela roda do mouse, com animação de troca e de recarga (R). Em todas as armas, atirar tem: coice que sobe a
mira e volta; clarão no cano e cápsula voando; som próprio; balanço da arma ao andar.

| Arma | Disparo | Pente | Reserva | Papel | Valores iniciais |
| --- | --- | --- | --- | --- | --- |
| Pistola | semiautomático | 12 | infinita | precisa, sempre disponível | dano 20, cabeça ×2 |
| Rifle | automático, 10 tiros/s | 30 | 120 máx. | dano por segundo médio, abre com rajada | dano 14, cabeça ×2 |
| Escopeta | ação de bomba | 6 | 30 máx. | 8 projéteis, queda forte de dano com a distância, derruba o escudo do brutamontes | 12 por projétil |

**Aprovado (proposta do agente):**

- Tiro por raio instantâneo (hitscan) contra as caixas de acerto dos robôs (cabeça separada do corpo) e
  contra a geometria do mapa; a escopeta lança 8 raios num cone.
- Recarga com pente parcial guarda a bala na câmara; troca de arma cancela a recarga. Recarga automática ao
  esvaziar o pente se houver reserva; sem reserva, clique seco com som próprio.
- Animações procedurais no modelo da arma em primeira pessoa: troca (desce e sobe), recarga (inclina, solta o
  pente, encaixa), coice (recua e gira para cima com mola de volta), balanço senoidal proporcional à
  velocidade, inércia ao girar o mouse.
- Coice na câmera: o tiro empurra o ângulo vertical para cima e uma mola devolve a mira ao ponto original;
  a jogadora que compensa puxando o mouse não "sobra" para baixo.

### Feedback de acerto

**[pessoa]** Acertar dá marcador de acerto com som e um tremor leve na câmera; o tiro na cabeça tem marcador e
som diferentes. O robô atingido solta faísca e recua; ao morrer, desmonta em pedaços com física e às vezes
solta munição ou vida.

**Aprovado (proposta do agente):**

- Marcador de acerto: cruz em SVG que pisca branca no corpo e vermelha e maior na cabeça; som curto metálico
  no corpo e um "ding" mais agudo na cabeça; morte tem marcador e som próprios.
- Acerto no escudo frontal do brutamontes: faísca azul, som de ricochete e marcador "bloqueado" (cinza),
  para a jogadora entender na hora que precisa flanquear ou trocar de arma.
- Desmonte: cada robô já é montado em peças; na morte as peças viram detritos com gravidade, quique no chão,
  giro e atrito, somem com fade depois de alguns segundos. Chance de largar item: munição 35 %, vida 15 %
  (valores iniciais).
- Dano recebido: vinheta vermelha e indicador de direção do dano em volta da mira.

### Inimigos

**[pessoa]**

- drone voador rápido que dá rasante;
- sentinela que atira de longe e se esconde atrás de cobertura;
- brutamontes lento com escudo frontal, que só cai pelas costas ou com a escopeta.

Todos patrulham, ouvem tiro, cercam pelo lado e não ficam presos em parede.

**Aprovado (proposta do agente)**, comportamento de cada um:

| Robô | Movimento | Ataque | Como se vence | Leitura visual |
| --- | --- | --- | --- | --- |
| Drone | voa a 2–3 m, rápido, oscila de lado | aviso (luz fica vermelha + zumbido sobe) e rasante em linha reta contra a jogadora, depois recua | pouca vida; desviar de lado no aviso e acertar no recuo | pequeno, olho luminoso (cabeça) |
| Sentinela | mantém 15–25 m; depois de levar dano ou ao recarregar, vai para um ponto de cobertura e espia | rajadas de 3 tiros com traçante visível e aviso (laser de mira) antes | pegar no momento em que espia; granada não existe, então flanquear | alto e fino, cabeça com lente |
| Brutamontes | lento, sempre virado para a jogadora | investida curta com soco quando perto | escudo frontal anula pistola e rifle pela frente; escopeta pela frente dá dano cheio; qualquer arma pelas costas dá dano cheio e ×1,5 | grande, escudo luminoso na frente, núcleo exposto atrás |

Comum a todos:

- **Estados:** patrulha (rota de pontos do mapa) → alerta (ouviu ou viu) → combate → busca (perdeu de vista,
  vai à última posição conhecida) → volta a patrulhar.
- **Visão:** cone de visão com teste de linha de visada contra o mapa.
- **Audição:** cada tiro emite um "ruído" com raio por arma; robôs no raio entram em alerta e vão até a
  origem. Paredes reduzem o raio pela metade.
- **Cerco:** os robôs em combate pegam vagas em ângulos diferentes em volta da jogadora (frente, esquerda,
  direita), para que pelo menos um venha pelo lado.
- **Não presos em parede:** movimento por grade de navegação gerada do próprio mapa, com A* e suavização de
  caminho; se um robô não progride por 1 s, recalcula o caminho e, persistindo, desloca para a célula livre
  mais próxima.

### Chefe

**[pessoa]** Robô gigante com 3 fases de ataque e barra de vida no topo da tela.

**Aprovado (proposta do agente):**

| Fase | Vida | Ataques | Brecha |
| --- | --- | --- | --- |
| 1 | 100–66 % | rajadas de projéteis lentos e visíveis em leque (dá para desviar) e varredura de laser na altura do peito (agachar desvia) | pontos fracos luminosos nos ombros |
| 2 | 66–33 % | chama drones (no máximo 3 vivos) e dá pisão que solta onda de choque no chão (pular desvia) | núcleo do peito abre depois do pisão |
| 3 | 33–0 % | mistura das fases 1 e 2 mais rápida; a arena perde parte da cobertura | núcleo fica exposto o tempo todo |

- Transição de fase: o chefe para, solta vapor e faísca e ruge (som), o que dá um respiro de 2 s.
- A arena tem caixas de munição que reaparecem, para a luta não travar por falta de bala.
- Na morte: desmonte grande com física, a luz da sala muda e a tela de vitória mostra o tempo total.

### Setores

Cada setor é descrito por um **mapa em dados** (grade ASCII + listas de entidades), do qual saem a geometria,
as caixas de colisão, a grade de navegação, os pontos de cobertura, as rotas de patrulha, os itens e os
inimigos. **Aprovado (proposta do agente)**, por setor:

| Setor | Atmosfera | Inimigos (aprox.) | Destaque |
| --- | --- | --- | --- |
| Hangar | amplo, pé-direito alto, luz fria azulada, naves de carga paradas | 3 drones, 2 sentinelas | aprender; rifle no meio do caminho |
| Laboratórios | corredores estreitos, luz vermelha de alarme piscando, vidro de laboratório | 4 drones, 3 sentinelas, 2 brutamontes | portas com interruptor; escopeta antes do primeiro brutamontes |
| Estufa | canteiros de plantas, cúpula de vidro com o planeta gelado lá fora, neblina | 4 drones, 3 sentinelas, 2 brutamontes | plantas como cobertura que só esconde (não para tiro) |
| Núcleo | arena circular, núcleo pulsante | chefe | 3 fases |

### Tela durante o jogo (HUD)

**[pessoa]** Vida, escudo, munição da arma atual, setor atual e uma mira que abre quando você atira. Ícones e
interface em SVG desenhado à mão no código, sem emoji e sem biblioteca de ícones.

**Aprovado (proposta do agente):** a mira abre com tiro, movimento, pulo e corrida, e fecha agachada; a abertura visual é a
mesma usada no espalhamento real dos tiros. Ícone SVG próprio por arma. Barra do chefe só no núcleo. Fonte do
sistema (sem web font, porque nada vem de fora).

### Som

**[pessoa]** Som com Web Audio: ambiente por setor, música que acelera no combate e alarme no laboratório.

**Aprovado (proposta do agente):** tudo sintetizado em tempo real (osciladores, ruído filtrado, envelopes), sem arquivo de
áudio. Som próprio de cada arma, recarga, troca, passos, pulo, acerto, tiro na cabeça, dano recebido, morte de
robô, cada ataque dos robôs e do chefe. Música gerada por sequenciador: calma na exploração, mais camadas e
andamento maior quando há robô em combate, transição suave. Alarme do laboratório sincronizado com a luz
vermelha. Áudio posicional (panner) para tiros e passos dos robôs.

## Estados de falha e recuperação

**Aprovado (proposta do agente):**

| Situação | O que a jogadora vê | Como o jogo reage |
| --- | --- | --- |
| Navegador sem WebGL | mensagem na tela explicando que o jogo precisa de WebGL | não inicia o loop; nada no console além do aviso do próprio navegador |
| Esc / mouse destravado | menu de pausa | o navegador destrava o mouse sozinho; a pausa é disparada pelo evento `pointerlockchange`, não pela tecla |
| Travar o mouse falha (gesto ausente ou o intervalo que o navegador impõe logo após o Esc) | "Clique para continuar" | a promessa do `requestPointerLock` é tratada; nova tentativa no próximo clique |
| Aba fica oculta | pausa | evento `visibilitychange` |
| Áudio bloqueado até gesto | nada | o `AudioContext` nasce e é retomado no clique de "Jogar"/"Continuar" |
| Perda do contexto WebGL | mensagem com botão "Recarregar" | trata `webglcontextlost` |
| Morte | tela de morte com "Tentar de novo" | restaura o retrato da entrada do setor |
| Jogadora fora do mapa (bug de colisão) | nada | abaixo do chão por mais de 1 s, volta ao último ponto seguro |

Erros inesperados no loop são registrados com contexto no console e mostrados numa faixa discreta, sem
engolir: o critério "console sem erro" é verificado, não silenciado.

## Formato dos dados

Sem persistência de jogo (não há save). Persistem só a sensibilidade e o volume, no `localStorage`. O estado da
partida (setor, retrato da entrada, cronômetro) vive em memória.

## Privacidade e segurança

Não há dado pessoal, rede, login nem entrada de texto. O único dado gravado são duas preferências locais. O
gancho `?debug` só expõe comandos de jogo (teleporte, matar inimigos), sem acesso a nada fora da página.

## Critérios de aceite

**[pessoa]**

1. Dá para sair do hangar, passar pelos 3 setores e vencer o chefe, do começo ao fim, numa partida só.
2. Os 3 tipos de robô se comportam de jeitos diferentes, e dá para notar isso jogando.
3. Em todas as armas, atirar tem coice que sobe a mira e volta; clarão no cano e cápsula voando; som próprio;
   balanço da arma ao andar.
4. Acertar dá marcador de acerto com som e um tremor leve na câmera; o tiro na cabeça tem marcador e som
   diferentes.
5. O robô atingido solta faísca e recua; ao morrer, desmonta em pedaços com física e às vezes solta munição ou
   vida.
6. Roda liso num notebook comum, e o console do navegador não mostra nenhum erro durante a partida.

**Aprovado (proposta do agente)**, critérios que faltaram:

7. Os primeiros 10 s: a tela de título mostra a estação girando sobre o planeta com estrelas, luz e brilho
   (bloom) e chega à primeira tela de jogo em até 3 s após o clique em "Jogar". Verificado por captura de tela
   e revisado pela pessoa.
8. "Roda liso" = pelo menos 55 FPS médios em 1920×1080 num notebook com GPU integrada, lido no medidor do
   `?debug` em cada setor e na luta do chefe.
9. Esc pausa e Continuar volta a travar o mouse sem erro no console; aba oculta pausa.
10. Morrer em qualquer setor e "Tentar de novo" restaura o retrato da entrada do setor.
11. O brutamontes não leva dano de pistola nem de rifle pela frente, e leva dano cheio pelas costas e de
    escopeta.
12. Nenhum robô fica parado preso em parede por mais de 2 s durante a travessia automática.

## Estratégia de verificação

| Critério | Como será verificado | Limite da evidência |
| --- | --- | --- |
| 1, 12 | E2E (Playwright, Chromium com WebGL por software): abre `npm run dev` com `?debug`, usa o gancho `window.__kepler` para atravessar cada setor (teleporte por pontos do caminho, matar inimigos, acionar interruptores) e vencer o chefe até a tela de vitória; mede robôs parados contra parede | prova que o caminho existe e o fluxo fecha; não prova que é divertido |
| 1 (mapa) | teste unitário: em cada mapa, A* encontra caminho do início à saída passando por todos os interruptores; nenhum inimigo, item ou ponto de cobertura nasce dentro de parede | só a topologia do dado |
| 2, 11 | testes unitários das regras (escudo frontal por ângulo, multiplicadores, transições de estado de cada robô) + jogo manual pela pessoa | "dá para notar jogando" só a pessoa confirma |
| 3, 4, 5 | testes unitários da máquina de estados das armas (cadência, pente, recarga, troca, coice com retorno) e da regra de cabeça; capturas de tela com efeitos; jogo manual | sensação é juízo humano |
| 6 (console) | o mesmo E2E falha em qualquer `console.error`, `console.warn` e `pageerror`; o detector é provado antes com um erro injetado de propósito | cobre o caminho percorrido no Chromium, não todos os navegadores |
| 6, 8 (fluidez) | medidor de FPS do `?debug` na máquina da pessoa | o E2E roda com GPU por software e **não mede** desempenho |
| 7 | captura de tela da tela de título + revisão da pessoa | juízo humano |
| 9, 10 | E2E (pausa por `visibilitychange` e gancho; reinício de setor) + teste unitário do retrato | o travamento real do mouse não roda em navegador sem tela |

Cobertura: **Aprovado (proposta do agente)** — a meta de 80 % da regra de testes vale para os módulos de lógica pura
(armas, dano, IA, navegação, colisão, mapas, fluxo de jogo); o código de renderização, efeitos e síntese de som
fica fora da medição e é coberto pelo E2E e pela revisão manual.

## Decisões

Propostas pelo agente e **aprovadas pela pessoa em 2026-11-12**:

- **Stack: Vite 8.3.5 + Three.js 0.186.1 + TypeScript 6.0.3.** Por quê: o pedido fixa Vite e Three.js;
  TypeScript pega erro de tipo antes de virar erro no console. Versões fixadas na mais nova com pelo menos 14
  dias. TypeScript 7 rejeitado: o `typescript-eslint` atual aceita `typescript <6.1.0`.
- **Única dependência de execução é `three`** (com `@types/three` 0.186.0). Física dos detritos, colisão,
  navegação, áudio e interface escritos no projeto. Por quê: "tudo feito no código, sem arquivo de fora" e
  o que o jogo precisa é pouco (caixas alinhadas aos eixos, grade 2D). Rejeitado: motor de física (cannon-es,
  Rapier), que pesaria mais que o problema. Ferramentas de desenvolvimento (Vitest, ESLint, Playwright) são
  permitidas.
- **Controle de câmera próprio em vez do `PointerLockControls` do three.** Por quê: no r186 o `lock()` não
  devolve a promessa do `requestPointerLock`, então a rejeição vira erro sem tratamento no console; e o coice
  precisa escrever no mesmo ângulo vertical que o mouse. Rejeitado: usar o addon e remendar por fora.
- **Mapas como dados (grade ASCII + entidades)**, uma fonte para geometria, colisão, navegação, cobertura e
  patrulha. Por quê: uma mudança de mapa não dessincroniza colisão e navegação, e os mapas são testáveis.
  Rejeitado: montar a geometria à mão e a navegação à parte.
- **Tiro por raio instantâneo; projéteis lentos só nos inimigos e no chefe**, para serem desviáveis.
- **Pós-processamento com bloom do three (`three/addons/postprocessing/`)**, desligado automaticamente se a
  média de FPS ficar baixa; razão de pixel limitada a 1,5; objetos repetidos (caixas, plantas) com
  `InstancedMesh`; uma luz com sombra por setor.
- **Gancho de teste atrás de `?debug`, não de `import.meta.env.DEV`**, porque a avaliação roda no modo dev.

## Fora de escopo / questões em aberto

Fora de escopo: celular e toque, controle (gamepad), multijogador, salvar progresso, níveis de dificuldade,
remapear teclas, outros idiomas (a interface é em pt-BR), navegadores sem WebGL 2.

Em aberto: nada. Divisão aprovada: uma spec e um PR, revisado commit por commit.

## Plano de build

> **Seção de plano:** sai na graduação.

### Iniciar (feito em 2026-11-12)

- `git mv` desta spec para `docs/in-progress/produto/`.
- No mesmo commit: `## Stack`, tabela "Portões de verificação" e "Projeto em um parágrafo" do `CLAUDE.md`
  preenchidos; `audit` no `VERIFY_GATES` de `scripts/hooks/guard-shell.mjs`; `/sync-ecc-tools --adopt` com
  os itens confirmados pela pessoa: `typescript-reviewer`, `build-error-resolver`, rules `typescript/*`,
  `web/performance` e a skill `e2e-testing`.

Texto da `## Stack`:

```text
- Linguagens: TypeScript 6.0.3 (Node 24 no desenvolvimento)
- Frameworks: Vite 8.3.5, Three.js 0.186.1
- Banco de dados: n/a
- Infraestrutura: n/a (página estática servida pelo Vite)
- Testes: Vitest 4.1.12 (unidade), Playwright 1.64.1 (e2e)
```

Portões:

| Portão | Comando |
| --- | --- |
| Lint | `npm run lint` (ESLint 10.13.0 + typescript-eslint) |
| Typecheck | `npm run typecheck` (`tsc --noEmit`) |
| Teste | `npm test` (Vitest) e `npm run test:e2e` (Playwright) |
| Build | `npm run build` |
| Auditoria de dependências | `npm audit --audit-level=high` |

### Escopo e fatias

Na ordem pedida: controle e tiro primeiro, depois inimigos, depois acabamento. Cada fatia é um commit (ou
poucos) com os portões verdes e push.

| # | Fatia | Entrega jogável ao fim da fatia |
| --- | --- | --- |
| 1 | Fundação: projeto Vite + TS, portões, loop de jogo, formato de mapa, sala de teste, controle (andar, correr, pular, agachar, colisão), pausa e travamento do mouse, tratamento de WebGL/áudio | andar numa sala com caixas, pausar e voltar sem erro no console |
| 2 | Sensação de tiro: 3 armas, coice com retorno, clarão, cápsulas, sons das armas, balanço, troca e recarga animadas, mira dinâmica, marcador de acerto (corpo/cabeça), tremor; alvo de teste | atirar nos alvos com as 3 armas |
| 3 | Inimigos: navegação (grade + A* + destravar), percepção (visão, audição), estados, cerco; drone, sentinela, brutamontes; faísca, recuo, desmonte com física, itens largados | combate na sala de teste com os 3 robôs |
| 4 | Setores: hangar, laboratórios (alarme, portas com interruptor), estufa (plantas, vidro, planeta, neblina); itens, cobertura, saídas, transição, morte e "Tentar de novo"; HUD completo | atravessar os 3 setores |
| 5 | Núcleo e fluxo: chefe de 3 fases e barra de vida, tela de vitória com tempo, tela de título com a estação girando | partida completa do título à vitória |
| 6 | Som e acabamento: ambiente por setor, música adaptativa, alarme, bloom e passe de desempenho, E2E da partida completa | critérios 1–12 |

### Definição de pronto

Portões do `CLAUDE.md` verdes por exit code, `docs-check diff` e `docs-check links` com exit 0, testes da
fatia escritos antes onde couber, revisão dos agents `code-reviewer` e `silent-failure-hunter` no diff.

### Feito vs pendente

- [x] Iniciar
- [ ] 1 Fundação
- [ ] 2 Sensação de tiro
- [ ] 3 Inimigos
- [ ] 4 Setores
- [ ] 5 Núcleo e fluxo
- [ ] 6 Som e acabamento
