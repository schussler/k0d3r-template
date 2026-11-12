import { describe, expect, test } from 'vitest';
import { GridError, cellCenter, entitiesOf, isLowCover, isOpenTile, parseGrid, tileAt, worldToCell } from '../../src/level/grid';
import { findPath, reachable, walkableAllOpen } from '../../src/level/nav';

const MAP = [
  '#######',
  '#P..c.#',
  '#.##.S#',
  '#.D.a.#',
  '###E###',
];

describe('parseGrid', () => {
  test('reads tiles and entities with their reading-order index', () => {
    const g = parseGrid(MAP);
    expect(g.cols).toBe(7);
    expect(tileAt(g, 4, 1)).toBe('crate');
    expect(tileAt(g, 5, 2)).toBe('console');
    expect(tileAt(g, 1, 1)).toBe('floor');
    expect(entitiesOf(g, 'switch')).toEqual([{ kind: 'switch', col: 5, row: 2, index: 0 }]);
    expect(g.doors).toEqual([{ col: 2, row: 3, index: 0 }]);
  });

  test('outside the map reads as wall', () => {
    expect(tileAt(parseGrid(MAP), -1, 0)).toBe('wall');
    expect(tileAt(parseGrid(MAP), 0, 99)).toBe('wall');
  });

  test('rejects ragged rows, unknown chars and a missing player', () => {
    expect(() => parseGrid(['##', '#'])).toThrow(GridError);
    expect(() => parseGrid(['#P?'])).toThrow(/desconhecido/);
    expect(() => parseGrid(['#.#'])).toThrow(/exatamente um P/);
    expect(() => parseGrid([])).toThrow(/vazio/);
  });

  test('cell and world coordinates round-trip', () => {
    const c = cellCenter(3, 2);
    expect(worldToCell(c.x, c.z)).toEqual({ col: 3, row: 2 });
  });

  test('tile classes', () => {
    expect(isOpenTile('exit')).toBe(true);
    expect(isOpenTile('door')).toBe(false);
    expect(isLowCover('crate')).toBe(true);
    expect(isLowCover('stack')).toBe(false);
  });
});

describe('navigation', () => {
  test('finds a path around obstacles without cutting corners', () => {
    const g = parseGrid(MAP);
    const path = findPath(g, { col: 1, row: 1 }, { col: 3, row: 4 }, walkableAllOpen(g));
    expect(path?.[0]).toEqual({ col: 1, row: 1 });
    expect(path?.at(-1)).toEqual({ col: 3, row: 4 });
    for (let i = 1; i < (path?.length ?? 0); i++) {
      const a = path?.[i - 1];
      const b = path?.[i];
      if (!a || !b) continue;
      if (a.col !== b.col && a.row !== b.row) {
        expect(walkableAllOpen(g)(b.col, a.row) && walkableAllOpen(g)(a.col, b.row)).toBe(true);
      }
    }
  });

  test('a closed door blocks the path', () => {
    const g = parseGrid(MAP);
    const closed = (c: number, r: number) => isOpenTile(tileAt(g, c, r));
    expect(findPath(g, { col: 1, row: 1 }, { col: 3, row: 4 }, (c, r) => closed(c, r) && !(c === 4 && r === 2))).toBeNull();
    expect(findPath(g, { col: 1, row: 1 }, { col: 0, row: 0 }, closed)).toBeNull();
  });

  test('reachable floods the open area', () => {
    const g = parseGrid(MAP);
    const seen = reachable(g, { col: 1, row: 1 }, walkableAllOpen(g));
    expect(seen.has(3 * g.cols + 4)).toBe(true);
    expect(seen.has(0)).toBe(false);
  });
});
