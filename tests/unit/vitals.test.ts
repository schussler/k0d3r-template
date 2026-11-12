import { describe, expect, test } from 'vitest';
import { MAX_HEALTH, MAX_SHIELD, SHIELD_DELAY, damagePlayer, fullVitals, heal, isDead, tickVitals } from '../../src/rules/vitals';

describe('vitals', () => {
  test('shield absorbs damage before health', () => {
    const v = damagePlayer(fullVitals(), 30);
    expect(v.shield).toBe(MAX_SHIELD - 30);
    expect(v.health).toBe(MAX_HEALTH);
    const w = damagePlayer({ ...v, shield: 10 }, 30);
    expect(w.shield).toBe(0);
    expect(w.health).toBe(MAX_HEALTH - 20);
  });

  test('shield regenerates only after the delay without damage; health does not', () => {
    let v = damagePlayer(damagePlayer(fullVitals(), 100), 20);
    v = tickVitals(v, SHIELD_DELAY - 0.1);
    expect(v.shield).toBe(0);
    for (let i = 0; i < 600; i++) v = tickVitals(v, 1 / 60);
    expect(v.shield).toBe(MAX_SHIELD);
    expect(v.health).toBe(MAX_HEALTH - 20);
  });

  test('heal caps at max; death at zero health', () => {
    expect(heal({ ...fullVitals(), health: 90 }, 35).health).toBe(MAX_HEALTH);
    const dead = damagePlayer({ ...fullVitals(), shield: 0, health: 5 }, 50);
    expect(dead.health).toBe(0);
    expect(isDead(dead)).toBe(true);
    expect(isDead(fullVitals())).toBe(false);
  });
});
