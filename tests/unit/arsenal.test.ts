import { describe, expect, test } from 'vitest';
import { WEAPONS, createArsenal, updateArsenal, addAmmo, giveWeapon, type ArsenalInput } from '../../src/rules/arsenal';

const idle: ArsenalInput = { trigger: false, reload: false, select: null, cycle: 0, sprinting: false };
const step = (s: ReturnType<typeof createArsenal>, input: Partial<ArsenalInput>, dt = 1 / 60) =>
  updateArsenal(s, { ...idle, ...input }, dt);

function run(s: ReturnType<typeof createArsenal>, input: Partial<ArsenalInput>, seconds: number) {
  let state = s;
  const events: string[] = [];
  for (let t = 0; t < seconds; t += 1 / 60) {
    const r = step(state, input);
    state = r.state;
    events.push(...r.events.map((e) => e.type));
  }
  return { state, events };
}

describe('arsenal', () => {
  test('starts with the pistol only, full magazine', () => {
    const s = createArsenal();
    expect(s.owned).toEqual(['pistol']);
    expect(s.current).toBe('pistol');
    expect(s.guns.pistol.mag).toBe(WEAPONS.pistol.magSize);
  });

  test('semi-automatic pistol fires once per trigger press', () => {
    const { state, events } = run(createArsenal(), { trigger: true }, 1);
    expect(events.filter((e) => e === 'fire')).toHaveLength(1);
    expect(state.guns.pistol.mag).toBe(WEAPONS.pistol.magSize - 1);
  });

  test('automatic rifle keeps firing while the trigger is held, at its fire rate', () => {
    const s = { ...giveWeapon(createArsenal(), 'rifle'), current: 'rifle' as const };
    const { events } = run(s, { trigger: true }, 1);
    const shots = events.filter((e) => e === 'fire').length;
    expect(shots).toBeGreaterThanOrEqual(9);
    expect(shots).toBeLessThanOrEqual(11);
  });

  test('pistol reserve is infinite: reload always refills the magazine', () => {
    let s = createArsenal();
    s = { ...s, guns: { ...s.guns, pistol: { mag: 0, reserve: 0 } } };
    const { state, events } = run(s, { reload: true }, WEAPONS.pistol.reloadTime + 0.1);
    expect(events).toContain('reload-start');
    expect(events).toContain('reload-end');
    expect(state.guns.pistol.mag).toBe(WEAPONS.pistol.magSize);
  });

  test('rifle reload moves ammo from reserve to the magazine', () => {
    let s = { ...giveWeapon(createArsenal(), 'rifle'), current: 'rifle' as const };
    s = { ...s, guns: { ...s.guns, rifle: { mag: 10, reserve: 15 } } };
    const { state } = run(s, { reload: true }, WEAPONS.rifle.reloadTime + 0.1);
    expect(state.guns.rifle).toEqual({ mag: 25, reserve: 0 });
  });

  test('empty magazine with no reserve dry-fires instead of firing', () => {
    let s = { ...giveWeapon(createArsenal(), 'rifle'), current: 'rifle' as const };
    s = { ...s, guns: { ...s.guns, rifle: { mag: 0, reserve: 0 } } };
    const { events } = step(s, { trigger: true });
    expect(events.map((e) => e.type)).toEqual(['dry']);
  });

  test('empty magazine with reserve starts a reload when the trigger is pulled', () => {
    let s = createArsenal();
    s = { ...s, guns: { ...s.guns, pistol: { mag: 0, reserve: 0 } } };
    const { events } = step(s, { trigger: true });
    expect(events.map((e) => e.type)).toContain('reload-start');
  });

  test('shotgun reloads shell by shell and firing interrupts the reload', () => {
    let s = { ...giveWeapon(createArsenal(), 'shotgun'), current: 'shotgun' as const };
    s = { ...s, guns: { ...s.guns, shotgun: { mag: 2, reserve: 10 } } };
    const loading = run(s, { reload: true }, WEAPONS.shotgun.reloadTime * 2 + 0.05);
    expect(loading.events.filter((e) => e === 'reload-shell')).toHaveLength(2);
    expect(loading.state.guns.shotgun).toEqual({ mag: 4, reserve: 8 });
    const shot = step(loading.state, { trigger: true });
    expect(shot.events.map((e) => e.type)).toContain('fire');
    expect(shot.state.action.kind).toBe('idle');
  });

  test('switching weapons cancels the reload and blocks firing until the draw ends', () => {
    let s = giveWeapon(createArsenal(), 'rifle');
    s = { ...s, guns: { ...s.guns, pistol: { mag: 3, reserve: 0 } } };
    const reloading = step(s, { reload: true }).state;
    const switching = step(reloading, { select: 'rifle' });
    expect(switching.events.map((e) => e.type)).toEqual(['switch-start']);
    expect(step(switching.state, { trigger: true }).events).toHaveLength(0);
    const { state, events } = run(switching.state, {}, 0.6);
    expect(events).toContain('switch-end');
    expect(state.current).toBe('rifle');
    expect(state.guns.pistol.mag).toBe(3);
  });

  test('mouse wheel cycles through owned weapons only', () => {
    const s = giveWeapon(createArsenal(), 'shotgun');
    const next = run(step(s, { cycle: 1 }).state, {}, 0.6).state;
    expect(next.current).toBe('shotgun');
    const back = run(step(next, { cycle: 1 }).state, {}, 0.6).state;
    expect(back.current).toBe('pistol');
  });

  test('selecting a weapon not owned does nothing', () => {
    expect(step(createArsenal(), { select: 'shotgun' }).events).toHaveLength(0);
  });

  test('cannot fire while sprinting', () => {
    expect(step(createArsenal(), { trigger: true, sprinting: true }).events).toHaveLength(0);
  });

  test('ammo pickups respect the reserve cap and ignore the pistol', () => {
    let s = giveWeapon(createArsenal(), 'rifle');
    s = addAmmo(s, 'rifle', 1000);
    expect(s.guns.rifle.reserve).toBe(WEAPONS.rifle.reserveMax);
    expect(addAmmo(s, 'pistol', 50)).toBe(s);
  });

  test('picking up a weapon already owned gives its ammo instead', () => {
    const s = giveWeapon(createArsenal(), 'rifle');
    const again = giveWeapon({ ...s, guns: { ...s.guns, rifle: { mag: 30, reserve: 0 } } }, 'rifle');
    expect(again.guns.rifle.reserve).toBe(WEAPONS.rifle.startReserve);
    expect(again.owned).toEqual(['pistol', 'rifle']);
  });
});
