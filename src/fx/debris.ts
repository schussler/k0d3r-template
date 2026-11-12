import * as THREE from 'three';
import type { Box, CollisionWorld } from '../world/collision';

/**
 * Pedaços de robô: na morte, cada peça do modelo sai do robô e ganha física simples (gravidade, giro, quique no
 * chão e na parede). Somem encolhendo depois de alguns segundos.
 */
const MAX = 140;
const LIFE = 6;

interface Piece {
  mesh: THREE.Object3D;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  age: number;
  rest: boolean;
  half: number;
  scale: THREE.Vector3;
}

export class Debris {
  readonly root = new THREE.Group();
  private pieces: Piece[] = [];
  private readonly scratch: Box[] = [];
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  onImpact: (x: number, y: number, z: number) => void = () => undefined;

  /** Solta as peças do grupo com um impulso a partir do centro; `dir` empurra para longe do tiro final. */
  burst(group: THREE.Object3D, center: THREE.Vector3, dir: THREE.Vector3, power: number): void {
    group.updateWorldMatrix(true, true);
    const parts: THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>[] = [];
    group.traverse((o) => {
      if (o instanceof THREE.Mesh && o.visible && !o.userData.noDebris) {
        parts.push(o as THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>);
      }
    });
    for (const mesh of parts) {
      const world = mesh.matrixWorld.clone();
      this.root.add(mesh);
      world.decompose(mesh.position, mesh.quaternion, mesh.scale);
      const out = mesh.position.clone().sub(center);
      out.y = Math.abs(out.y) + 0.4;
      out.normalize();
      const vel = out.multiplyScalar(power * (0.5 + Math.random() * 0.8)).addScaledVector(dir, power * 0.35);
      vel.y += 2 + Math.random() * 3;
      mesh.geometry.computeBoundingSphere();
      const half = Math.max(0.05, (mesh.geometry.boundingSphere?.radius ?? 0.1) * mesh.scale.x * 0.6);
      this.pieces.push({
        mesh, vel, half, age: 0, rest: false, scale: mesh.scale.clone(),
        spin: new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14),
      });
    }
    while (this.pieces.length > MAX) this.remove(0);
  }

  private remove(i: number): void {
    const p = this.pieces[i];
    if (!p) return;
    this.root.remove(p.mesh);
    this.pieces.splice(i, 1);
  }

  update(dt: number, world: CollisionWorld): void {
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i];
      if (!p) continue;
      p.age += dt;
      if (p.age > LIFE) {
        this.remove(i);
        continue;
      }
      if (p.age > LIFE - 1) p.mesh.scale.copy(p.scale).multiplyScalar(Math.max(0.01, LIFE - p.age));
      if (p.rest) continue;
      p.vel.y -= 16 * dt;
      const pos = p.mesh.position;
      const nx = pos.x + p.vel.x * dt;
      const nz = pos.z + p.vel.z * dt;
      if (world.solidAt(nx, pos.y, pos.z, this.scratch)) p.vel.x *= -0.4;
      else pos.x = nx;
      if (world.solidAt(pos.x, pos.y, nz, this.scratch)) p.vel.z *= -0.4;
      else pos.z = nz;
      pos.y += p.vel.y * dt;
      const ground = world.groundAt(pos.x, pos.z, pos.y + p.half, this.scratch) + p.half;
      if (pos.y < ground) {
        pos.y = ground;
        if (p.vel.y < -3) this.onImpact(pos.x, pos.y, pos.z);
        p.vel.y = -p.vel.y * 0.3;
        p.vel.x *= 0.6;
        p.vel.z *= 0.6;
        p.spin.multiplyScalar(0.55);
        if (Math.abs(p.vel.y) < 0.6 && p.vel.x * p.vel.x + p.vel.z * p.vel.z < 0.2) p.rest = true;
      }
      this.e.set(p.spin.x * dt, p.spin.y * dt, p.spin.z * dt);
      p.mesh.quaternion.multiply(this.q.setFromEuler(this.e));
    }
  }

  clear(): void {
    for (const p of this.pieces) this.root.remove(p.mesh);
    this.pieces = [];
  }
}
