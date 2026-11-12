import * as THREE from 'three';
import { groundHeight } from '../logic/collision';
import { CELL, type LevelGrid } from '../logic/level';
import { glowTexture } from '../world/textures';

const SPARK_COUNT = 900;
const CASING_COUNT = 48;
const TRACER_COUNT = 24;
const DECAL_COUNT = 80;
const GLOW_COUNT = 24;
const GRAVITY = 16;

interface Spark {
  life: number;
  max: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  r: number;
  g: number;
  b: number;
  gravity: number;
}

interface Casing {
  life: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  spin: THREE.Vector3;
}

export interface DebrisPiece {
  mesh: THREE.Object3D;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
  radius: number;
  scale: number;
  /** Chamado quando a peça some: libera material clonado. */
  release: () => void;
}

/**
 * Efeitos em pools de tamanho fixo (nada é criado por tiro): faíscas, cápsulas, traçantes, marcas de bala,
 * brilhos e detritos com física simples (gravidade, quique no chão e nas caixas, atrito, giro).
 */
export class Effects {
  readonly group = new THREE.Group();
  private readonly sparks: Spark[] = [];
  private readonly sparkGeo = new THREE.BufferGeometry();
  private readonly sparkPos = new Float32Array(SPARK_COUNT * 3);
  private readonly sparkCol = new Float32Array(SPARK_COUNT * 3);
  private sparkCursor = 0;
  private readonly casings: Casing[] = [];
  private readonly casingMesh: THREE.InstancedMesh;
  private casingCursor = 0;
  private readonly tracers: { mesh: THREE.Mesh; life: number }[] = [];
  private tracerCursor = 0;
  private readonly decals: THREE.Mesh[] = [];
  private decalCursor = 0;
  private readonly glows: { sprite: THREE.Sprite; life: number; max: number; size: number }[] = [];
  private glowCursor = 0;
  private readonly debris: DebrisPiece[] = [];
  private readonly tmp = new THREE.Matrix4();
  private readonly hidden = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor() {
    for (let n = 0; n < SPARK_COUNT; n++) this.sparks.push({ life: 0, max: 1, x: 0, y: -100, z: 0, vx: 0, vy: 0, vz: 0, r: 0, g: 0, b: 0, gravity: 0 });
    this.sparkGeo.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.sparkGeo.setAttribute('color', new THREE.BufferAttribute(this.sparkCol, 3).setUsage(THREE.DynamicDrawUsage));
    const sparkPoints = new THREE.Points(
      this.sparkGeo,
      new THREE.PointsMaterial({ size: 0.11, map: glowTexture(), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    sparkPoints.frustumCulled = false;
    this.group.add(sparkPoints);

    this.casingMesh = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.05, 6),
      new THREE.MeshStandardMaterial({ color: 0xd9a441, metalness: 0.9, roughness: 0.3 }),
      CASING_COUNT,
    );
    this.casingMesh.frustumCulled = false;
    for (let n = 0; n < CASING_COUNT; n++) {
      this.casings.push({ life: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3() });
      this.casingMesh.setMatrixAt(n, this.hidden);
    }
    this.group.add(this.casingMesh);

    const tracerGeo = new THREE.BoxGeometry(0.025, 0.025, 1);
    tracerGeo.translate(0, 0, -0.5);
    for (let n = 0; n < TRACER_COUNT; n++) {
      const mesh = new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({ color: 0xffd38a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      mesh.visible = false;
      this.group.add(mesh);
      this.tracers.push({ mesh, life: 0 });
    }

    const decalGeo = new THREE.CircleGeometry(0.07, 8);
    const decalMat = new THREE.MeshBasicMaterial({ color: 0x050505, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    for (let n = 0; n < DECAL_COUNT; n++) {
      const m = new THREE.Mesh(decalGeo, decalMat);
      m.visible = false;
      this.group.add(m);
      this.decals.push(m);
    }

    for (let n = 0; n < GLOW_COUNT; n++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      sprite.visible = false;
      this.group.add(sprite);
      this.glows.push({ sprite, life: 0, max: 1, size: 1 });
    }
  }

  /** Esguicho de faíscas a partir de um ponto, ao redor da direção `dir`. */
  sparkBurst(pos: THREE.Vector3, dir: THREE.Vector3, count: number, color: THREE.Color, speed = 7, spread = 0.9, gravity = GRAVITY, life = 0.45): void {
    for (let n = 0; n < count; n++) {
      const s = this.sparks[this.sparkCursor]!;
      this.sparkCursor = (this.sparkCursor + 1) % SPARK_COUNT;
      const v = speed * (0.35 + Math.random() * 0.9);
      const rx = dir.x + (Math.random() - 0.5) * spread * 2;
      const ry = dir.y + (Math.random() - 0.3) * spread * 2;
      const rz = dir.z + (Math.random() - 0.5) * spread * 2;
      const len = Math.hypot(rx, ry, rz) || 1;
      s.x = pos.x;
      s.y = pos.y;
      s.z = pos.z;
      s.vx = (rx / len) * v;
      s.vy = (ry / len) * v;
      s.vz = (rz / len) * v;
      s.max = life * (0.5 + Math.random());
      s.life = s.max;
      s.r = color.r;
      s.g = color.g;
      s.b = color.b;
      s.gravity = gravity;
    }
  }

  glow(pos: THREE.Vector3, color: THREE.Color, size: number, life: number): void {
    const g = this.glows[this.glowCursor]!;
    this.glowCursor = (this.glowCursor + 1) % GLOW_COUNT;
    g.sprite.position.copy(pos);
    g.sprite.material.color.copy(color);
    g.sprite.visible = true;
    g.life = life;
    g.max = life;
    g.size = size;
  }

  casing(pos: THREE.Vector3, vel: THREE.Vector3): void {
    const c = this.casings[this.casingCursor]!;
    this.casingCursor = (this.casingCursor + 1) % CASING_COUNT;
    c.life = 3;
    c.pos.copy(pos);
    c.vel.copy(vel);
    c.rot.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    c.spin.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30);
  }

  tracer(from: THREE.Vector3, to: THREE.Vector3, color = 0xffd38a, life = 0.05): void {
    const t = this.tracers[this.tracerCursor]!;
    this.tracerCursor = (this.tracerCursor + 1) % TRACER_COUNT;
    const len = from.distanceTo(to);
    if (len < 0.5) return;
    t.mesh.position.copy(from);
    t.mesh.lookAt(to);
    t.mesh.rotateY(Math.PI);
    t.mesh.scale.set(1, 1, len);
    (t.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
    t.mesh.visible = true;
    t.life = life;
  }

  decal(pos: THREE.Vector3, normal: THREE.Vector3): void {
    const m = this.decals[this.decalCursor]!;
    this.decalCursor = (this.decalCursor + 1) % DECAL_COUNT;
    m.position.copy(pos).addScaledVector(normal, 0.01);
    m.lookAt(pos.clone().add(normal));
    m.scale.setScalar(0.7 + Math.random() * 0.6);
    m.visible = true;
  }

  addDebris(piece: DebrisPiece): void {
    this.debris.push(piece);
    this.group.add(piece.mesh);
  }

  /** Remove tudo (troca de setor ou tentar de novo). */
  clear(): void {
    this.sparks.forEach((s) => (s.life = 0));
    this.casings.forEach((c) => (c.life = 0));
    this.tracers.forEach((t) => (t.mesh.visible = false));
    this.decals.forEach((d) => (d.visible = false));
    this.glows.forEach((g) => (g.sprite.visible = false));
    this.debris.forEach((p) => {
      this.group.remove(p.mesh);
      p.release();
    });
    this.debris.length = 0;
  }

  update(dt: number, grid: LevelGrid): void {
    this.updateSparks(dt, grid);
    this.updateCasings(dt, grid);
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) t.mesh.visible = false;
    }
    for (const g of this.glows) {
      if (g.life <= 0) continue;
      g.life -= dt;
      const k = Math.max(0, g.life / g.max);
      g.sprite.scale.setScalar(g.size * (1.4 - k * 0.4));
      g.sprite.material.opacity = k;
      if (g.life <= 0) g.sprite.visible = false;
    }
    this.updateDebris(dt, grid);
  }

  private updateSparks(dt: number, grid: LevelGrid): void {
    for (let n = 0; n < SPARK_COUNT; n++) {
      const s = this.sparks[n]!;
      if (s.life <= 0) {
        this.sparkPos[n * 3 + 1] = -1000;
        continue;
      }
      s.life -= dt;
      s.vy -= s.gravity * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      const floor = groundHeight(grid, s.x, s.z, 0.01, s.y, 'bullet');
      if (s.y < floor) {
        s.y = floor;
        s.vy *= -0.35;
        s.vx *= 0.6;
        s.vz *= 0.6;
      }
      const k = Math.max(0, s.life / s.max);
      this.sparkPos[n * 3] = s.x;
      this.sparkPos[n * 3 + 1] = s.y;
      this.sparkPos[n * 3 + 2] = s.z;
      this.sparkCol[n * 3] = s.r * k;
      this.sparkCol[n * 3 + 1] = s.g * k;
      this.sparkCol[n * 3 + 2] = s.b * k;
    }
    (this.sparkGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.sparkGeo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  private updateCasings(dt: number, grid: LevelGrid): void {
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    for (let n = 0; n < CASING_COUNT; n++) {
      const c = this.casings[n]!;
      if (c.life <= 0) {
        this.casingMesh.setMatrixAt(n, this.hidden);
        continue;
      }
      c.life -= dt;
      c.vel.y -= GRAVITY * dt;
      c.pos.addScaledVector(c.vel, dt);
      const floor = groundHeight(grid, c.pos.x, c.pos.z, 0.01, c.pos.y + 0.05, 'move');
      if (c.pos.y < floor + 0.012) {
        c.pos.y = floor + 0.012;
        c.vel.y = Math.abs(c.vel.y) * 0.35;
        c.vel.x *= 0.5;
        c.vel.z *= 0.5;
        c.spin.multiplyScalar(0.5);
        c.rot.x = Math.PI / 2;
      }
      c.rot.x += c.spin.x * dt;
      c.rot.y += c.spin.y * dt;
      c.rot.z += c.spin.z * dt;
      this.tmp.compose(c.pos, q.setFromEuler(c.rot), one);
      this.casingMesh.setMatrixAt(n, c.life > 0 ? this.tmp : this.hidden);
    }
    this.casingMesh.instanceMatrix.needsUpdate = true;
  }

  private updateDebris(dt: number, grid: LevelGrid): void {
    for (let n = this.debris.length - 1; n >= 0; n--) {
      const p = this.debris[n]!;
      p.life -= dt;
      if (p.life <= 0) {
        this.group.remove(p.mesh);
        p.release();
        this.debris.splice(n, 1);
        continue;
      }
      p.vel.y -= GRAVITY * dt;
      const pos = p.mesh.position;
      // Paredes e caixas: reflete a velocidade no eixo que bateu.
      const nx = pos.x + p.vel.x * dt;
      if (grid.height(Math.floor(nx / CELL), Math.floor(pos.z / CELL), 'move') > pos.y) p.vel.x *= -0.4;
      else pos.x = nx;
      const nz = pos.z + p.vel.z * dt;
      if (grid.height(Math.floor(pos.x / CELL), Math.floor(nz / CELL), 'move') > pos.y) p.vel.z *= -0.4;
      else pos.z = nz;
      pos.y += p.vel.y * dt;
      const floor = groundHeight(grid, pos.x, pos.z, 0.01, pos.y + 0.3, 'move') + p.radius;
      if (pos.y < floor) {
        pos.y = floor;
        if (Math.abs(p.vel.y) > 1.2) {
          p.vel.y = -p.vel.y * 0.35;
          p.spin.multiplyScalar(0.7);
        } else p.vel.y = 0;
        p.vel.x *= 0.82;
        p.vel.z *= 0.82;
        p.spin.multiplyScalar(0.92);
      }
      p.mesh.rotation.x += p.spin.x * dt;
      p.mesh.rotation.y += p.spin.y * dt;
      p.mesh.rotation.z += p.spin.z * dt;
      // Encolhe no fim, em vez de sumir de uma vez.
      const fade = Math.min(1, p.life / 0.6);
      p.mesh.scale.setScalar(p.scale * fade);
    }
  }
}
