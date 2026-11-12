import { describe, expect, test } from 'vitest';
import { CollisionWorld, makeRayHit, type Box } from '../../src/world/collision';

const box = (minX: number, minZ: number, maxX: number, maxZ: number, maxY = 3): Box => ({
  minX, minY: 0, minZ, maxX, maxY, maxZ, surface: 'metal', enabled: true,
});

describe('CollisionWorld', () => {
  const world = () => {
    const w = new CollisionWorld(10, 10, 2, 0, 6);
    w.add(box(10, 0, 12, 20));
    return w;
  };

  test('ray hits the nearest box face with the right normal', () => {
    const hit = makeRayHit();
    expect(world().raycast(1, 1.5, 5, 1, 0, 0, 100, hit)).toBe(true);
    expect(hit.dist).toBeCloseTo(9);
    expect(hit.nx).toBe(-1);
    expect(hit.surface).toBe('metal');
  });

  test('ray hits the floor when aimed down and nothing is in the way', () => {
    const hit = makeRayHit();
    expect(world().raycast(1, 2, 1, 0, -1, 0, 100, hit)).toBe(true);
    expect(hit.dist).toBeCloseTo(2);
    expect(hit.ny).toBe(1);
  });

  test('disabled boxes (open doors) do not block', () => {
    const w = world();
    const b = w.boxes[0];
    if (b) b.enabled = false;
    expect(w.raycast(1, 1.5, 5, 1, 0, 0, 15, makeRayHit())).toBe(false);
  });

  test('line of sight and ground height', () => {
    const w = world();
    expect(w.lineOfSight(1, 1, 5, 18, 1, 5, makeRayHit())).toBe(false);
    expect(w.lineOfSight(1, 1, 5, 8, 1, 5, makeRayHit())).toBe(true);
    expect(w.groundAt(11, 5, 4, [])).toBe(3);
    expect(w.groundAt(5, 5, 4, [])).toBe(0);
    expect(w.solidAt(11, 1, 5, [])).toBe(true);
  });

  test('ray leaving the grid stops without hitting', () => {
    expect(world().raycast(1, 1.5, 5, -1, 0, 0, 100, makeRayHit())).toBe(false);
  });
});
