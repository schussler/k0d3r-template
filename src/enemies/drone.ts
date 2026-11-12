import * as THREE from 'three';
import { createLoop, type Loop } from '../audio/engine';
import { type EnemyFrame, type EnemyServices, type Hitbox, Robot, robotMaterial } from './robot';

/**
 * Drone: voa rápido, circula o jogador num ângulo próprio e dá rasantes: avisa com luz e som, mergulha em linha
 * reta, passa através e sobe de novo. Pouca vida, difícil de acertar no ar.
 */
const SPEED = 7.5;
const ORBIT_RANGE = 9;
const DIVE_SPEED = 17;
const WINDUP = 0.6;
const CONTACT_DAMAGE = 14;
const COOLDOWN_MIN = 2.2;

type Phase = 'cruise' | 'windup' | 'dive' | 'recover';

let geo: { body: THREE.SphereGeometry; eye: THREE.SphereGeometry; pod: THREE.CylinderGeometry; blade: THREE.BoxGeometry; arm: THREE.BoxGeometry; fin: THREE.BoxGeometry } | null = null;

export class Drone extends Robot {
  readonly kind = 'drone';
  protected readonly radius = 0.45;
  protected readonly eyeHeight = 0;
  protected readonly flying = true;
  protected override readonly knockScale = 1.6;
  protected readonly hitboxes: readonly Hitbox[] = [
    { part: 'head', x: 0, y: 0.02, z: 0.3, r: 0.15 },
    { part: 'body', x: 0, y: 0, z: 0, r: 0.42 },
  ];
  private phase: Phase = 'cruise';
  private phaseTime = 0;
  private cooldown = 1 + Math.random() * 2;
  private altitude = 3 + Math.random();
  private readonly dive = new THREE.Vector3();
  private diveHit = false;
  private target = { x: 0, z: 0 };
  private retarget = 0;
  private readonly rotors: THREE.Object3D[] = [];
  private readonly eyeMat: THREE.MeshStandardMaterial;
  private hum: Loop | null = null;
  private bob = Math.random() * 10;

  constructor(x: number, z: number, s: EnemyServices) {
    super(x, z, 40, s);
    this.y = this.altitude;
    geo ??= {
      body: new THREE.SphereGeometry(0.38, 20, 14),
      eye: new THREE.SphereGeometry(0.13, 14, 10),
      pod: new THREE.CylinderGeometry(0.17, 0.17, 0.12, 16),
      blade: new THREE.BoxGeometry(0.5, 0.012, 0.06),
      arm: new THREE.BoxGeometry(0.42, 0.06, 0.08),
      fin: new THREE.BoxGeometry(0.04, 0.22, 0.18),
    };
    const shell = this.flashable(robotMaterial(0xdfe4ea, 0x000000, 1, 0.35, 0.35));
    const dark = this.flashable(robotMaterial(0x23272e, 0x000000, 1, 0.8, 0.35));
    this.eyeMat = this.flashable(robotMaterial(0x111111, 0xff6a1a, 3));
    const body = new THREE.Mesh(geo.body, shell);
    body.scale.set(1, 0.72, 1.1);
    const belly = new THREE.Mesh(geo.body, dark);
    belly.scale.set(0.8, 0.4, 0.85);
    belly.position.y = -0.14;
    const eye = new THREE.Mesh(geo.eye, this.eyeMat);
    eye.position.set(0, 0.02, 0.32);
    this.body.add(body, belly, eye);
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(geo.arm, dark);
      arm.position.set(side * 0.42, 0.04, -0.05);
      const pod = new THREE.Mesh(geo.pod, dark);
      pod.position.set(side * 0.66, 0.06, -0.05);
      const rotor = new THREE.Group();
      rotor.position.set(side * 0.66, 0.14, -0.05);
      const b1 = new THREE.Mesh(geo.blade, shell);
      const b2 = new THREE.Mesh(geo.blade, shell);
      b2.rotation.y = Math.PI / 2;
      rotor.add(b1, b2);
      this.rotors.push(rotor);
      const fin = new THREE.Mesh(geo.fin, dark);
      fin.position.set(side * 0.16, 0.26, -0.26);
      this.body.add(arm, pod, rotor, fin);
    }
    // Sem sombra projetada: são pequenos e muitos; cada peça a mais dobraria as chamadas de desenho no setor.
  }

  override dispose(): void {
    this.hum?.stop();
    this.hum = null;
  }

  protected behave(f: EnemyFrame): void {
    const dt = f.dt;
    this.bob += dt;
    this.cooldown -= dt;
    this.phaseTime += dt;
    if (!this.hum && this.services.audio.ready) this.hum = createLoop(this.services.audio, 'sawtooth', 120 + Math.random() * 20, 0.05, 700);
    this.hum?.setPosition(this.x, this.y, this.z);
    for (const r of this.rotors) r.rotation.y += dt * 40;

    if (this.phase === 'windup') return this.doWindup(f);
    if (this.phase === 'dive') return this.doDive(f);
    if (this.phase === 'recover' && this.phaseTime > 0.7) this.phase = 'cruise';

    const mode = this.mem.mode;
    const p = f.player;
    let goal: { x: number; z: number };
    if (mode === 'combat') {
      // Órbita no ângulo de flanco que o diretor deu, girando devagar.
      const a = this.flankAngle + Math.sin(f.time * 0.4 + this.bob) * 0.5;
      goal = { x: p.x + Math.sin(a) * ORBIT_RANGE, z: p.z + Math.cos(a) * ORBIT_RANGE };
      this.faceTowards(p.x, p.z, 5, dt);
      const dist = this.distanceToPlayer(f);
      if (this.sees && this.cooldown <= 0 && dist > 4 && dist < 18) this.startWindup(f);
    } else if (mode === 'alert' || mode === 'search') {
      goal = mode === 'alert' ? { x: this.noiseX, z: this.noiseZ } : { x: this.lastSeenX, z: this.lastSeenZ };
      this.faceTowards(goal.x, goal.z, 3, dt);
    } else {
      this.retarget -= dt;
      if (this.retarget <= 0) {
        this.target = this.patrolPoint(f, 5);
        this.retarget = 4 + Math.random() * 3;
      }
      goal = this.target;
      this.faceTowards(goal.x, goal.z, 2, dt);
    }
    this.navigate(f, goal.x, goal.z, mode === 'patrol' ? SPEED * 0.4 : SPEED, 4);
    // O teto do setor limita a altitude: nos laboratórios (3,6 m) um drone a 4 m ficaria atrás do forro, invisível e imune a tiro.
    const ceiling = f.world.ceilingY - 0.9;
    const wantY = Math.min(ceiling, (mode === 'combat' ? 2.6 : this.altitude) + Math.sin(this.bob * 2.3) * 0.25);
    this.y += (wantY - this.y) * Math.min(1, dt * 2.5);
    this.body.rotation.z = -this.vx * 0.05;
  }

  private startWindup(f: EnemyFrame): void {
    this.phase = 'windup';
    this.phaseTime = 0;
    this.services.sfx.windup(this.x, this.y, this.z, WINDUP);
    this.dive.set(f.player.x - this.x, f.player.eyeY - 0.5 - this.y, f.player.z - this.z);
  }

  private doWindup(f: EnemyFrame): void {
    // Recua um pouco e acende o olho: o aviso do rasante.
    this.faceTowards(f.player.x, f.player.z, 8, f.dt);
    this.eyeMat.emissiveIntensity = 3 + this.phaseTime * 14;
    this.dive.set(f.player.x - this.x, f.player.eyeY - 0.5 - this.y, f.player.z - this.z);
    const back = this.dive.clone().normalize().multiplyScalar(-1.2 * f.dt);
    this.nudge(f.world, back.x, back.z);
    if (this.phaseTime < WINDUP) return;
    this.dive.normalize().multiplyScalar(DIVE_SPEED);
    this.phase = 'dive';
    this.phaseTime = 0;
    this.diveHit = false;
    this.services.sfx.whoosh(this.x, this.y, this.z);
  }

  private doDive(f: EnemyFrame): void {
    const dt = f.dt;
    const hit = this.moveFree(f, this.dive.x * dt, this.dive.z * dt);
    this.y = Math.max(0.7, Math.min(f.world.ceilingY - 0.9, this.y + this.dive.y * dt));
    this.body.rotation.x = 0.4;
    const p = f.player;
    if (!this.diveHit && Math.hypot(p.x - this.x, p.z - this.z) < 1.1 && this.y > p.feetY - 0.2 && this.y < p.eyeY + 0.4) {
      this.diveHit = true;
      f.damagePlayer(CONTACT_DAMAGE, this.x, this.z, this.dive.x * 0.25, this.dive.z * 0.25);
    }
    if (hit || this.phaseTime > 1.1) {
      this.phase = 'recover';
      this.phaseTime = 0;
      this.cooldown = COOLDOWN_MIN + Math.random() * 2;
      this.eyeMat.emissiveIntensity = 3;
      this.body.rotation.x = 0;
      this.dive.y = 0;
    }
  }

  private moveFree(f: EnemyFrame, dx: number, dz: number): boolean {
    const before = { x: this.x, z: this.z };
    const m = { x: this.x, z: this.z };
    const hit = this.blockedAt(f, m.x + dx, m.z + dz);
    if (!hit) {
      this.x += dx;
      this.z += dz;
    }
    return hit || (before.x === this.x && before.z === this.z);
  }

  private blockedAt(f: EnemyFrame, x: number, z: number): boolean {
    return f.world.solidAt(x, this.y, z, this.scratch);
  }
}
