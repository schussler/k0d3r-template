import * as THREE from 'three';
import { type CollisionWorld, makeRayHit } from '../world/collision';
import type { ParticleSystem } from '../fx/particles';

/**
 * Disparos dos robôs: projéteis visíveis e lentos o bastante para o jogador desviar. Testados contra o mundo
 * (raio no trecho percorrido no quadro) e contra o corpo do jogador (cápsula vertical).
 */
const MAX = 80;
const PLAYER_RADIUS = 0.42;

export interface Bolt {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  damage: number;
  life: number;
  color: THREE.Color;
  size: number;
}

export interface PlayerBody {
  x: number;
  z: number;
  feetY: number;
  headY: number;
}

export class Projectiles {
  readonly mesh: THREE.InstancedMesh;
  private readonly bolts: Bolt[] = [];
  private next = 0;
  private readonly hit = makeRayHit();
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly z = new THREE.Vector3(0, 0, 1);
  private readonly dir = new THREE.Vector3();
  private readonly zero = new THREE.Matrix4().makeScale(0, 0, 0);
  onImpact: (x: number, y: number, z: number) => void = () => undefined;

  constructor(private readonly sparks: ParticleSystem) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), mat, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    const c = new THREE.Color();
    for (let i = 0; i < MAX; i++) {
      this.mesh.setMatrixAt(i, this.zero);
      this.mesh.setColorAt(i, c);
      this.bolts.push({ active: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), damage: 0, life: 0, color: new THREE.Color(), size: 0.08 });
    }
  }

  fire(from: THREE.Vector3, vel: THREE.Vector3, damage: number, color: THREE.Color, size = 0.08): void {
    const b = this.bolts[this.next];
    this.next = (this.next + 1) % MAX;
    if (!b) return;
    b.active = true;
    b.pos.copy(from);
    b.vel.copy(vel);
    b.damage = damage;
    b.life = 4;
    b.color.copy(color);
    b.size = size;
    this.mesh.setColorAt(this.bolts.indexOf(b), b.color);
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** Devolve o dano total que acertou o jogador e a origem do último acerto. */
  update(dt: number, world: CollisionWorld, player: PlayerBody): { damage: number; fromX: number; fromZ: number } {
    const result = { damage: 0, fromX: 0, fromZ: 0 };
    for (let i = 0; i < MAX; i++) {
      const b = this.bolts[i];
      if (!b?.active) continue;
      b.life -= dt;
      const step = b.vel.length() * dt;
      this.dir.copy(b.vel).normalize();
      const wall = world.raycast(b.pos.x, b.pos.y, b.pos.z, this.dir.x, this.dir.y, this.dir.z, step, this.hit);
      const travel = wall ? this.hit.dist : step;
      if (this.hitsPlayer(b.pos, this.dir, travel, player)) {
        result.damage += b.damage;
        result.fromX = b.pos.x - b.vel.x;
        result.fromZ = b.pos.z - b.vel.z;
        this.kill(i, b);
        continue;
      }
      if (wall || b.life <= 0) {
        if (wall) {
          this.sparks.emit({ count: 6, x: this.hit.x, y: this.hit.y, z: this.hit.z, nx: this.hit.nx, ny: this.hit.ny, nz: this.hit.nz, speed: 4, spread: 0.8, color: b.color, size: 0.06, life: 0.3, gravity: 8, drag: 2 });
          this.onImpact(this.hit.x, this.hit.y, this.hit.z);
        }
        this.kill(i, b);
        continue;
      }
      b.pos.addScaledVector(this.dir, step);
      this.q.setFromUnitVectors(this.z, this.dir);
      this.s.set(b.size, b.size, b.size * 6);
      this.mesh.setMatrixAt(i, this.m.compose(b.pos, this.q, this.s));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    return result;
  }

  /** Menor distância entre o trecho do projétil e o eixo vertical do jogador, amostrada no trecho. */
  private hitsPlayer(p: THREE.Vector3, d: THREE.Vector3, len: number, pl: PlayerBody): boolean {
    const samples = Math.max(2, Math.ceil(len / 0.2));
    for (let k = 0; k <= samples; k++) {
      const t = (len * k) / samples;
      const x = p.x + d.x * t;
      const y = p.y + d.y * t;
      const z = p.z + d.z * t;
      if (y < pl.feetY || y > pl.headY + 0.1) continue;
      if ((x - pl.x) ** 2 + (z - pl.z) ** 2 < PLAYER_RADIUS * PLAYER_RADIUS) return true;
    }
    return false;
  }

  private kill(i: number, b: Bolt): void {
    b.active = false;
    this.mesh.setMatrixAt(i, this.zero);
  }

  /** Projéteis ativos, para o jogador poder derrubar mísseis do chefe. */
  get active(): readonly Bolt[] {
    return this.bolts;
  }

  clear(): void {
    this.bolts.forEach((b, i) => this.kill(i, b));
  }
}
