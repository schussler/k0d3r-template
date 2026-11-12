import type { WeaponDef } from './arsenal';

export type HitPart = 'body' | 'head';
export type HitKind = 'body' | 'head' | 'blocked';

/** Metade do cone frontal do escudo do brutamontes: 60° para cada lado. */
const FRONTAL_COS = Math.cos(Math.PI / 3);

export interface HitInput {
  readonly weapon: WeaponDef;
  readonly part: HitPart;
  readonly distance: number;
  /** O alvo tem escudo frontal e o atirador está dentro do cone dele. */
  readonly frontalShield: boolean;
}

export function falloff(weapon: WeaponDef, distance: number): number {
  if (distance <= weapon.falloffStart) return 1;
  if (distance >= weapon.falloffEnd) return weapon.falloffFloor;
  const t = (distance - weapon.falloffStart) / (weapon.falloffEnd - weapon.falloffStart);
  return 1 - (1 - weapon.falloffFloor) * t;
}

export function resolveHit(hit: HitInput): { damage: number; kind: HitKind } {
  if (hit.frontalShield && hit.weapon.shieldPierce <= 0) return { damage: 0, kind: 'blocked' };
  // Pela frente a cabeça do brutamontes fica atrás do escudo: o acerto conta como corpo.
  const head = hit.part === 'head' && !hit.frontalShield;
  const mult = (head ? hit.weapon.headMultiplier : 1) * (hit.frontalShield ? hit.weapon.shieldPierce : 1);
  return { damage: hit.weapon.damage * mult * falloff(hit.weapon, hit.distance), kind: head ? 'head' : 'body' };
}

export interface Planar {
  readonly x: number;
  readonly z: number;
}

/** `toShooter` é a direção do alvo até o atirador; os dois vetores não precisam estar normalizados. */
export function isFrontal(forward: Planar, toShooter: Planar): boolean {
  const lf = Math.hypot(forward.x, forward.z);
  const ls = Math.hypot(toShooter.x, toShooter.z);
  if (lf === 0 || ls === 0) return false;
  return (forward.x * toShooter.x + forward.z * toShooter.z) / (lf * ls) >= FRONTAL_COS;
}
