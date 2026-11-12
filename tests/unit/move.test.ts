import { describe, expect, test } from 'vitest';
import { CollisionWorld } from '../../src/world/collision';
import { blocked, moveCircle } from '../../src/world/move';

const world = () => {
  const w = new CollisionWorld(10, 10, 2, 0, 6);
  w.add({ minX: 8, maxX: 10, minZ: 0, maxZ: 20, minY: 0, maxY: 1.15, surface: 'crate', enabled: true });
  return w;
};

describe('moveCircle', () => {
  test('slides along a wall instead of stopping dead', () => {
    const m = { x: 7, z: 5 };
    const hit = moveCircle(world(), m, 1, 1, 0.5, 0, 1.8, []);
    expect(hit).toBe(true);
    expect(m.x).toBe(7);
    expect(m.z).toBe(6);
  });

  test('a flyer above the low crate is not blocked', () => {
    expect(blocked(world(), 9, 5, 0.5, 2, 3, [])).toBe(false);
    expect(blocked(world(), 9, 5, 0.5, 0, 1.8, [])).toBe(true);
  });

  test('the map edge blocks', () => {
    expect(blocked(world(), 0.2, 5, 0.5, 0, 2, [])).toBe(true);
  });
});
