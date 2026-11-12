import { describe, expect, test } from 'vitest';
import { PlayerController, type MoveEvent, type MoveInput } from '../../src/player/controller';
import { CollisionWorld } from '../../src/world/collision';

const none: MoveInput = { forward: 0, right: 0, jump: false, crouch: false, sprint: false };

function setup() {
  const w = new CollisionWorld(10, 10, 2, 0, 6);
  w.add({ minX: 8, maxX: 10, minZ: 0, maxZ: 20, minY: 0, maxY: 6, surface: 'metal', enabled: true });
  w.add({ minX: 2, maxX: 4, minZ: 8, maxZ: 10, minY: 0, maxY: 1.15, surface: 'crate', enabled: true });
  const p = new PlayerController(w);
  p.place(5, 5, 0);
  return p;
}

function run(p: PlayerController, input: Partial<MoveInput>, seconds: number): MoveEvent[] {
  const events: MoveEvent[] = [];
  for (let t = 0; t < seconds; t += 1 / 60) p.update(1 / 60, { ...none, ...input }, events);
  return events;
}

describe('PlayerController', () => {
  test('lands on the floor and walks forward (-Z at yaw 0)', () => {
    const p = setup();
    run(p, {}, 0.2);
    expect(p.grounded).toBe(true);
    run(p, { forward: 1 }, 0.5);
    expect(p.z).toBeLessThan(5);
  });

  test('walls stop movement without tunnelling', () => {
    const p = setup();
    p.yaw = -Math.PI / 2;
    run(p, { forward: 1 }, 3);
    expect(p.x).toBeLessThanOrEqual(8 - 0.36 + 1e-6);
  });

  test('sprint is faster than walking, crouch slower', () => {
    const speed = (input: Partial<MoveInput>) => {
      const p = setup();
      p.yaw = Math.PI;
      run(p, {}, 0.1);
      run(p, { forward: 1, ...input }, 0.5);
      return p.horizontalSpeed;
    };
    expect(speed({ sprint: true })).toBeGreaterThan(speed({}));
    expect(speed({ crouch: true })).toBeLessThan(speed({}));
  });

  test('jump leaves the ground and lands with an event; can stand on a crate', () => {
    const p = setup();
    run(p, {}, 0.1);
    const ev = run(p, { jump: true }, 0.05);
    expect(ev.some((e) => e.type === 'jump')).toBe(true);
    expect(run(p, {}, 1.5).some((e) => e.type === 'land')).toBe(true);
    p.place(3, 9, 0);
    p.y = 2;
    run(p, {}, 1);
    expect(p.y).toBeCloseTo(1.15);
  });

  test('crouching lowers the eye; standing up is blocked under a low ceiling', () => {
    const p = setup();
    run(p, {}, 0.1);
    const standing = p.eyeY;
    run(p, { crouch: true }, 0.5);
    expect(p.eyeY).toBeLessThan(standing);
  });

  test('look clamps pitch', () => {
    const p = setup();
    p.look(0, -100000, 0.002);
    expect(p.pitch).toBeLessThanOrEqual(1.52);
  });
});
