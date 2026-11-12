/**
 * Os setores da estação em dados. Legenda dos caracteres em `grid.ts`. Cada linha tem a mesma largura; o teste
 * `sectors.test.ts` prova que existe caminho da entrada à saída e que todo pickup é alcançável.
 */
export type SectorId = 'hangar' | 'labs' | 'greenhouse' | 'core';

export interface SectorDef {
  readonly id: SectorId;
  readonly name: string;
  readonly map: readonly string[];
}

const HANGAR: SectorDef = {
  id: 'hangar',
  name: 'SETOR 1 — HANGAR',
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

export const SECTORS: readonly SectorDef[] = [HANGAR];
