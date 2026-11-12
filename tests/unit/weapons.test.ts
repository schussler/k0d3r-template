import { describe, expect, test } from 'vitest';
import {
  AMMO_BOX,
  SWITCH_TIME,
  WEAPONS,
  addAmmo,
  ammoBoxUseful,
  createArsenal,
  cycleWeapon,
  falloff,
  finishReload,
  giveWeapon,
  stepArsenal,
  type Arsenal,
  type ArsenalInput,
} from '../../src/logic/weapons';

const idle: ArsenalInput = { triggerHeld: false, triggerPressed: false, reload: false, switchTo: null, canFire: true };
const pull: ArsenalInput = { ...idle, triggerHeld: true, triggerPressed: true };
const hold: ArsenalInput = { ...idle, triggerHeld: true };

function run(a: Arsenal, input: ArsenalInput, seconds: number, dt = 1 / 60): { a: Arsenal; types: string[] } {
  const types: string[] = [];
  let s = a;
  for (let t = 0; t < seconds; t += dt) {
    const r = stepArsenal(s, input, dt);
    s = r.arsenal;
    types.push(...r.events.map((e) => e.type));
  }
  return { a: s, types };
}

describe('máquina de estados das armas', () => {
  test('pistola semiautomática: um tiro por clique, munição infinita na reserva', () => {
    const a = createArsenal();
    const first = stepArsenal(a, pull, 1 / 60);
    expect(first.events).toEqual([{ type: 'fire', weapon: 'pistol' }]);
    const held = run(first.arsenal, hold, 1);
    expect(held.types.filter((t) => t === 'fire')).toHaveLength(0);
    expect(a.slots.pistol.reserve).toBe(Infinity);
  });

  test('rifle automático respeita a cadência', () => {
    const a = giveWeapon(createArsenal(), 'rifle', 60);
    const switched = run(a, { ...idle, switchTo: 'rifle' }, SWITCH_TIME + 0.05);
    expect(switched.types).toEqual(['switchStart', 'switchEnd']);
    const fired = run(switched.a, hold, 1.0);
    const shots = fired.types.filter((t) => t === 'fire').length;
    expect(shots).toBeGreaterThanOrEqual(10);
    expect(shots).toBeLessThanOrEqual(11);
  });

  test('não atira durante troca, recarga ou correndo', () => {
    const a = giveWeapon(createArsenal(), 'rifle', 60);
    const switching = stepArsenal(a, { ...pull, switchTo: 'rifle' }, 1 / 60);
    expect(switching.events.map((e) => e.type)).toEqual(['switchStart']);
    const sprinting = stepArsenal(createArsenal(), { ...pull, canFire: false }, 1 / 60);
    expect(sprinting.events).toEqual([]);
  });

  test('pente vazio recarrega sozinho no mesmo passo do último tiro', () => {
    let a = giveWeapon(createArsenal(), 'shotgun', 12);
    a = { ...a, current: 'shotgun', slots: { ...a.slots, shotgun: { owned: true, mag: 1, reserve: 12 } } };
    // Um clique só: o ramo "clique com pente vazio" não entra, então quem recarrega é a recarga automática.
    const last = stepArsenal(a, pull, 1 / 60);
    expect(last.events.map((e) => e.type)).toEqual(['fire', 'reloadStart']);
    // A recarga começa depois do intervalo do tiro (a bomba da escopeta), por isso soma os dois.
    const held = run(last.arsenal, hold, WEAPONS.shotgun.fireInterval + WEAPONS.shotgun.reloadTime + 0.2);
    expect(held.types).toContain('reloadEnd');
    expect(held.a.slots.shotgun.mag).toBe(6);
  });

  test('a recarga parcial guarda a bala da câmara', () => {
    const partial = finishReload({ owned: true, mag: 3, reserve: 30 }, WEAPONS.shotgun);
    expect(partial.mag).toBe(7);
    expect(partial.reserve).toBe(26);
    const fromEmpty = finishReload({ owned: true, mag: 0, reserve: 4 }, WEAPONS.shotgun);
    expect(fromEmpty).toEqual({ owned: true, mag: 4, reserve: 0 });
  });

  test('R recarrega e termina depois do tempo de recarga', () => {
    let a = createArsenal();
    a = { ...a, slots: { ...a.slots, pistol: { owned: true, mag: 2, reserve: Infinity } } };
    const start = stepArsenal(a, { ...idle, reload: true }, 1 / 60);
    expect(start.events).toEqual([{ type: 'reloadStart', weapon: 'pistol' }]);
    const done = run(start.arsenal, idle, WEAPONS.pistol.reloadTime + 0.05);
    expect(done.types).toEqual(['reloadEnd']);
    expect(done.a.slots.pistol.mag).toBe(13);
    expect(stepArsenal(createArsenal(), { ...idle, reload: true }, 1 / 60).events).toEqual([]);
  });

  test('sem munição nenhuma, clique seco', () => {
    let a = giveWeapon(createArsenal(), 'rifle', 0);
    a = { ...a, current: 'rifle', slots: { ...a.slots, rifle: { owned: true, mag: 0, reserve: 0 } } };
    expect(stepArsenal(a, pull, 1 / 60).events).toEqual([{ type: 'dry', weapon: 'rifle' }]);
  });

  test('trocar cancela a recarga; trocar para arma que não tem é ignorado', () => {
    let a = giveWeapon(createArsenal(), 'rifle', 60);
    a = { ...a, slots: { ...a.slots, pistol: { owned: true, mag: 1, reserve: Infinity } } };
    const reloading = stepArsenal(a, { ...idle, reload: true }, 1 / 60).arsenal;
    const sw = stepArsenal(reloading, { ...idle, switchTo: 'rifle' }, 1 / 60);
    expect(sw.events.map((e) => e.type)).toEqual(['switchStart']);
    const after = run(sw.arsenal, idle, WEAPONS.pistol.reloadTime + 0.2);
    expect(after.types).not.toContain('reloadEnd');
    expect(after.a.current).toBe('rifle');
    expect(after.a.slots.pistol.mag).toBe(1);
    expect(stepArsenal(createArsenal(), { ...idle, switchTo: 'shotgun' }, 1 / 60).events).toEqual([]);
  });

  test('roda do mouse percorre só as armas possuídas', () => {
    const a = giveWeapon(giveWeapon(createArsenal(), 'rifle', 0), 'shotgun', 0);
    expect(cycleWeapon(a, 1)).toBe('rifle');
    expect(cycleWeapon(a, -1)).toBe('shotgun');
    expect(cycleWeapon(createArsenal(), 1)).toBe('pistol');
  });

  test('munição e armas recebidas respeitam o máximo', () => {
    let a = giveWeapon(createArsenal(), 'rifle', 500);
    expect(a.slots.rifle.reserve).toBe(WEAPONS.rifle.reserveMax);
    expect(ammoBoxUseful(a)).toBe(false);
    a = { ...a, slots: { ...a.slots, rifle: { owned: true, mag: 30, reserve: 10 } } };
    expect(ammoBoxUseful(a)).toBe(true);
    a = addAmmo(a, 'rifle', AMMO_BOX.rifle);
    expect(a.slots.rifle.reserve).toBe(40);
    expect(addAmmo(a, 'shotgun', 6)).toBe(a);
    const again = giveWeapon(a, 'rifle', 0);
    expect(again.slots.rifle.reserve).toBe(70);
  });

  test('queda de dano com a distância', () => {
    expect(falloff(WEAPONS.shotgun, 3)).toBe(1);
    expect(falloff(WEAPONS.shotgun, 100)).toBe(WEAPONS.shotgun.falloffMin);
    expect(falloff(WEAPONS.shotgun, 12)).toBeCloseTo(0.6);
  });
});
