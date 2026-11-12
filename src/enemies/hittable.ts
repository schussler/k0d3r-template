import type * as THREE from 'three';
import type { HitKind, HitPart } from '../rules/damage';
import type { WeaponDef } from '../rules/arsenal';

/** O que o tiro do jogador precisa saber de um alvo: onde o raio bate, se o escudo cobre, e como reage. */
export interface RayTarget {
  dist: number;
  part: HitPart;
  nx: number;
  ny: number;
  nz: number;
}

export interface HitInfo {
  readonly damage: number;
  readonly kind: HitKind;
  readonly point: THREE.Vector3;
  readonly dir: THREE.Vector3;
  readonly weapon: WeaponDef;
}

export interface Hittable {
  readonly alive: boolean;
  raycast(o: THREE.Vector3, d: THREE.Vector3, maxDist: number, out: RayTarget): boolean;
  frontalShieldAgainst(shooter: THREE.Vector3): boolean;
  onHit(hit: HitInfo): void;
}

/** Raio contra esfera; escreve distância e normal em `out`. */
export function raySphere(o: THREE.Vector3, d: THREE.Vector3, cx: number, cy: number, cz: number, r: number, maxDist: number, part: HitPart, out: RayTarget): boolean {
  const ox = o.x - cx;
  const oy = o.y - cy;
  const oz = o.z - cz;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const c = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - c;
  if (disc < 0) return false;
  const t = -b - Math.sqrt(disc);
  if (t < 0 || t > maxDist || t >= out.dist) return false;
  out.dist = t;
  out.part = part;
  out.nx = (ox + d.x * t) / r;
  out.ny = (oy + d.y * t) / r;
  out.nz = (oz + d.z * t) / r;
  return true;
}
