import { describe, expect, test } from 'vitest';
import { WEAPONS, createArsenal, giveWeapon } from '../../src/rules/arsenal';
import { MIN_RESTORE_HEALTH, advanceClock, formatTime, newRun, recordDeath, restoreSnapshot, takeSnapshot } from '../../src/rules/progress';
import { fullVitals, damagePlayer } from '../../src/rules/vitals';

describe('run clock', () => {
  test('counts only while active: pausing stops it', () => {
    let r = newRun();
    r = advanceClock(r, 1.5, true);
    r = advanceClock(r, 10, false);
    r = advanceClock(r, 0.5, true);
    expect(r.elapsed).toBeCloseTo(2);
  });

  test('deaths add to the same total instead of resetting it', () => {
    let r = advanceClock(newRun(), 30, true);
    r = recordDeath(r);
    r = advanceClock(r, 20, true);
    expect(r.elapsed).toBe(50);
    expect(r.deaths).toBe(1);
  });

  test('formats minutes, seconds and hundredths', () => {
    expect(formatTime(0)).toBe('00:00.00');
    expect(formatTime(75.456)).toBe('01:15.45');
    expect(formatTime(3725.5)).toBe('62:05.50');
  });
});

describe('sector snapshot', () => {
  test('restores health, shield, weapons and ammo exactly as on entry', () => {
    let arsenal = giveWeapon(createArsenal(), 'rifle');
    arsenal = { ...arsenal, guns: { ...arsenal.guns, rifle: { mag: 12, reserve: 40 } } };
    const vitals = damagePlayer(fullVitals(), 130);
    const snap = takeSnapshot(vitals, arsenal);
    const restored = restoreSnapshot(snap);
    expect(restored.arsenal.owned).toEqual(['pistol', 'rifle']);
    expect(restored.arsenal.guns.rifle).toEqual({ mag: 12, reserve: 40 });
    expect(restored.vitals.shield).toBe(0);
    expect(restored.vitals.health).toBe(vitals.health);
  });

  test('the snapshot is a copy: later changes do not leak into it', () => {
    const arsenal = createArsenal();
    const snap = takeSnapshot(fullVitals(), arsenal);
    const later = { ...arsenal, guns: { ...arsenal.guns, pistol: { mag: 0, reserve: 0 } } };
    expect(later.guns.pistol.mag).toBe(0);
    expect(restoreSnapshot(snap).arsenal.guns.pistol.mag).toBe(WEAPONS.pistol.magSize);
  });

  test('restoring never leaves the player with almost no health, to avoid a death loop', () => {
    const snap = takeSnapshot({ health: 4, shield: 0, sinceDamage: 0 }, createArsenal());
    expect(restoreSnapshot(snap).vitals.health).toBe(MIN_RESTORE_HEALTH);
    expect(restoreSnapshot(takeSnapshot(fullVitals(), createArsenal())).vitals.health).toBe(100);
  });
});
