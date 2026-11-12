import { describe, expect, test } from 'vitest';
import { LevelError, LevelGrid, parseLevel, type Cell } from '../../src/logic/level';
import { SECTORS } from '../../src/logic/maps';
import { SECTOR_ORDER } from '../../src/logic/flow';
import { findPath } from '../../src/logic/nav';

/** Abre, em sequência, toda porta cujo interruptor já é alcançável; devolve as células alcançáveis no fim. */
function explore(rows: readonly string[]): { reach: (c: Cell) => boolean; opened: string[] } {
  const level = parseLevel(rows);
  const opened: string[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const s of level.switches) {
      if (opened.includes(s.door)) continue;
      if (findPath(level.grid, level.playerStart, s.cell)) {
        level.grid.setDoorOpen(s.door, 1);
        opened.push(s.door);
        changed = true;
      }
    }
  }
  return { reach: (c) => findPath(level.grid, level.playerStart, c) !== null, opened };
}

describe('mapas dos setores', () => {
  for (const id of SECTOR_ORDER) {
    const def = SECTORS[id];
    test(`${id}: linhas com a mesma largura e borda fechada`, () => {
      const width = def.rows[0]!.length;
      def.rows.forEach((r) => expect(r.length).toBe(width));
      const grid = new LevelGrid(def.rows);
      for (let i = 0; i < grid.width; i++) {
        expect(grid.isFullWall(i, 0)).toBe(true);
        expect(grid.isFullWall(i, grid.depth - 1)).toBe(true);
      }
      for (let j = 0; j < grid.depth; j++) {
        expect(grid.isFullWall(0, j)).toBe(true);
        expect(grid.isFullWall(grid.width - 1, j)).toBe(true);
      }
    });

    test(`${id}: todos os inimigos, itens e a saída são alcançáveis abrindo as portas em ordem`, () => {
      const level = parseLevel(def.rows);
      const { reach, opened } = explore(def.rows);
      expect(opened.sort()).toEqual([...level.doors.keys()].sort());
      for (const e of level.enemies) expect(reach(e.cell), `${e.kind} em ${e.cell.i},${e.cell.j}`).toBe(true);
      for (const p of level.pickups) expect(reach(p.cell), `${p.kind} em ${p.cell.i},${p.cell.j}`).toBe(true);
      if (id === 'core') expect(level.enemies.some((e) => e.kind === 'boss')).toBe(true);
      else {
        expect(level.exits.length).toBeGreaterThan(0);
        expect(level.exits.every(reach)).toBe(true);
      }
    });

    test(`${id}: a saída fica fechada até o interruptor`, () => {
      const level = parseLevel(def.rows);
      for (const exit of level.exits) expect(findPath(level.grid, level.playerStart, exit)).toBeNull();
    });
  }

  test('hangar entrega o rifle e os laboratórios a escopeta antes do primeiro brutamontes', () => {
    expect(parseLevel(SECTORS.hangar.rows).pickups.some((p) => p.kind === 'rifle')).toBe(true);
    const labs = parseLevel(SECTORS.labs.rows);
    const shotgun = labs.pickups.find((p) => p.kind === 'shotgun')!;
    // A escopeta fica na sala inicial, antes da porta 1, que dá acesso ao primeiro brutamontes.
    expect(findPath(labs.grid, labs.playerStart, shotgun.cell)).not.toBeNull();
    for (const b of labs.enemies.filter((e) => e.kind === 'brute')) expect(findPath(labs.grid, labs.playerStart, b.cell)).toBeNull();
  });
});

describe('parseLevel', () => {
  test('recusa mapa sem início', () => {
    expect(() => parseLevel(['###', '#.#', '###'])).toThrow(LevelError);
  });
  test('recusa interruptor sem porta', () => {
    expect(() => parseLevel(['####', '#@A#', '####'])).toThrow(/sem porta/);
  });
  test('recusa interruptor sem parede vizinha', () => {
    expect(() => parseLevel(['#####', '#...#', '#.A.#', '#@1.#', '#####'])).toThrow(/sem parede/);
  });
  test('porta bloqueia até abrir e muda a revisão da navegação', () => {
    const grid = new LevelGrid(['#####', '#.1.#', '#####']);
    expect(grid.isWalkable(2, 1)).toBe(false);
    const rev = grid.navRevision;
    grid.setDoorOpen('1', 0.5);
    expect(grid.isWalkable(2, 1)).toBe(false);
    grid.setDoorOpen('1', 1);
    expect(grid.isWalkable(2, 1)).toBe(true);
    expect(grid.navRevision).toBe(rev + 1);
    expect(grid.doorAmount('1')).toBe(1);
  });
  test('fora do mapa é parede; canteiro esconde mas não para bala acima da base', () => {
    const grid = new LevelGrid(['#p#']);
    expect(grid.isFullWall(-1, 0)).toBe(true);
    expect(grid.height(1, 0, 'sight')).toBeGreaterThan(2);
    expect(grid.height(1, 0, 'bullet')).toBe(0.5);
    expect(grid.worldToCell(3, 1)).toEqual({ i: 1, j: 0 });
    expect(grid.cellCenter({ i: 1, j: 0 })).toEqual({ x: 3, z: 1 });
  });
});
