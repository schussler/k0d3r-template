import { describe, expect, test } from 'vitest';
import { groundHeight, hasLineOfSight, moveBody, raySphere, raycastGrid } from '../../src/logic/collision';
import { LevelGrid } from '../../src/logic/level';

const room = new LevelGrid([
  '##########',
  '#........#',
  '#...o....#',
  '#........#',
  '#...O....#',
  '##########',
]);

describe('moveBody', () => {
  test('para na parede sem atravessar, mesmo em velocidade alta', () => {
    const r = moveBody(room, { x: 15, y: 0, z: 3 }, { x: 40, y: 0, z: 0 }, 0.35, 1.8, 10);
    expect(r.x).toBeLessThan(18);
    expect(r.x).toBeGreaterThan(17);
    expect(r.blocked).toBe(true);
  });
  test('desliza ao longo da parede no movimento diagonal', () => {
    const r = moveBody(room, { x: 15, y: 0, z: 3 }, { x: 5, y: 0, z: 1 }, 0.35, 1.8, 10);
    expect(r.z).toBeCloseTo(4);
  });
  test('caixa baixa bloqueia quem está no chão e sustenta quem cai sobre ela', () => {
    const blocked = moveBody(room, { x: 7, y: 0, z: 5 }, { x: 2, y: 0, z: 0 }, 0.35, 1.8, 10);
    expect(blocked.x).toBeLessThan(8);
    const landed = moveBody(room, { x: 9, y: 1.4, z: 5 }, { x: 0, y: -1, z: 0 }, 0.35, 1.8, 10);
    expect(landed.y).toBe(1);
    expect(landed.onGround).toBe(true);
    expect(groundHeight(room, 9, 5, 0.35, 1, 'move')).toBe(1);
  });
  test('teto limita o pulo', () => {
    const r = moveBody(room, { x: 5, y: 0, z: 3 }, { x: 0, y: 5, z: 0 }, 0.35, 1.8, 3);
    expect(r.y).toBeCloseTo(1.2);
    expect(r.hitCeiling).toBe(true);
  });
});

describe('raycastGrid', () => {
  test('acerta a parede com a normal certa', () => {
    const hit = raycastGrid(room, 5, 1.5, 3, 1, 0, 0, 100, 10, 'bullet')!;
    expect(hit.x).toBeCloseTo(18);
    expect(hit.nx).toBe(-1);
  });
  test('passa por cima da caixa baixa e acerta o topo dela vindo de cima', () => {
    const over = raycastGrid(room, 3, 1.5, 5, 1, 0, 0, 100, 10, 'bullet')!;
    expect(over.x).toBeCloseTo(18);
    const len = Math.hypot(6, -2);
    const down = raycastGrid(room, 3, 3, 5, 6 / len, -2 / len, 0, 100, 10, 'bullet')!;
    expect(down.ny).toBe(1);
    expect(down.y).toBeCloseTo(1);
  });
  test('acerta o chão e o teto', () => {
    expect(raycastGrid(room, 5, 1.5, 3, 0, -1, 0, 100, 10, 'bullet')!.ny).toBe(1);
    expect(raycastGrid(room, 5, 1.5, 3, 0, 1, 0, 100, 10, 'bullet')!.y).toBe(10);
    expect(raycastGrid(room, 5, 1.5, 3, 1, 0, 0, 2, 10, 'bullet')).toBeNull();
  });
  test('visada: caixa alta esconde, caixa baixa não esconde quem está de pé', () => {
    expect(hasLineOfSight(room, 3, 1.6, 9, 15, 1.6, 9, 10)).toBe(false);
    expect(hasLineOfSight(room, 3, 1.6, 5, 15, 1.6, 5, 10)).toBe(true);
    expect(hasLineOfSight(room, 3, 0.5, 5, 15, 0.5, 5, 10)).toBe(false);
    expect(hasLineOfSight(room, 3, 1, 3, 3, 1, 3, 10)).toBe(true);
  });
});

describe('raySphere', () => {
  test('acerta, erra e começa dentro', () => {
    expect(raySphere(0, 0, 0, 1, 0, 0, 5, 0, 0, 1)).toBeCloseTo(4);
    expect(raySphere(0, 0, 0, 1, 0, 0, 5, 3, 0, 1)).toBeNull();
    expect(raySphere(0, 0, 0, 1, 0, 0, -5, 0, 0, 1)).toBeNull();
    expect(raySphere(5, 0, 0, 1, 0, 0, 5, 0, 0, 1)).toBeCloseTo(1);
  });
});
