import { describe, expect, test } from 'vitest';
import {
  MAX_HEALTH,
  MAX_SHIELD,
  SHIELD_DELAY,
  applyDamage,
  bossPhase,
  createVitals,
  heal,
  resolveHit,
  rollDrop,
  tickVitals,
  type HitInput,
} from '../../src/logic/combat';

// Robô olhando para +z (facing 0). Atirador na frente: vetor robô→atirador = (0, 1).
const front: Omit<HitInput, 'weapon' | 'zone' | 'kind'> = { toShooterX: 0, toShooterZ: 1, facing: 0, distance: 5 };
const behind = { ...front, toShooterZ: -1 };

describe('resolveHit', () => {
  test('cabeça dobra o dano e é marcada como tiro na cabeça', () => {
    const body = resolveHit({ ...front, weapon: 'pistol', zone: 'body', kind: 'sentinel' });
    const head = resolveHit({ ...front, weapon: 'pistol', zone: 'head', kind: 'sentinel' });
    expect(head.damage).toBe(body.damage * 2);
    expect(head.headshot).toBe(true);
    expect(body.headshot).toBe(false);
  });

  test('brutamontes: escudo anula pistola e rifle pela frente', () => {
    for (const weapon of ['pistol', 'rifle'] as const) {
      const r = resolveHit({ ...front, weapon, zone: 'body', kind: 'brute' });
      expect(r).toEqual({ damage: 0, blocked: true, headshot: false, back: false });
      expect(resolveHit({ ...front, weapon, zone: 'head', kind: 'brute' }).blocked).toBe(true);
    }
  });

  test('brutamontes: escopeta pela frente dá dano cheio; qualquer arma pelas costas dá ×1,5', () => {
    const shotgunFront = resolveHit({ ...front, weapon: 'shotgun', zone: 'body', kind: 'brute' });
    expect(shotgunFront.blocked).toBe(false);
    expect(shotgunFront.damage).toBe(12);
    const pistolBack = resolveHit({ ...behind, weapon: 'pistol', zone: 'body', kind: 'brute' });
    expect(pistolBack.damage).toBe(30);
    expect(pistolBack.back).toBe(true);
  });

  test('brutamontes: de lado (fora dos 70° do escudo) leva dano normal', () => {
    const side = resolveHit({ ...front, toShooterX: 1, toShooterZ: 0, weapon: 'rifle', zone: 'body', kind: 'brute' });
    expect(side.blocked).toBe(false);
    expect(side.damage).toBe(14);
  });

  test('chefe: núcleo fechado vale como corpo; aberto multiplica', () => {
    const closed = resolveHit({ ...front, weapon: 'pistol', zone: 'core', kind: 'boss', coreOpen: false });
    const open = resolveHit({ ...front, weapon: 'pistol', zone: 'core', kind: 'boss', coreOpen: true });
    const weak = resolveHit({ ...front, weapon: 'pistol', zone: 'weak', kind: 'boss' });
    expect(closed.damage).toBeCloseTo(7);
    expect(open.damage).toBe(50);
    expect(weak.damage).toBe(30);
    expect(open.headshot && weak.headshot).toBe(true);
  });

  test('queda de dano da escopeta de longe', () => {
    const far = resolveHit({ ...front, distance: 30, weapon: 'shotgun', zone: 'body', kind: 'drone' });
    expect(far.damage).toBeCloseTo(12 * 0.2);
  });
});

describe('vida e escudo', () => {
  test('escudo absorve antes da vida', () => {
    const v = applyDamage(createVitals(), 70);
    expect(v.shield).toBe(0);
    expect(v.health).toBe(MAX_HEALTH - 20);
    expect(applyDamage(v, 0)).toBe(v);
    expect(applyDamage(v, 500).health).toBe(0);
  });
  test('escudo regenera só depois do atraso', () => {
    let v = applyDamage(createVitals(), 30);
    v = tickVitals(v, SHIELD_DELAY - 0.1);
    expect(v.shield).toBe(MAX_SHIELD - 30);
    v = tickVitals(v, 0.2);
    expect(v.shield).toBeGreaterThan(MAX_SHIELD - 30);
    v = tickVitals(v, 10);
    expect(v.shield).toBe(MAX_SHIELD);
  });
  test('vida volta só com item e não passa do máximo', () => {
    const hurt = applyDamage(createVitals(), 90);
    expect(heal(hurt, 35).health).toBe(95);
    expect(heal(hurt, 500).health).toBe(MAX_HEALTH);
  });
});

describe('chefe e itens', () => {
  test('fases por vida', () => {
    expect(bossPhase(1)).toBe(1);
    expect(bossPhase(0.67)).toBe(1);
    expect(bossPhase(0.5)).toBe(2);
    expect(bossPhase(0.33)).toBe(3);
    expect(bossPhase(0)).toBe(3);
  });
  test('sorteio de item', () => {
    expect(rollDrop(0.1)).toBe('ammo');
    expect(rollDrop(0.4)).toBe('health');
    expect(rollDrop(0.9)).toBeNull();
  });
});
