import * as THREE from 'three';
import type { Enemy } from '../enemies/enemy';
import { Boss } from '../enemies/boss';
import { resolveHit, type HitResult, type HitZone } from '../logic/combat';
import { WEAPONS, type WeaponId } from '../logic/weapons';
import type { Sector } from './sector';

export interface PelletHit {
  readonly enemy: Enemy;
  readonly zone: HitZone;
  readonly result: HitResult;
  readonly point: THREE.Vector3;
}

export interface ShotOutcome {
  /** Um resultado agregado por robô atingido (a escopeta soma os projéteis). */
  readonly enemyHits: Map<Enemy, { result: HitResult; point: THREE.Vector3 }>;
  readonly worldHits: { point: THREE.Vector3; normal: THREE.Vector3 }[];
  readonly endpoints: THREE.Vector3[];
}

/** Direção aleatória dentro de um cone de meio-ângulo `spread` em volta de `dir`. */
export function coneDirection(dir: THREE.Vector3, spread: number, rng: () => number): THREE.Vector3 {
  if (spread <= 0) return dir.clone();
  const up = Math.abs(dir.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(dir, up).normalize();
  const realUp = new THREE.Vector3().crossVectors(right, dir).normalize();
  const r = Math.sqrt(rng()) * Math.tan(spread);
  const a = rng() * Math.PI * 2;
  return dir
    .clone()
    .addScaledVector(right, Math.cos(a) * r)
    .addScaledVector(realUp, Math.sin(a) * r)
    .normalize();
}

/**
 * Resolve um disparo por raio instantâneo: cada projétil acha a parede e o primeiro robô antes dela, aplica as
 * regras de dano (src/logic/combat.ts) e devolve o agregado por robô para o feedback.
 */
export function traceShot(sector: Sector, weapon: WeaponId, eye: THREE.Vector3, aim: THREE.Vector3, spread: number, rng: () => number): ShotOutcome {
  const def = WEAPONS[weapon];
  const enemyHits = new Map<Enemy, { result: HitResult; point: THREE.Vector3 }>();
  const worldHits: { point: THREE.Vector3; normal: THREE.Vector3 }[] = [];
  const endpoints: THREE.Vector3[] = [];
  for (let n = 0; n < def.pellets; n++) {
    const dir = coneDirection(aim, spread, rng);
    const wall = sector.raycastWorld(eye, dir, def.range);
    const maxT = wall?.t ?? def.range;
    const hit = sector.raycastEnemies(eye, dir, maxT);
    if (hit) {
      const point = eye.clone().addScaledVector(dir, hit.t);
      const e = hit.enemy;
      const to = new THREE.Vector3(eye.x - e.position.x, 0, eye.z - e.position.z).normalize();
      const result = resolveHit({
        weapon,
        zone: hit.zone,
        kind: e.kind,
        toShooterX: to.x,
        toShooterZ: to.z,
        facing: e.yaw,
        distance: hit.t,
        coreOpen: e instanceof Boss ? e.coreOpen : false,
      });
      const prev = enemyHits.get(e);
      enemyHits.set(e, {
        result: prev
          ? {
              damage: prev.result.damage + result.damage,
              blocked: prev.result.blocked && result.blocked,
              headshot: prev.result.headshot || result.headshot,
              back: prev.result.back || result.back,
            }
          : result,
        point: prev?.point ?? point,
      });
      endpoints.push(point);
    } else if (wall) {
      const point = new THREE.Vector3(wall.x, wall.y, wall.z);
      worldHits.push({ point, normal: new THREE.Vector3(wall.nx, wall.ny, wall.nz) });
      endpoints.push(point);
    } else endpoints.push(eye.clone().addScaledVector(dir, def.range));
  }
  return { enemyHits, worldHits, endpoints };
}
