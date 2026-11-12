/**
 * Mapa de células de um setor: a fonte única de geometria, colisão, navegação, cobertura e entidades
 * (spec de arquitetura, "Contratos internos"). Cada célula tem `CELL` metros de lado.
 */
export const CELL = 2;

export type Tile = 'floor' | 'wall' | 'crate' | 'stack' | 'pillar' | 'glass' | 'planter' | 'door' | 'exit' | 'console';

export type EntityKind =
  | 'player' | 'drone' | 'sentinel' | 'brute' | 'boss' | 'target'
  | 'ammo' | 'health' | 'rifle' | 'shotgun' | 'switch' | 'light' | 'plant';

export interface Entity {
  readonly kind: EntityKind;
  readonly col: number;
  readonly row: number;
  /** Ordem de leitura entre as entidades do mesmo tipo: o interruptor N abre a porta N. */
  readonly index: number;
}

export interface Grid {
  readonly cols: number;
  readonly rows: number;
  readonly tiles: readonly Tile[];
  readonly entities: readonly Entity[];
  /** Portas pelo dígito do mapa: '1' é a porta de índice 0, aberta pelo interruptor 'x'. */
  readonly doors: readonly { readonly col: number; readonly row: number; readonly index: number }[];
}

const TILE_CHARS: Readonly<Record<string, Tile>> = {
  '.': 'floor', '#': 'wall', c: 'crate', C: 'stack', o: 'pillar', g: 'glass', w: 'planter', E: 'exit',
};

const DOOR_CHARS = '123';
// O interruptor x abre a porta 1, y a 2, z a 3: o par é explícito, não depende da ordem de leitura.
const SWITCH_CHARS = 'xyz';

// Entidades ficam sobre piso; o interruptor fica sobre um console baixo, que bloqueia a passagem.
const ENTITY_CHARS: Readonly<Record<string, { kind: EntityKind; tile: Tile }>> = {
  P: { kind: 'player', tile: 'floor' },
  d: { kind: 'drone', tile: 'floor' },
  s: { kind: 'sentinel', tile: 'floor' },
  b: { kind: 'brute', tile: 'floor' },
  B: { kind: 'boss', tile: 'floor' },
  t: { kind: 'target', tile: 'floor' },
  a: { kind: 'ammo', tile: 'floor' },
  h: { kind: 'health', tile: 'floor' },
  r: { kind: 'rifle', tile: 'floor' },
  q: { kind: 'shotgun', tile: 'floor' },
  l: { kind: 'light', tile: 'floor' },
  p: { kind: 'plant', tile: 'floor' },
};

export class GridError extends Error {}

export function parseGrid(lines: readonly string[]): Grid {
  const rows = lines.length;
  const cols = lines[0]?.length ?? 0;
  if (rows === 0 || cols === 0) throw new GridError('mapa vazio');
  const tiles: Tile[] = [];
  const entities: Entity[] = [];
  const doors: { col: number; row: number; index: number }[] = [];
  const counts = new Map<EntityKind, number>();
  lines.forEach((line, row) => {
    if (line.length !== cols) throw new GridError(`linha ${row} tem ${line.length} colunas, esperado ${cols}`);
    [...line].forEach((ch, col) => {
      const tile = TILE_CHARS[ch];
      if (tile) {
        tiles.push(tile);
        return;
      }
      const doorIndex = DOOR_CHARS.indexOf(ch);
      if (doorIndex >= 0) {
        doors.push({ col, row, index: doorIndex });
        tiles.push('door');
        return;
      }
      const switchIndex = SWITCH_CHARS.indexOf(ch);
      if (switchIndex >= 0) {
        entities.push({ kind: 'switch', col, row, index: switchIndex });
        tiles.push('console');
        return;
      }
      const ent = ENTITY_CHARS[ch];
      if (!ent) throw new GridError(`caractere desconhecido '${ch}' em ${col},${row}`);
      const index = counts.get(ent.kind) ?? 0;
      counts.set(ent.kind, index + 1);
      entities.push({ kind: ent.kind, col, row, index });
      tiles.push(ent.tile);
    });
  });
  if ((counts.get('player') ?? 0) !== 1) throw new GridError('o mapa precisa de exatamente um P');
  return { cols, rows, tiles, entities, doors };
}

export function tileAt(g: Grid, col: number, row: number): Tile {
  if (col < 0 || row < 0 || col >= g.cols || row >= g.rows) return 'wall';
  return g.tiles[row * g.cols + col] ?? 'wall';
}

export function cellCenter(col: number, row: number): { x: number; z: number } {
  return { x: (col + 0.5) * CELL, z: (row + 0.5) * CELL };
}

export function worldToCell(x: number, z: number): { col: number; row: number } {
  return { col: Math.floor(x / CELL), row: Math.floor(z / CELL) };
}

/** Piso por onde se anda. Porta conta como passável só se o chamador disser que está aberta. */
export function isOpenTile(t: Tile): boolean {
  return t === 'floor' || t === 'exit';
}

/** Obstáculos baixos: escondem quem agacha e não bloqueiam drones. */
export function isLowCover(t: Tile): boolean {
  return t === 'crate' || t === 'planter' || t === 'console';
}

export function entitiesOf(g: Grid, kind: EntityKind): readonly Entity[] {
  return g.entities.filter((e) => e.kind === kind);
}
