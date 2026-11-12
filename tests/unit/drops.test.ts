import { describe, expect, test } from 'vitest';
import { AMMO_CHANCE, HEALTH_CHANCE, rollDrop, seeded } from '../../src/rules/drops';

describe('drops', () => {
  test('roll maps to ammo, health or nothing by the table', () => {
    expect(rollDrop(0)).toBe('ammo');
    expect(rollDrop(AMMO_CHANCE - 0.001)).toBe('ammo');
    expect(rollDrop(AMMO_CHANCE + 0.001)).toBe('health');
    expect(rollDrop(AMMO_CHANCE + HEALTH_CHANCE + 0.001)).toBeNull();
  });

  test('a seeded generator gives all three outcomes in a fair share', () => {
    const r = seeded(42);
    const counts = { ammo: 0, health: 0, none: 0 };
    for (let i = 0; i < 2000; i++) counts[rollDrop(r()) ?? 'none']++;
    expect(counts.ammo / 2000).toBeCloseTo(AMMO_CHANCE, 1);
    expect(counts.health / 2000).toBeCloseTo(HEALTH_CHANCE, 1);
    expect(counts.none).toBeGreaterThan(0);
  });

  test('the seeded generator is deterministic', () => {
    const a = seeded(7);
    const b = seeded(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});
