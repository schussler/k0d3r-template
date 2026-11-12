import { describe, expect, test } from 'vitest';
import { type Grid, entitiesOf, parseGrid, tileAt } from '../../src/level/grid';
import { type Passable, findPath, reachable } from '../../src/level/nav';
import { SECTORS, type SectorDef } from '../../src/level/sectors';
import { THEMES } from '../../src/level/themes';

const key = (g: Grid, c: number, r: number) => r * g.cols + c;

/** Piso por onde se anda, com as portas listadas abertas. */
function walkable(g: Grid, openDoors: ReadonlySet<number>): Passable {
  return (c, r) => {
    const t = tileAt(g, c, r);
    if (t === 'floor' || t === 'exit') return true;
    return t === 'door' && g.doors.some((d) => d.col === c && d.row === r && openDoors.has(d.index));
  };
}

const allDoors = (g: Grid) => new Set(g.doors.map((d) => d.index));

/** Alguma vizinha do console alcançável: o jogador aperta o interruptor de perto. */
function canReachConsole(g: Grid, seen: Set<number>, col: number, row: number): boolean {
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dc, dr]) => seen.has(key(g, col + (dc ?? 0), row + (dr ?? 0))));
}

describe.each(SECTORS)('setor $id', (def: SectorDef) => {
  const g = parseGrid(def.map);
  const spawn = entitiesOf(g, 'player')[0];
  const open = walkable(g, allDoors(g));

  test('has a theme and a single player start', () => {
    expect(THEMES[def.id]).toBeDefined();
    expect(entitiesOf(g, 'player')).toHaveLength(1);
  });

  test('every enemy, item and light is on walkable floor reachable from the start', () => {
    if (!spawn) throw new Error('sem P');
    const seen = reachable(g, spawn, open);
    for (const e of g.entities) {
      if (e.kind === 'switch' || e.kind === 'target') continue;
      expect(seen.has(key(g, e.col, e.row)), `${e.kind} em ${e.col},${e.row}`).toBe(true);
    }
  });

  test('the exit (or the boss arena) is reachable with every door open', () => {
    if (!spawn) throw new Error('sem P');
    if (def.unlock === 'boss') {
      const boss = entitiesOf(g, 'boss')[0];
      expect(boss).toBeDefined();
      expect(findPath(g, spawn, { col: boss?.col ?? 0, row: boss?.row ?? 0 }, open)).not.toBeNull();
      return;
    }
    const exits = g.tiles.flatMap((t, i) => (t === 'exit' ? [{ col: i % g.cols, row: Math.floor(i / g.cols) }] : []));
    expect(exits.length).toBeGreaterThan(0);
    for (const e of exits) expect(findPath(g, spawn, e, open), `saída ${e.col},${e.row}`).not.toBeNull();
  });
});

describe('laboratórios: portas e interruptores', () => {
  const def = SECTORS.find((s) => s.id === 'labs');
  if (!def) throw new Error('sem labs');
  const g = parseGrid(def.map);
  const spawn = entitiesOf(g, 'player')[0];
  const switches = entitiesOf(g, 'switch');

  test('there are three doors and three switches, paired by index', () => {
    expect(g.doors.map((d) => d.index).sort()).toEqual([0, 1, 2]);
    expect(switches.map((s) => s.index).sort()).toEqual([0, 1, 2]);
    expect(def.unlock).toBe('switches');
  });

  test('each switch is reachable before the door it opens, and the exit is not reachable before the last', () => {
    if (!spawn) throw new Error('sem P');
    for (const sw of switches) {
      const openBefore = new Set([...Array(sw.index).keys()]);
      const seen = reachable(g, spawn, walkable(g, openBefore));
      expect(canReachConsole(g, seen, sw.col, sw.row), `interruptor ${sw.index + 1}`).toBe(true);
    }
    const exit = g.tiles.findIndex((t) => t === 'exit');
    const exitCell = { col: exit % g.cols, row: Math.floor(exit / g.cols) };
    expect(findPath(g, spawn, exitCell, walkable(g, new Set([0, 1])))).toBeNull();
  });
});

describe('estufa e hangar: a saída exige limpar o setor', () => {
  test('sector unlock modes', () => {
    expect(SECTORS.map((s) => s.unlock)).toEqual(['clear', 'switches', 'clear', 'boss']);
  });
});
