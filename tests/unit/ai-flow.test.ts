import { describe, expect, test } from 'vitest';
import { assignFlankTargets, cellsToMeters, findCover, findPeek, hearsNoise, patrolRoute } from '../../src/logic/ai';
import { createVitals } from '../../src/logic/combat';
import { formatTime, initialSnapshot, nextSector, takeSnapshot } from '../../src/logic/flow';
import { LevelGrid } from '../../src/logic/level';
import { createRng, angleDelta, turnTowards, damp, clamp } from '../../src/logic/math';
import { createArsenal } from '../../src/logic/weapons';

const arena = new LevelGrid([
  '#####################',
  '#...................#',
  '#...................#',
  '#...................#',
  '#........O..........#',
  '#...................#',
  '#...................#',
  '#...................#',
  '#####################',
]);

describe('cerco', () => {
  test('robôs recebem vagas em lados diferentes da jogadora', () => {
    const player = { x: 20, z: 9 };
    const agents = [
      { id: 1, x: 30, z: 9, range: 8, fly: false },
      { id: 2, x: 31, z: 10, range: 8, fly: false },
      { id: 3, x: 32, z: 8, range: 8, fly: false },
    ];
    const targets = assignFlankTargets(arena, player, agents);
    expect(targets.size).toBe(3);
    const angles = [...targets.values()].map((p) => Math.atan2(p.x - player.x, p.z - player.z));
    const spread = Math.max(...angles) - Math.min(...angles);
    expect(spread).toBeGreaterThan(1.2);
    expect(assignFlankTargets(arena, player, []).size).toBe(0);
  });
});

describe('cobertura e espiada', () => {
  test('acha célula escondida atrás da caixa alta e um ponto para espiar', () => {
    const player = { x: 5, z: 9 };
    const cover = findCover(arena, { x: 24, z: 9 }, player, 1.6, 10)!;
    expect(cover).not.toBeNull();
    const c = arena.cellCenter(cover);
    expect(c.x).toBeGreaterThan(18);
    const peek = findPeek(arena, cover, player, 1.6, 10);
    expect(peek).not.toBeNull();
  });
  test('sem cobertura em sala vazia', () => {
    const empty = new LevelGrid(['#######', '#.....#', '#.....#', '#######']);
    // Toda célula livre encosta em parede, mas a jogadora vê todas: nenhuma serve.
    expect(findCover(empty, { x: 9, z: 3 }, { x: 3, z: 3 }, 1.6, 10)).toBeNull();
  });
});

describe('patrulha e audição', () => {
  test('rota determinística e só em células livres', () => {
    const a = patrolRoute(arena, { i: 5, j: 4 }, createRng(42), false);
    const b = patrolRoute(arena, { i: 5, j: 4 }, createRng(42), false);
    expect(a).toEqual(b);
    a.forEach((c) => expect(arena.isWalkable(c.i, c.j)).toBe(true));
  });
  test('tiro perto sempre é ouvido; longe atrás de parede, não', () => {
    const walled = new LevelGrid(['###########', '#....#....#', '###########']);
    expect(hearsNoise(walled, { x: 3, z: 3 }, { x: 5, z: 3 }, 20, 10)).toBe(true);
    expect(hearsNoise(walled, { x: 3, z: 3 }, { x: 17, z: 3 }, 20, 10)).toBe(false);
    expect(hearsNoise(arena, { x: 3, z: 3 }, { x: 17, z: 3 }, 20, 10)).toBe(true);
    expect(hearsNoise(arena, { x: 3, z: 3 }, { x: 40, z: 3 }, 20, 10)).toBe(false);
    expect(cellsToMeters(3)).toBe(6);
  });
});

describe('fluxo', () => {
  test('ordem dos setores', () => {
    expect(nextSector('hangar')).toBe('labs');
    expect(nextSector('greenhouse')).toBe('core');
    expect(nextSector('core')).toBeNull();
  });
  test('retrato zera ação em andamento e é independente do estado original', () => {
    const arsenal = { ...createArsenal(), action: { kind: 'reload' as const, t: 0.5 }, cooldown: 0.2 };
    const snap = takeSnapshot('labs', createVitals(), arsenal);
    expect(snap.arsenal.action).toEqual({ kind: 'none' });
    expect(snap.arsenal.cooldown).toBe(0);
    expect(initialSnapshot().sector).toBe('hangar');
  });
  test('formata o tempo', () => {
    expect(formatTime(0)).toBe('00:00.0');
    expect(formatTime(75.36)).toBe('01:15.3');
    expect(formatTime(3725)).toBe('62:05.0');
    expect(formatTime(-3)).toBe('00:00.0');
  });
});

describe('math', () => {
  test('ângulos e amortecimento', () => {
    expect(angleDelta(0.1, Math.PI * 2 - 0.1)).toBeCloseTo(-0.2);
    expect(angleDelta(0, Math.PI * 3)).toBeCloseTo(Math.PI);
    expect(turnTowards(0, 1, 0.25)).toBe(0.25);
    expect(damp(0, 10, 1000, 1)).toBeCloseTo(10);
    expect(clamp(5, 0, 1)).toBe(1);
    const rng = createRng(1);
    const v = rng();
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  });
});
