import { describe, expect, test } from 'vitest';
import { REST, kick, updateSpring } from '../../src/rules/spring';

describe('recoil spring', () => {
  test('a kick raises the offset and it returns to rest', () => {
    let s = kick(REST, 1);
    let peak = 0;
    for (let i = 0; i < 120; i++) {
      s = updateSpring(s, 120, 22, 1 / 120);
      peak = Math.max(peak, s.offset);
    }
    expect(peak).toBeGreaterThan(0.02);
    expect(Math.abs(s.offset)).toBeLessThan(0.002);
  });

  test('with critical damping it never overshoots below rest', () => {
    let s = kick(REST, 1);
    let min = 0;
    for (let i = 0; i < 240; i++) {
      s = updateSpring(s, 120, 2 * Math.sqrt(120), 1 / 120);
      min = Math.min(min, s.offset);
    }
    expect(min).toBeGreaterThan(-1e-3);
  });

  test('large time steps stay stable', () => {
    let s = kick(REST, 1);
    for (let i = 0; i < 20; i++) s = updateSpring(s, 400, 40, 0.1);
    expect(Number.isFinite(s.offset)).toBe(true);
    expect(Math.abs(s.offset)).toBeLessThan(0.01);
  });
});
