import type { WeaponDef } from './arsenal';

/** Dispersão do tiro em radianos. A mira na tela desenha exatamente este valor. */
export interface Motion {
  /** 0 parado, 1 andando, acima de 1 correndo. */
  readonly speedFactor: number;
  readonly airborne: boolean;
  readonly crouched: boolean;
}

const CROUCH_FACTOR = 0.55;
const AIR_PENALTY = 1.6;
const OPEN_RATE = 14;

export function spreadTarget(def: WeaponDef, m: Motion): number {
  const base = def.spreadBase * (m.crouched ? CROUCH_FACTOR : 1);
  const move = def.spreadMove * Math.min(1.4, m.speedFactor);
  return base + move + (m.airborne ? def.spreadMove * AIR_PENALTY : 0);
}

export function updateSpread(current: number, def: WeaponDef, m: Motion, dt: number): number {
  const target = spreadTarget(def, m);
  if (current > target) return Math.max(target, current - def.spreadRecovery * dt);
  return current + (target - current) * Math.min(1, OPEN_RATE * dt);
}

export function addShotSpread(current: number, def: WeaponDef): number {
  return Math.min(def.spreadMax, current + def.spreadPerShot);
}
