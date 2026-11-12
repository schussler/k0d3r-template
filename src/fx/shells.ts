import * as THREE from 'three';
import type { Box, CollisionWorld } from '../world/collision';
import { shellMaterials } from '../player/guns';

/**
 * Cápsulas ejetadas. Nascem na cena da arma (para aparecerem voando ao lado dela) e, depois de um instante,
 * passam para o mundo, onde caem, quicam e tilintam no chão.
 */
const MAX = 40;
const HANDOFF = 0.28;
const LIFETIME = 7;

interface Shell {
  active: boolean;
  heavy: boolean;
  inWorld: boolean;
  age: number;
  bounces: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  spin: THREE.Vector3;
}

export class Shells {
  readonly vmMesh: THREE.InstancedMesh;
  readonly worldMesh: THREE.InstancedMesh;
  private readonly heavyVm: THREE.InstancedMesh;
  private readonly heavyWorld: THREE.InstancedMesh;
  private readonly shells: Shell[] = [];
  private next = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly one = new THREE.Vector3(1, 1, 1);
  private readonly zero = new THREE.Matrix4().makeScale(0, 0, 0);
  private readonly scratch: Box[] = [];
  onBounce: (x: number, y: number, z: number, heavy: boolean) => void = () => undefined;

  constructor() {
    const { brass, shell } = shellMaterials();
    const small = new THREE.CylinderGeometry(0.0055, 0.0055, 0.024, 8);
    small.rotateZ(Math.PI / 2);
    const big = new THREE.CylinderGeometry(0.01, 0.01, 0.06, 10);
    big.rotateZ(Math.PI / 2);
    const make = (g: THREE.BufferGeometry, mat: THREE.Material) => {
      const mesh = new THREE.InstancedMesh(g, mat, MAX);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      for (let i = 0; i < MAX; i++) mesh.setMatrixAt(i, this.zero);
      return mesh;
    };
    this.vmMesh = make(small, brass);
    this.heavyVm = make(big, shell);
    this.worldMesh = make(small.clone(), brass);
    this.heavyWorld = make(big.clone(), shell);
    this.vmMesh.add(this.heavyVm);
    this.worldMesh.add(this.heavyWorld);
    for (let i = 0; i < MAX; i++) {
      this.shells.push({
        active: false, heavy: false, inWorld: false, age: 0, bounces: 0,
        pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(),
      });
    }
  }

  /** `pos` em coordenadas da câmera da arma. */
  eject(pos: THREE.Vector3, heavy: boolean): void {
    const s = this.shells[this.next];
    this.next = (this.next + 1) % MAX;
    if (!s) return;
    s.active = true;
    s.heavy = heavy;
    s.inWorld = false;
    s.age = 0;
    s.bounces = 0;
    s.pos.copy(pos);
    s.vel.set(1.4 + Math.random() * 0.6, 1.2 + Math.random() * 0.6, 0.3 + Math.random() * 0.3);
    s.rot.set(Math.random(), Math.random(), Math.random());
    s.spin.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, 18 + Math.random() * 10);
  }

  update(dt: number, camera: THREE.Camera, player: THREE.Vector3, world: CollisionWorld): void {
    for (let i = 0; i < MAX; i++) {
      const s = this.shells[i];
      if (!s?.active) continue;
      s.age += dt;
      if (s.age > LIFETIME) {
        s.active = false;
        this.hide(i, s);
        continue;
      }
      if (!s.inWorld && s.age > HANDOFF) {
        s.pos.applyMatrix4(camera.matrixWorld);
        s.vel.applyQuaternion(camera.quaternion).add(player);
        s.inWorld = true;
        (s.heavy ? this.heavyVm : this.vmMesh).setMatrixAt(i, this.zero);
      }
      if (s.inWorld) this.stepWorld(s, dt, world);
      else {
        s.vel.y -= 9 * dt;
        s.pos.addScaledVector(s.vel, dt);
      }
      s.rot.x += s.spin.x * dt;
      s.rot.y += s.spin.y * dt;
      s.rot.z += s.spin.z * dt;
      this.q.setFromEuler(s.rot);
      this.m.compose(s.pos, this.q, this.one);
      const mesh = s.inWorld ? (s.heavy ? this.heavyWorld : this.worldMesh) : s.heavy ? this.heavyVm : this.vmMesh;
      mesh.setMatrixAt(i, this.m);
    }
    for (const mesh of [this.vmMesh, this.heavyVm, this.worldMesh, this.heavyWorld]) mesh.instanceMatrix.needsUpdate = true;
  }

  private stepWorld(s: Shell, dt: number, world: CollisionWorld): void {
    if (s.bounces > 3) return;
    s.vel.y -= 14 * dt;
    s.pos.addScaledVector(s.vel, dt);
    const ground = world.groundAt(s.pos.x, s.pos.z, s.pos.y + 0.3, this.scratch) + 0.006;
    if (s.pos.y < ground && s.vel.y < 0) {
      s.pos.y = ground;
      s.vel.y = -s.vel.y * 0.35;
      s.vel.x *= 0.5;
      s.vel.z *= 0.5;
      s.spin.multiplyScalar(0.5);
      s.bounces++;
      if (s.bounces <= 2) this.onBounce(s.pos.x, s.pos.y, s.pos.z, s.heavy);
      if (s.bounces > 3) {
        s.rot.x = 0;
        s.spin.set(0, 0, 0);
      }
    }
  }

  private hide(i: number, s: Shell): void {
    (s.heavy ? this.heavyWorld : this.worldMesh).setMatrixAt(i, this.zero);
    (s.heavy ? this.heavyVm : this.vmMesh).setMatrixAt(i, this.zero);
  }

  clear(): void {
    this.shells.forEach((s, i) => {
      s.active = false;
      this.hide(i, s);
    });
  }
}
