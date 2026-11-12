import * as THREE from 'three';
import { WEAPONS, type WeaponId } from '../rules/arsenal';
import { resolveHit } from '../rules/damage';
import type { Hittable, RayTarget } from '../enemies/hittable';
import { type CollisionWorld, makeRayHit } from '../world/collision';
import type { ParticleSystem } from '../fx/particles';
import type { Tracers } from '../fx/tracers';
import type { Decals } from '../fx/decals';

/**
 * Resolve um disparo: raios com a dispersão atual, o alvo mais próximo vence a parede, dano pela regra pura, e
 * devolve o resultado agregado do tiro para HUD, som e tremor (um marcador por tiro, mesmo na escopeta).
 */
export interface ShotResult {
  hits: number;
  head: boolean;
  blocked: boolean;
  /** Ponto de um impacto de bala no escudo, para o som de "tim". */
  blockPoint: THREE.Vector3 | null;
  worldImpacts: { x: number; y: number; z: number; surface: string }[];
}

const SPARK = new THREE.Color(1.0, 0.72, 0.3);
const BLUE_SPARK = new THREE.Color(0.45, 0.8, 1.0);
const DUST = new THREE.Color(0.42, 0.42, 0.44);
const TRACER: Readonly<Record<WeaponId, THREE.Color>> = {
  pistol: new THREE.Color(1.6, 1.3, 0.8),
  rifle: new THREE.Color(1.8, 1.1, 0.5),
  shotgun: new THREE.Color(1.4, 1.0, 0.6),
};

export class Gunplay {
  private readonly dir = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly fwd = new THREE.Vector3();
  private readonly end = new THREE.Vector3();
  private readonly hit = makeRayHit();
  private readonly target: RayTarget = { dist: 0, part: 'body', nx: 0, ny: 0, nz: 0 };

  constructor(
    private readonly sparks: ParticleSystem,
    private readonly smoke: ParticleSystem,
    private readonly tracers: Tracers,
    private readonly decals: Decals,
  ) {}

  fire(id: WeaponId, camera: THREE.Camera, muzzleWorld: THREE.Vector3, spread: number, world: CollisionWorld, targets: readonly Hittable[]): ShotResult {
    const def = WEAPONS[id];
    const origin = camera.getWorldPosition(new THREE.Vector3());
    camera.getWorldDirection(this.fwd);
    this.right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    this.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    const result: ShotResult = { hits: 0, head: false, blocked: false, blockPoint: null, worldImpacts: [] };
    for (let p = 0; p < def.pellets; p++) {
      // Ponto uniforme num disco: o cone de dispersão é exatamente o que a mira desenha.
      const a = spread * Math.sqrt(Math.random());
      const th = Math.random() * Math.PI * 2;
      this.dir.copy(this.fwd).multiplyScalar(Math.cos(a))
        .addScaledVector(this.right, Math.cos(th) * Math.sin(a))
        .addScaledVector(this.up, Math.sin(th) * Math.sin(a))
        .normalize();
      const wallHit = world.raycast(origin.x, origin.y, origin.z, this.dir.x, this.dir.y, this.dir.z, def.range, this.hit);
      const wallDist = wallHit ? this.hit.dist : def.range;
      let best: Hittable | null = null;
      this.target.dist = wallDist;
      for (const t of targets) if (t.alive && t.raycast(origin, this.dir, wallDist, this.target)) best = t;
      if (best) {
        const point = origin.clone().addScaledVector(this.dir, this.target.dist);
        const r = resolveHit({ weapon: def, part: this.target.part, distance: this.target.dist, frontalShield: best.frontalShieldAgainst(origin) });
        best.onHit({ damage: r.damage, kind: r.kind, point, dir: this.dir.clone(), weapon: def });
        if (r.kind === 'blocked') {
          result.blocked = true;
          result.blockPoint ??= point;
          this.sparks.emit({ count: 10, x: point.x, y: point.y, z: point.z, nx: -this.dir.x, ny: -this.dir.y + 0.3, nz: -this.dir.z, speed: 6, spread: 0.9, color: BLUE_SPARK, size: 0.07, life: 0.35, gravity: 9, drag: 2 });
        } else {
          this.sparks.emit({ count: 6, x: point.x, y: point.y, z: point.z, nx: this.target.nx, ny: this.target.ny + 0.2, nz: this.target.nz, speed: 4.5, spread: 0.8, color: SPARK, size: 0.06, life: 0.3, gravity: 9, drag: 1.5 });
          result.hits++;
          result.head ||= r.kind === 'head';
        }
        this.end.copy(point);
      } else if (wallHit) {
        this.end.set(this.hit.x, this.hit.y, this.hit.z);
        this.impact(this.hit.x, this.hit.y, this.hit.z, this.hit.nx, this.hit.ny, this.hit.nz, this.hit.surface, id === 'shotgun');
        if (result.worldImpacts.length < 2) result.worldImpacts.push({ x: this.hit.x, y: this.hit.y, z: this.hit.z, surface: this.hit.surface });
      } else {
        this.end.copy(origin).addScaledVector(this.dir, def.range);
      }
      if (id !== 'shotgun' || p % 3 === 0) this.tracers.spawn(muzzleWorld, this.end, TRACER[id], id === 'rifle' ? 0.022 : 0.018);
    }
    // Fumaça do cano.
    this.end.copy(muzzleWorld).addScaledVector(this.fwd, 0.7);
    this.smoke.emit({ count: id === 'shotgun' ? 5 : 2, x: this.end.x, y: this.end.y, z: this.end.z, nx: this.fwd.x, ny: this.fwd.y + 0.2, nz: this.fwd.z, speed: 0.8, spread: 0.6, color: DUST, size: 0.07, life: 0.7, gravity: -0.4, drag: 2.5, grow: 3 });
    return result;
  }

  private impact(x: number, y: number, z: number, nx: number, ny: number, nz: number, surface: string, light: boolean): void {
    const metal = surface === 'metal' || surface === 'door' || surface === 'floor';
    this.decals.add(x, y, z, nx, ny, nz, light ? 0.07 : 0.1);
    if (metal || surface === 'glass') {
      this.sparks.emit({ count: light ? 3 : 7, x, y, z, nx, ny, nz, speed: 5, spread: 0.7, color: SPARK, size: 0.05, life: 0.3, gravity: 10, drag: 1.5 });
    }
    this.smoke.emit({ count: light ? 1 : 3, x, y, z, nx, ny, nz, speed: 0.9, spread: 0.5, color: DUST, size: 0.2, life: 0.8, gravity: -0.2, drag: 2, grow: 2.5 });
  }
}
