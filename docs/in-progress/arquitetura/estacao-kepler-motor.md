---
conferido-em: 2026-11-12
---

# Arquitetura — motor da Estação Kepler

> Spec em `in-progress/`: em construção. O comportamento do jogo está em
> [`../produto/estacao-kepler.md`](../produto/estacao-kepler.md); aqui ficam a forma técnica, o orçamento de
> desempenho e as decisões técnicas. Proposto pelo agente e aprovado pela pessoa em 2026-11-12.

## Stack proposta

Versões fixadas no `package.json` sem `^`, escolhidas como a mais nova publicada há 14 dias ou mais
(conferido com `npm view` em 2026-11-12), com compatibilidade de pares conferida:

| Peça | Versão | Por quê |
| --- | --- | --- |
| Node | 24 (local: 24.21.0) | exigido pelo Vite 8 (`^20.19 \|\| >=22.12`) |
| Vite | 8.3.5 | pedido; servidor de desenvolvimento e build |
| Three.js | 0.186.1 (+ `@types/three` 0.186.0) | pedido; addons de pós-processamento via `three/addons/...` |
| TypeScript | 6.0.3 | tipagem; o 7.0 é mais novo, mas o `typescript-eslint` 8.72 só aceita `<6.1` |
| ESLint + typescript-eslint | 10.13.0 + 8.72.1 | portão de lint |
| Vitest + @vitest/coverage-v8 | 4.1.12 | testes de unidade; aceita Vite 8 como par |
| Playwright (`@playwright/test`) | 1.64.1 | E2E da partida completa e checagem de console |

Sem nenhuma outra dependência de execução: física, IA, navegação, áudio e interface são escritas no projeto.

## Forma do sistema

Aplicação de página única na raiz do repositório (`index.html`, `src/`), sem servidor. Um laço de jogo com passo
fixo de simulação (60 Hz, acumulador) e renderização a cada quadro.

```
src/
  main.ts            entrada: cria o renderizador, o jogo e as telas; trata WebGL indisponível
  game/              laço, máquina de telas (título, jogo, pausa, morte, vitória), sessão e cronômetro
  rules/             regras puras, sem Three.js nem DOM: dano e escudo, armas (estado de tiro/recarga/troca),
                     IA (transições), snapshot e reinício, tabela de drop, cronômetro, mola do coice
  level/             dados dos setores (mapa de células + entidades), leitura, construção da cena, grade de
                     navegação e busca de caminho
  player/            controle (olhar, movimento, colisão), armas em primeira pessoa (modelo, animação)
  enemies/           percepção, os 3 robôs e o chefe (comportamento sobre as regras de `rules/`)
  fx/                partículas, faíscas, cápsulas, traçantes, marcas e pedaços — tudo em pool
  render/            materiais e texturas procedurais, luzes por setor, pós-processamento, resolução adaptativa
  audio/             síntese de efeitos, ambiente por setor, música adaptativa, alarme
  ui/                HUD e telas em SVG/DOM sobre o canvas; ícones SVG desenhados no código
  dev/               painel F3 e gancho `window.__kepler`, carregados só em `import.meta.env.DEV`
tests/
  unit/              Vitest sobre `rules/` e `level/`
  e2e/               Playwright: partida completa e console limpo
```

## Contratos internos

- **Dados do setor** são a **fonte única** de geometria, colisão, grade de navegação, pontos de cobertura,
  posições de nascimento, pickups, portas, interruptores e saída. Um setor é um mapa de células em texto (cada
  célula = 2 m) mais uma lista de entidades com posição em célula. O construtor transforma isso em malhas
  instanciadas, em caixas de colisão alinhadas aos eixos e na grade de navegação.
- **Acerto de tiro** é por raio (hitscan) contra caixas de acerto por parte (cabeça, corpo, escudo) de cada robô.
  O resultado é `{ alvo, parte, ponto, normal }`, e a regra de dano em `rules/` decide o dano e o tipo de acerto
  (`corpo`, `cabeca`, `bloqueado`) que o HUD, o som e o tremor consomem.
- **Escudo frontal do brutamontes**: o tiro é bloqueado quando o ângulo entre a frente do robô e a direção até o
  atirador é menor que 60°; escopeta passa com 50%.
- **Snapshot do setor**: cópia imutável do estado do jogador na entrada; reiniciar = reconstruir o setor dos seus
  dados + restaurar o snapshot.

## Orçamento de desempenho

Meta: **60 FPS a 1080p num notebook com GPU integrada** (classe Intel Iris Xe / Apple M1). Regras para chegar lá:

- até **150 draw calls** e **8 luzes dinâmicas** por setor; paredes, caixas e plantas em `InstancedMesh`;
- sombras só da luz principal de cada setor, com mapa pequeno;
- partículas, cápsulas, traçantes, marcas e pedaços em **pool** pré-alocado (nada de criar objeto no tiro);
- `devicePixelRatio` limitado a 1,5; **resolução adaptativa**: se a média do quadro passar de 18 ms por 2 s, a
  resolução interna cai em passos até 0,6, e volta quando sobra folga;
- pós-processamento (bloom) em meia resolução.

O painel F3 mostra FPS, tempo de quadro, `renderer.info` e a escala de resolução atual. A medição é feita nesta
máquina e relatada; um "notebook comum" de verdade não é medível daqui.

## Console limpo

- A trava do mouse é pedida só em resposta a clique; a promessa de `requestPointerLock()` é sempre tratada, e a
  recusa vira o estado "Clique para continuar".
- A pausa é disparada por `pointerlockchange` (o Esc solta o mouse nativamente e não pode ser interceptado).
- O `AudioContext` é criado ou retomado no primeiro clique.
- Erro inesperado no laço é capturado na borda do laço, registrado com contexto e mostrado numa tela de erro;
  nenhum `catch` vazio.

## Verificação

- **Unitário (Vitest)** em `rules/` e `level/`, com meta de **80% de cobertura** nessas pastas: dano por parte,
  escudo e cabeça; ângulo do escudo frontal; estado das armas; mola do coice; transições de IA; snapshot e
  restauração; tabela de drop com semente; cronômetro com pausa; leitura dos setores; existência de caminho da
  entrada à saída e alcance de todo pickup.
- **E2E (Playwright, Chromium)**: abre `npm run dev`, entra pelo título e atravessa os setores e o chefe pelo
  gancho de desenvolvimento, falhando em qualquer `console.error` ou `pageerror`; captura tela de cada setor,
  do disparo de cada arma e da morte de um robô. Limitação: sem tela, o navegador não trava o mouse de verdade, então
  o E2E não prova a sensação de controle.
- **Manual**: playtest depois de cada fatia, relatado na entrega.

## Decisões

Propostas pelo agente e aprovadas pela pessoa em 2026-11-12, com a spec.

- **Física própria em vez de biblioteca.** O jogador é um cilindro contra caixas alinhadas aos eixos, com
  gravidade; os pedaços dos robôs têm velocidade, giro, quique no chão e teste contra a grade. Por quê: é tudo o
  que o jogo precisa e evita uma dependência e um mundo físico paralelo. Rejeitada: Rapier/cannon-es (peso e
  sincronização de dois mundos sem ganho visível).
- **Mapa de células como fonte única do setor.** Por quê: colisão, navegação e cobertura saem do mesmo dado, o
  que torna "não ficar preso em parede" e "caminho claro até a saída" verificáveis por teste. Rejeitada: cena
  montada à mão em código (três fontes que divergem).
- **Controle de olhar próprio, sem `PointerLockControls`.** Por quê: o coice precisa de um deslocamento de
  inclinação que volta por mola, separado do olhar do jogador; o addon gira a câmera direto. Rejeitada: o addon
  com remendos por fora.
- **Exceção de mutação no laço de jogo.** A regra `coding-style.md` exige imutabilidade; no laço de 60 Hz, vetores
  de rascunho reaproveitados e estado de entidade mutável evitam a coleta de lixo que causa engasgo. A exceção
  vale só para `player/`, `enemies/`, `fx/`, `render/` e o laço; `rules/` continua com funções puras e dados
  imutáveis. Rejeitada: imutabilidade em tudo (alocação por quadro).
- **Cobertura de 80% medida em `rules/` e `level/`.** A regra `testing.md` pede 80% geral; renderização, áudio e
  DOM ficam fora da medição e são cobertos pelo E2E e pelo playtest. Rejeitada: testar Three.js e Web Audio com
  dublês (testes caros que medem o dublê).
- **Uma só dependência de execução (Three.js).** Áudio, interface e IA no projeto, conforme o pedido.
