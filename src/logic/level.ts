/**
 * Mapa de setor descrito como grade ASCII: uma fonte para geometria, colisão, navegação, cobertura e
 * entidades (decisão "Mapas como dados" na spec docs/in-progress/produto/estacao-kepler.md).
 */

export const CELL = 2;

export type EnemyKind = 'drone' | 'sentinel' | 'brute' | 'boss';
export type PickupKind = 'health' | 'ammo' | 'rifle' | 'shotgun';
export type HeightMode = 'move' | 'bullet' | 'sight' | 'fly';

export interface Cell {
  readonly i: number;
  readonly j: number;
}

export interface EnemySpawn {
  readonly kind: EnemyKind;
  readonly cell: Cell;
}

export interface PickupSpawn {
  readonly kind: PickupKind;
  readonly cell: Cell;
}

export interface SwitchSpawn {
  readonly cell: Cell;
  readonly door: string;
  /** Direção (célula vizinha) da parede onde o painel fica preso. */
  readonly wall: Cell;
}

export interface LevelData {
  readonly grid: LevelGrid;
  readonly playerStart: Cell;
  readonly enemies: readonly EnemySpawn[];
  readonly pickups: readonly PickupSpawn[];
  readonly switches: readonly SwitchSpawn[];
  readonly doors: ReadonlyMap<string, readonly Cell[]>;
  readonly exits: readonly Cell[];
}

/** Alturas do bloqueio de cada tipo de célula, por modo de consulta. */
interface TileSpec {
  readonly move: number;
  readonly bullet: number;
  readonly sight: number;
  readonly fly: number;
}

const SOLID = 1000;
const FLOOR: TileSpec = { move: 0, bullet: 0, sight: 0, fly: 0 };
const TILES: Readonly<Record<string, TileSpec>> = {
  '#': { move: SOLID, bullet: SOLID, sight: SOLID, fly: SOLID },
  ' ': { move: SOLID, bullet: SOLID, sight: SOLID, fly: SOLID },
  '~': { move: SOLID, bullet: SOLID, sight: SOLID, fly: SOLID },
  o: { move: 1.0, bullet: 1.0, sight: 1.0, fly: 0 },
  O: { move: 2.4, bullet: 2.4, sight: 2.4, fly: SOLID },
  // Canteiro: a base para a passagem; a folhagem esconde mas não para tiro.
  p: { move: 0.5, bullet: 0.5, sight: 2.2, fly: 0 },
};

const ENEMY_CHARS: Readonly<Record<string, EnemyKind>> = { d: 'drone', s: 'sentinel', b: 'brute', K: 'boss' };
const PICKUP_CHARS: Readonly<Record<string, PickupKind>> = { h: 'health', a: 'ammo', r: 'rifle', g: 'shotgun' };
const SWITCH_CHARS = 'ABCDEFGHI';
const DOOR_CHARS = '123456789';

export const isDoorChar = (c: string): boolean => DOOR_CHARS.includes(c);

export class LevelError extends Error {}

export class LevelGrid {
  readonly width: number;
  readonly depth: number;
  private readonly rows: readonly string[];
  /** Abertura de cada porta, 0 (fechada) a 1 (aberta). Estado de jogo, muda no loop. */
  private readonly doorOpen = new Map<string, number>();
  private revision = 0;

  constructor(rows: readonly string[]) {
    this.rows = rows;
    this.depth = rows.length;
    this.width = Math.max(...rows.map((r) => r.length));
  }

  /** Muda a cada abertura de porta: quem guarda caminhos sabe que precisa recalcular. */
  get navRevision(): number {
    return this.revision;
  }

  charAt(i: number, j: number): string {
    if (i < 0 || j < 0 || i >= this.width || j >= this.depth) return ' ';
    return this.rows[j]?.[i] ?? ' ';
  }

  setDoorOpen(id: string, amount: number): void {
    const before = this.isDoorPassable(id);
    this.doorOpen.set(id, amount);
    if (before !== this.isDoorPassable(id)) this.revision += 1;
  }

  doorAmount(id: string): number {
    return this.doorOpen.get(id) ?? 0;
  }

  private isDoorPassable(id: string): boolean {
    return this.doorAmount(id) >= 0.7;
  }

  /** Altura do bloqueio da célula para o modo pedido (0 = livre). */
  height(i: number, j: number, mode: HeightMode): number {
    const c = this.charAt(i, j);
    if (isDoorChar(c)) return this.isDoorPassable(c) ? 0 : SOLID;
    const spec = TILES[c] ?? FLOOR;
    return spec[mode];
  }

  isWalkable(i: number, j: number, fly = false): boolean {
    return this.height(i, j, fly ? 'fly' : 'move') === 0;
  }

  isFullWall(i: number, j: number): boolean {
    return this.height(i, j, 'move') >= SOLID;
  }

  worldToCell(x: number, z: number): Cell {
    return { i: Math.floor(x / CELL), j: Math.floor(z / CELL) };
  }

  cellCenter(cell: Cell): { x: number; z: number } {
    return { x: cell.i * CELL + CELL / 2, z: cell.j * CELL + CELL / 2 };
  }
}

export function parseLevel(rows: readonly string[]): LevelData {
  const grid = new LevelGrid(rows);
  let playerStart: Cell | null = null;
  const enemies: EnemySpawn[] = [];
  const pickups: PickupSpawn[] = [];
  const switches: SwitchSpawn[] = [];
  const doors = new Map<string, Cell[]>();
  const exits: Cell[] = [];

  for (let j = 0; j < grid.depth; j++) {
    for (let i = 0; i < grid.width; i++) {
      const c = grid.charAt(i, j);
      const cell = { i, j };
      if (c === '@') playerStart = cell;
      else if (c === 'x') exits.push(cell);
      else if (ENEMY_CHARS[c]) enemies.push({ kind: ENEMY_CHARS[c], cell });
      else if (PICKUP_CHARS[c]) pickups.push({ kind: PICKUP_CHARS[c], cell });
      else if (isDoorChar(c)) doors.set(c, [...(doors.get(c) ?? []), cell]);
      else if (SWITCH_CHARS.includes(c)) {
        const door = String(SWITCH_CHARS.indexOf(c) + 1);
        const wall = findAdjacentWall(grid, cell);
        if (!wall) throw new LevelError(`interruptor ${c} em (${i},${j}) sem parede vizinha`);
        switches.push({ cell, door, wall });
      }
    }
  }
  if (!playerStart) throw new LevelError('mapa sem início da jogadora (@)');
  for (const s of switches) {
    if (!doors.has(s.door)) throw new LevelError(`interruptor da porta ${s.door} sem porta`);
  }
  return { grid, playerStart, enemies, pickups, switches, doors, exits };
}

function findAdjacentWall(grid: LevelGrid, cell: Cell): Cell | null {
  const dirs: Cell[] = [
    { i: 0, j: -1 },
    { i: 1, j: 0 },
    { i: 0, j: 1 },
    { i: -1, j: 0 },
  ];
  return dirs.find((d) => grid.charAt(cell.i + d.i, cell.j + d.j) === '#') ?? null;
}
