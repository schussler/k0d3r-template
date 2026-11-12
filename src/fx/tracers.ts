import * as THREE from 'three';

/** Traçantes: caixas finas instanciadas, esticadas do cano ao ponto de impacto, que somem em poucos quadros. */
const MAX = 48;
const LIFE = 0.07;

export class Tracers {
  readonly mesh: THREE.InstancedMesh;
  private readonly life = new Float32Array(MAX);
  private readonly base: THREE.Color[] = [];
  private next = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly p = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly z = new THREE.Vector3(0, 0, 1);
  private readonly c = new THREE.Color();

  constructor() {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < MAX; i++) {
      this.mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0));
      this.mesh.setColorAt(i, this.c.setRGB(0, 0, 0));
      this.base.push(new THREE.Color());
    }
  }

  spawn(from: THREE.Vector3, to: THREE.Vector3, color: THREE.Color, width = 0.025): void {
    const i = this.next;
    this.next = (this.next + 1) % MAX;
    this.dir.subVectors(to, from);
    const len = this.dir.length();
    if (len < 0.5) return;
    // Só um trecho do caminho: um risco que corre, não uma linha inteira.
    const seg = Math.min(len, 6 + Math.random() * 4);
    this.dir.divideScalar(len);
    this.p.copy(from).addScaledVector(this.dir, Math.min(len - seg / 2, seg / 2 + Math.random() * (len - seg)));
    this.q.setFromUnitVectors(this.z, this.dir);
    this.s.set(width, width, seg);
    this.mesh.setMatrixAt(i, this.m.compose(this.p, this.q, this.s));
    this.base[i]?.copy(color);
    this.life[i] = LIFE;
  }

  update(dt: number): void {
    for (let i = 0; i < MAX; i++) {
      const l = this.life[i] ?? 0;
      if (l <= 0) continue;
      const nl = l - dt;
      this.life[i] = nl;
      const k = Math.max(0, nl / LIFE);
      this.mesh.setColorAt(i, this.c.copy(this.base[i] ?? this.c).multiplyScalar(k));
      if (nl <= 0) this.mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
