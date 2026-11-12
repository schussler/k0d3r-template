import { describe, expect, test } from 'vitest';
import { LevelGrid } from '../../src/logic/level';
import { findPath, nearestWalkable, smoothPath, walkableLine } from '../../src/logic/nav';

const maze = new LevelGrid([
  '#########',
  '#.......#',
  '#.#####.#',
  '#.#...#.#',
  '#.#.#.#.#',
  '#...#...#',
  '#########',
]);

describe('findPath', () => {
  test('contorna paredes sem cortar quina', () => {
    const path = findPath(maze, { i: 3, j: 3 }, { i: 1, j: 1 })!;
    expect(path[0]).toEqual({ i: 3, j: 3 });
    expect(path[path.length - 1]).toEqual({ i: 1, j: 1 });
    for (let n = 1; n < path.length; n++) {
      const a = path[n - 1]!;
      const b = path[n]!;
      if (a.i !== b.i && a.j !== b.j) {
        expect(maze.isWalkable(b.i, a.j) && maze.isWalkable(a.i, b.j)).toBe(true);
      }
    }
  });
  test('sem caminho para alvo bloqueado', () => {
    expect(findPath(maze, { i: 1, j: 1 }, { i: 2, j: 2 })).toBeNull();
    const closed = new LevelGrid(['#####', '#.#.#', '#####']);
    expect(findPath(closed, { i: 1, j: 1 }, { i: 3, j: 1 })).toBeNull();
  });
  test('drone passa por cima da caixa baixa, robô de chão não', () => {
    const g = new LevelGrid(['#####', '#.o.#', '#####']);
    expect(findPath(g, { i: 1, j: 1 }, { i: 3, j: 1 })).toBeNull();
    expect(findPath(g, { i: 1, j: 1 }, { i: 3, j: 1 }, true)).not.toBeNull();
  });
});

describe('smoothPath e nearestWalkable', () => {
  test('caminho em sala aberta vira reta', () => {
    const open = new LevelGrid(['#######', '#.....#', '#.....#', '#.....#', '#######']);
    const path = findPath(open, { i: 1, j: 1 }, { i: 5, j: 3 })!;
    expect(smoothPath(open, path)).toEqual([{ i: 1, j: 1 }, { i: 5, j: 3 }]);
    expect(walkableLine(maze, { i: 1, j: 1 }, { i: 1, j: 5 })).toBe(true);
    expect(walkableLine(maze, { i: 1, j: 1 }, { i: 3, j: 3 })).toBe(false);
  });
  test('mantém as quinas necessárias', () => {
    const path = findPath(maze, { i: 3, j: 3 }, { i: 7, j: 5 })!;
    const smooth = smoothPath(maze, path);
    expect(smooth.length).toBeGreaterThan(2);
    expect(smooth.length).toBeLessThanOrEqual(path.length);
  });
  test('acha a célula livre mais próxima', () => {
    expect(nearestWalkable(maze, { i: 2, j: 2 })).not.toBeNull();
    expect(nearestWalkable(maze, { i: 1, j: 1 })).toEqual({ i: 1, j: 1 });
    expect(nearestWalkable(new LevelGrid(['###']), { i: 1, j: 0 }, false, 2)).toBeNull();
  });
});
