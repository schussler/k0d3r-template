import { describe, expect, test } from 'vitest';
import { WEAPONS } from '../../src/rules/arsenal';
import { addShotSpread, spreadTarget, updateSpread } from '../../src/rules/spread';

const still = { speedFactor: 0, airborne: false, crouched: false };
const w = WEAPONS.rifle;

describe('spread', () => {
  test('moving, jumping and crouching change the target spread in the expected order', () => {
    const base = spreadTarget(w, still);
    expect(spreadTarget(w, { ...still, crouched: true })).toBeLessThan(base);
    expect(spreadTarget(w, { ...still, speedFactor: 1 })).toBeGreaterThan(base);
    expect(spreadTarget(w, { ...still, airborne: true })).toBeGreaterThan(base);
  });

  test('each shot opens the spread up to the weapon maximum', () => {
    let s = spreadTarget(w, still);
    for (let i = 0; i < 100; i++) s = addShotSpread(s, w);
    expect(s).toBe(w.spreadMax);
  });

  test('spread closes back to the target over time and opens quickly when moving', () => {
    let s = w.spreadMax;
    for (let i = 0; i < 120; i++) s = updateSpread(s, w, still, 1 / 60);
    expect(s).toBeCloseTo(spreadTarget(w, still));
    const moving = { ...still, speedFactor: 1 };
    for (let i = 0; i < 30; i++) s = updateSpread(s, w, moving, 1 / 60);
    expect(s).toBeCloseTo(spreadTarget(w, moving), 3);
  });
});
