import { describe, expect, test } from 'vitest';
import { resolveHit, isFrontal } from '../../src/rules/damage';
import { WEAPONS } from '../../src/rules/arsenal';

describe('resolveHit', () => {
  test('body hit deals the weapon damage at close range', () => {
    expect(resolveHit({ weapon: WEAPONS.rifle, part: 'body', distance: 5, frontalShield: false })).toEqual({
      damage: WEAPONS.rifle.damage,
      kind: 'body',
    });
  });

  test('head hit multiplies the damage and reports a headshot', () => {
    const r = resolveHit({ weapon: WEAPONS.pistol, part: 'head', distance: 5, frontalShield: false });
    expect(r.kind).toBe('head');
    expect(r.damage).toBe(WEAPONS.pistol.damage * WEAPONS.pistol.headMultiplier);
  });

  test('damage falls off with distance, never below the floor', () => {
    const near = resolveHit({ weapon: WEAPONS.shotgun, part: 'body', distance: 2, frontalShield: false }).damage;
    const far = resolveHit({ weapon: WEAPONS.shotgun, part: 'body', distance: 200, frontalShield: false }).damage;
    expect(far).toBeLessThan(near);
    expect(far).toBeCloseTo(near * WEAPONS.shotgun.falloffFloor);
  });

  test('frontal shield blocks pistol and rifle completely', () => {
    for (const w of [WEAPONS.pistol, WEAPONS.rifle]) {
      expect(resolveHit({ weapon: w, part: 'body', distance: 5, frontalShield: true })).toEqual({ damage: 0, kind: 'blocked' });
      expect(resolveHit({ weapon: w, part: 'head', distance: 5, frontalShield: true }).kind).toBe('blocked');
    }
  });

  test('shotgun goes through the frontal shield at half damage', () => {
    const r = resolveHit({ weapon: WEAPONS.shotgun, part: 'body', distance: 3, frontalShield: true });
    expect(r.kind).toBe('body');
    expect(r.damage).toBeCloseTo(WEAPONS.shotgun.damage * 0.5);
  });
});

describe('isFrontal', () => {
  test('shooter in front within 60 degrees is frontal', () => {
    expect(isFrontal({ x: 0, z: 1 }, { x: 0, z: 1 })).toBe(true);
    expect(isFrontal({ x: 0, z: 1 }, { x: Math.sin(0.9), z: Math.cos(0.9) })).toBe(true);
  });
  test('shooter to the side or behind is not frontal', () => {
    expect(isFrontal({ x: 0, z: 1 }, { x: 1, z: 0 })).toBe(false);
    expect(isFrontal({ x: 0, z: 1 }, { x: 0, z: -1 })).toBe(false);
  });
});
