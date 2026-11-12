import { describe, expect, test } from 'vitest';
import { AI, type AiMemory, type Senses, flankAngles, initialMemory, shouldFlank, stepAi, turnTowards } from '../../src/rules/ai';

const quiet: Senses = { sees: false, heard: false, allyCall: false, damaged: false };
const run = (m: AiMemory, s: Partial<Senses>, seconds: number) => {
  let mem = m;
  for (let t = 0; t < seconds; t += 0.1) mem = stepAi(mem, { ...quiet, ...s }, 0.1);
  return mem;
};

describe('AI state machine', () => {
  test('patrol → alert when a shot is heard, → combat when the player is seen', () => {
    const heard = stepAi(initialMemory(), { ...quiet, heard: true }, 0.1);
    expect(heard.mode).toBe('alert');
    expect(stepAi(heard, { ...quiet, sees: true }, 0.1).mode).toBe('combat');
  });

  test('a robot shot from behind stays in combat instead of dropping to search on the next frame', () => {
    let m = stepAi(initialMemory(), { ...quiet, damaged: true }, 0.1);
    for (let i = 0; i < 5; i++) m = stepAi(m, quiet, 0.1);
    expect(m.mode).toBe('combat');
    expect(run(m, {}, AI.LOSE_SIGHT + 0.3).mode).toBe('search');
  });

  test('an ally call alerts; being shot goes straight to combat', () => {
    expect(stepAi(initialMemory(), { ...quiet, allyCall: true }, 0.1).mode).toBe('alert');
    expect(stepAi(initialMemory(), { ...quiet, damaged: true }, 0.1).mode).toBe('combat');
  });

  test('combat → search after losing sight, search → patrol after giving up', () => {
    const combat = stepAi(initialMemory(), { ...quiet, sees: true }, 0.1);
    const search = run(combat, {}, AI.LOSE_SIGHT + 0.2);
    expect(search.mode).toBe('search');
    expect(run(search, {}, AI.SEARCH_GIVEUP + 0.2).mode).toBe('patrol');
  });

  test('alert gives up back to patrol; hearing again restarts the clock', () => {
    const alert = stepAi(initialMemory(), { ...quiet, heard: true }, 0.1);
    const almost = run(alert, {}, AI.ALERT_GIVEUP - 0.5);
    expect(almost.mode).toBe('alert');
    const again = stepAi(almost, { ...quiet, heard: true }, 0.1);
    expect(again.modeTime).toBe(0);
    expect(run(alert, {}, AI.ALERT_GIVEUP + 0.2).mode).toBe('patrol');
  });

  test('a robot flanks when the player stays hidden too long', () => {
    const combat = stepAi(initialMemory(), { ...quiet, sees: true }, 0.1);
    expect(shouldFlank(combat)).toBe(false);
    expect(shouldFlank(run(combat, {}, AI.FLANK_AFTER + 0.2))).toBe(true);
  });
});

describe('flanking and turning', () => {
  test('flank angles spread the group around the player instead of a single line', () => {
    const a = flankAngles(3, 0);
    expect(a).toHaveLength(3);
    expect(a[1]).toBeCloseTo(0);
    expect(Math.abs((a[2] ?? 0) - (a[0] ?? 0))).toBeGreaterThan(Math.PI / 2);
    expect(flankAngles(1, 1)).toEqual([1]);
  });

  test('turnTowards is rate limited and takes the short way around', () => {
    expect(turnTowards(0, 1, 0.25)).toBeCloseTo(0.25);
    expect(turnTowards(0, 0.1, 0.25)).toBeCloseTo(0.1);
    expect(turnTowards(3, -3, 0.5)).toBeGreaterThan(3);
  });
});
