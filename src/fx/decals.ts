import * as THREE from 'three';
import { decalTexture } from '../render/textures';

/** Furos de bala em anel circular: os mais antigos dão lugar aos novos. */
const MAX = 120;

export class Decals {
  readonly mesh: THREE.InstancedMesh;
  private next = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly n = new THREE.Vector3();
  private readonly z = new THREE.Vector3(0, 0, 1);
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly spin = new THREE.Quaternion();

  constructor() {
    const mat = new THREE.MeshStandardMaterial({
      map: decalTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: 0.9,
    });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    for (let i = 0; i < MAX; i++) this.mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0));
  }

  add(x: number, y: number, z: number, nx: number, ny: number, nz: number, size: number): void {
    const i = this.next;
    this.next = (this.next + 1) % MAX;
    this.n.set(nx, ny, nz);
    this.q.setFromUnitVectors(this.z, this.n);
    this.spin.setFromAxisAngle(this.z, Math.random() * Math.PI * 2);
    this.q.multiply(this.spin);
    this.p.set(x + nx * 0.01, y + ny * 0.01, z + nz * 0.01);
    this.s.setScalar(size * (0.8 + Math.random() * 0.4));
    this.mesh.setMatrixAt(i, this.m.compose(this.p, this.q, this.s));
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear(): void {
    for (let i = 0; i < MAX; i++) this.mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0));
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
