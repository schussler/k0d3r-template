import { MapCanvas } from './maps';

/**
 * Os setores da estação em dados. Legenda dos caracteres em `grid.ts`. O teste `sectors.test.ts` prova que existe
 * caminho da entrada à saída, que todo item e inimigo é alcançável e que cada interruptor pode ser alcançado antes
 * da porta que ele abre.
 */
export type SectorId = 'hangar' | 'labs' | 'greenhouse' | 'core';

export interface SectorDef {
  readonly id: SectorId;
  readonly name: string;
  readonly map: readonly string[];
  /** Como a saída destrava: limpando o setor ou acionando todos os interruptores. */
  readonly unlock: 'clear' | 'switches' | 'boss';
}

const HANGAR: SectorDef = {
  id: 'hangar',
  name: 'SETOR 1 — HANGAR',
  unlock: 'clear',
  map: [
    '##############EE##############',
    'g......l..............l......#',
    'g...s.....CC........CC....s..#',
    'g.........CC........CC.......#',
    'g.....c.........d.........c..#',
    'g............................#',
    'g...CCC.....o.......o.....CCC#',
    'g...C..............d.......C.#',
    'g.......c....a.......c.......#',
    'g...d........................#',
    'g.....l...o..........o.....l.#',
    'g............................#',
    '#.ccc.cccccc.cccccccc.cccccc.#',
    '#............................#',
    '#...t.......t........t.....t.#',
    '#............................#',
    '#...........h......a.........#',
    '#............................#',
    '#...CC......l........l.....CC#',
    '#...CC.....................C.#',
    '#............r...............#',
    '#...............P............#',
    '#............................#',
    '##############################',
  ],
};

/** Corredores estreitos, três portas de uma célula e o alarme vermelho. */
function labs(): string[] {
  const m = new MapCanvas(34, 28)
    .rect(2, 21, 9, 26) // A: sala inicial
    .rect(10, 23, 19, 24) // corredor até B
    .rect(20, 18, 31, 26) // B
    .rect(25, 11, 25, 17) // corredor norte
    .rect(18, 3, 31, 10) // C
    .rect(11, 6, 17, 6) // corredor oeste
    .rect(2, 6, 10, 12) // D
    .rect(6, 5, 6, 5) // passagem da porta 3
    .rect(3, 2, 9, 4) // F: antecâmara
    .rect(6, 1, 7, 1, 'E');
  m.put('1', [25, 17]).put('2', [17, 6]).put('3', [6, 5]);
  m.put('x', [31, 19]).put('y', [31, 4]).put('z', [2, 12]);
  m.put('P', [5, 24]).put('q', [8, 22]).put('h', [3, 25], [31, 24], [30, 10], [10, 12], [4, 3]).put('a', [8, 25], [21, 25], [19, 9], [3, 7], [8, 3]);
  m.put('d', [14, 23], [29, 22], [25, 14], [22, 8], [27, 6], [13, 6], [5, 3]);
  m.put('s', [29, 9], [21, 20], [30, 25], [9, 11], [9, 8]);
  m.put('b', [26, 23], [4, 9]);
  m.put('c', [23, 21], [23, 24], [27, 21], [28, 25], [21, 5], [26, 5], [22, 9], [28, 8], [3, 10], [9, 7]);
  m.put('C', [26, 19], [24, 7]).put('o', [5, 8], [8, 10]);
  m.put('l', [6, 23], [15, 23], [26, 22], [25, 13], [24, 6], [14, 6], [6, 9], [6, 3]);
  return m.lines();
}

/** Estufa: vidro dando para o planeta, fileiras de canteiros, mistura dos três robôs. */
function greenhouse(): string[] {
  const m = new MapCanvas(34, 26).rect(1, 1, 32, 24);
  m.rect(1, 0, 32, 0, 'g').rect(0, 1, 0, 24, 'g').rect(3, 0, 4, 0, 'E');
  m.rect(4, 5, 12, 5, 'w').rect(16, 5, 28, 5, 'w');
  m.rect(3, 9, 9, 9, 'w').rect(13, 9, 20, 9, 'w').rect(24, 9, 30, 9, 'w');
  m.rect(4, 13, 12, 13, 'w').rect(16, 13, 29, 13, 'w');
  m.rect(3, 17, 10, 17, 'w').rect(14, 17, 19, 17, 'w').rect(23, 17, 30, 17, 'w');
  m.rect(5, 21, 13, 21, 'w').rect(19, 21, 27, 21, 'w');
  m.put('P', [30, 23]);
  m.put('o', [15, 7], [15, 11], [15, 15], [15, 19]).put('C', [22, 3], [10, 15], [28, 11]);
  m.put('d', [10, 7], [24, 11], [8, 19]).put('s', [27, 7], [6, 11], [20, 15]).put('b', [12, 11], [25, 19]);
  m.put('a', [28, 22], [17, 23], [11, 15], [22, 7]).put('h', [31, 20], [16, 11], [7, 3]);
  m.put('p', [2, 2], [31, 2], [2, 23], [16, 2], [2, 12], [31, 12]);
  m.put('l', [8, 3], [24, 3], [8, 12], [24, 12], [8, 22], [24, 22], [16, 7], [16, 17]);
  return m.lines();
}

/** Arena do chefe: pilares e pilhas de caixas para se proteger das rajadas. */
function core(): string[] {
  const m = new MapCanvas(30, 30).rect(1, 1, 28, 28);
  m.put('o', [7, 7], [22, 7], [7, 22], [22, 22], [14, 14], [15, 14]);
  m.put('C', [10, 11], [19, 11], [10, 18], [19, 18], [4, 14], [25, 14]);
  m.put('c', [14, 20], [15, 20], [12, 24], [17, 24]);
  m.put('B', [14, 5]).put('P', [14, 26]);
  m.put('a', [3, 3], [26, 3], [3, 26], [26, 26], [14, 11]).put('h', [3, 14], [26, 14], [20, 24]);
  m.put('l', [4, 4], [25, 4], [4, 25], [25, 25], [14, 9], [14, 19], [9, 14], [20, 14]);
  return m.lines();
}

export const SECTORS: readonly SectorDef[] = [
  HANGAR,
  { id: 'labs', name: 'SETOR 2 — LABORATÓRIOS', unlock: 'switches', map: labs() },
  { id: 'greenhouse', name: 'SETOR 3 — ESTUFA', unlock: 'clear', map: greenhouse() },
  { id: 'core', name: 'NÚCLEO', unlock: 'boss', map: core() },
];
