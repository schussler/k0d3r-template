import type { EnemyKind } from './level';
import { WEAPONS, falloff, type WeaponId } from './weapons';

export type HitZone = 'head' | 'body' | 'weak' | 'core';

export interface HitInput {
  readonly weapon: WeaponId;
  readonly zone: HitZone;
  readonly kind: EnemyKind;
  /** Vetor (x, z) normalizado do robô para quem atirou. */
  readonly toShooterX: number;
  readonly toShooterZ: number;
  /** Ângulo para onde o robô olha (rotação y; frente = (sin, cos)). */
  readonly facing: number;
  readonly distance: number;
  /** Núcleo do chefe aberto (fase 2 depois do pisão, ou fase 3). */
  readonly coreOpen?: boolean;
}

export interface HitResult {
  readonly damage: number;
  readonly blocked: boolean;
  readonly headshot: boolean;
  readonly back: boolean;
}

/** Cosseno do meio-ângulo coberto pelo escudo frontal do brutamontes (70°). */
export const SHIELD_COS = Math.cos((70 * Math.PI) / 180);
const BACK_COS = -0.3;
const BACK_MULT = 1.5;

export const BOSS_ZONE_MULT: Readonly<Record<HitZone, number>> = { head: 0.35, body: 0.35, weak: 1.5, core: 2.5 };

/** Regras de dano de um projétil (raio) da jogadora num robô. */
export function resolveHit(h: HitInput): HitResult {
  const def = WEAPONS[h.weapon];
  const base = def.damage * falloff(def, h.distance);
  const facingDot = Math.sin(h.facing) * h.toShooterX + Math.cos(h.facing) * h.toShooterZ;
  const back = facingDot < BACK_COS;

  if (h.kind === 'brute') {
    const front = facingDot > SHIELD_COS;
    if (front && h.weapon !== 'shotgun') return { damage: 0, blocked: true, headshot: false, back: false };
    const headshot = h.zone === 'head' && !front;
    const mult = (back ? BACK_MULT : 1) * (headshot ? def.headMult : 1);
    return { damage: base * mult, blocked: false, headshot, back };
  }

  if (h.kind === 'boss') {
    const zone: HitZone = h.zone === 'core' && !h.coreOpen ? 'body' : h.zone;
    return { damage: base * BOSS_ZONE_MULT[zone], blocked: false, headshot: zone === 'core' || zone === 'weak', back };
  }

  const headshot = h.zone === 'head';
  return { damage: base * (headshot ? def.headMult : 1), blocked: false, headshot, back };
}

export interface Vitals {
  readonly health: number;
  readonly shield: number;
  /** Segundos desde o último dano (a regeneração do escudo espera). */
  readonly sinceDamage: number;
}

export const MAX_HEALTH = 100;
export const MAX_SHIELD = 50;
export const SHIELD_DELAY = 4;
export const SHIELD_REGEN = 15;

export const createVitals = (): Vitals => ({ health: MAX_HEALTH, shield: MAX_SHIELD, sinceDamage: SHIELD_DELAY });

/** O escudo absorve o dano antes da vida. */
export function applyDamage(v: Vitals, amount: number): Vitals {
  if (amount <= 0) return v;
  const absorbed = Math.min(v.shield, amount);
  return { health: Math.max(0, v.health - (amount - absorbed)), shield: v.shield - absorbed, sinceDamage: 0 };
}

export function tickVitals(v: Vitals, dt: number): Vitals {
  const sinceDamage = v.sinceDamage + dt;
  const shield = sinceDamage >= SHIELD_DELAY ? Math.min(MAX_SHIELD, v.shield + SHIELD_REGEN * dt) : v.shield;
  return { ...v, sinceDamage, shield };
}

export function heal(v: Vitals, amount: number): Vitals {
  return { ...v, health: Math.min(MAX_HEALTH, v.health + amount) };
}

export type BossPhase = 1 | 2 | 3;

export function bossPhase(healthFraction: number): BossPhase {
  if (healthFraction > 2 / 3) return 1;
  if (healthFraction > 1 / 3) return 2;
  return 3;
}

/** Chance de largar item na morte: munição 35 %, vida 15 % (valores iniciais). */
export function rollDrop(roll: number): 'ammo' | 'health' | null {
  if (roll < 0.35) return 'ammo';
  if (roll < 0.5) return 'health';
  return null;
}
