import * as THREE from 'three';
import { Missile } from './missile';
import { type EnemyFrame, type EnemyServices, type Hitbox, Robot, robotMaterial } from './robot';
import type { HitInfo, Hittable } from './hittable';
import { makeRayHit } from '../world/collision';

/**
 * Chefe do núcleo: robô gigante com 3 fases de ataque.
 *  1. Rajadas de metralhadora avisadas por laser; caminha devagar.
 *  2. (abaixo de 2/3 da vida) grito, mísseis perseguidores que podem ser derrubados a tiro e 2 drones de reforço.
 *  3. (abaixo de 1/3) a blindagem do peito abre e expõe o núcleo (alvo grande, tiro na cabeça); feixes que varrem
 *     a arena (um baixo que se pula e um alto que se evita agachando) e ondas de choque no chão (se pula).
 * A cada troca de fase ele fica atordoado por um instante e a arena ganha munição e vida.
 */
export const BOSS_MAX_HEALTH = 1300;
const WALK = 2.3;
const PHASE_1_END = 2 / 3;
const PHASE_2_END = 1 / 3;
const STAGGER_TIME = 2.2;
const ARMOR = 0.75;
const BOLT_SPEED = 28;
const BOLT_DAMAGE = 7;
const BOLT_COLOR = new THREE.Color(3, 0.9, 0.2);
const BEAM_DAMAGE = 18;
const BEAM_WIDTH = 0.6;
const BEAM_RANGE = 48;
const BEAM_SWEEP_TIME = 3.4;
const RING_DAMAGE = 16;
const RING_SPEED = 13;
const RING_MAX = 28;

type Move = 'walk' | 'burst' | 'missiles' | 'beam' | 'stomp' | 'stagger';
type BeamHeight = 'low' | 'high';

const angleDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export class Boss extends Robot {
  readonly kind = 'boss';
  protected readonly radius = 1.5;
  protected readonly eyeHeight = 5.2;
  protected readonly flying = false;
  protected override readonly knockScale = 0;
  protected override readonly flashStrength = 0.18;
  protected override readonly viewRange: number = 60;
  protected override hitboxes: readonly Hitbox[] = [];
  phase = 1;
  onPhaseChange: (phase: number) => void = () => undefined;
  private move: Move = 'walk';
  private moveTime = 0;
  private cooldown = 2.5;
  private shots = 0;
  private activated = false;
  private legSwing = 0;
  private armorOpen = 0;
  private beamAngle = 0;
  private beamFrom = 0;
  private beamHeight: BeamHeight = 'low';
  private beamHitCd = 0;
  private ringRadius = 0;
  private ringHit = false;
  private ringActive = false;
  private spawnedAdds = false;
  private readonly missiles: Missile[] = [];
  /** Raiz dos mísseis na cena: eles voam em coordenadas do mundo, fora do grupo do chefe. */
  private readonly missileRoot = new THREE.Group();
  private readonly muzzles: THREE.Object3D[] = [];
  private readonly lasers: THREE.Mesh[] = [];
  private readonly beam: THREE.Mesh;
  private readonly ring: THREE.Mesh;
  private readonly plates: THREE.Mesh[] = [];
  private readonly coreMat: THREE.MeshStandardMaterial;
  private readonly legs: THREE.Object3D[] = [];
  private readonly torso = new THREE.Group();
  private readonly tmp = new THREE.Vector3();
  private readonly aim = new THREE.Vector3();
  private readonly beamRay = makeRayHit();
  private lastStep = 0;

  constructor(x: number, z: number, services: EnemyServices) {
    super(x, z, BOSS_MAX_HEALTH, services);
    const armor = this.flashable(robotMaterial(0x4a4e58, 0x000000, 1, 0.8, 0.4));
    const dark = this.flashable(robotMaterial(0x1c1f26, 0x000000, 1, 0.85, 0.35));
    const trim = this.flashable(robotMaterial(0xd9a400, 0x000000, 1, 0.4, 0.5));
    const glow = this.flashable(robotMaterial(0x111111, 0xff5a1a, 3.5));
    this.coreMat = this.flashable(robotMaterial(0x111111, 0xff2a10, 2.5));
    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = this.body) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };
    for (const side of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(side * 1.0, 2.7, 0);
      box(0.95, 1.5, 1.05, dark, 0, -0.7, 0, leg);
      box(1.05, 1.4, 1.15, armor, 0, -1.8, 0.05, leg);
      box(1.25, 0.4, 1.9, trim, 0, -2.5, 0.35, leg);
      this.legs.push(leg);
      this.body.add(leg);
    }
    box(2.8, 0.9, 1.7, dark, 0, 3.0, 0);
    this.body.add(this.torso);
    box(3.1, 2.3, 1.9, armor, 0, 4.4, 0, this.torso);
    box(3.15, 0.18, 1.95, trim, 0, 3.4, 0, this.torso);
    box(1.9, 0.9, 0.6, dark, 0, 5.2, -1.1, this.torso);
    for (const vx of [-0.6, 0, 0.6]) box(0.34, 0.8, 0.1, glow, vx, 4.9, -1.42, this.torso);
    box(1.15, 0.85, 1.05, dark, 0, 6.15, 0.1, this.torso);
    box(0.95, 0.14, 0.1, glow, 0, 6.2, 0.66, this.torso);
    this.coreMat.userData.core = true;
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 14), this.coreMat);
    core.position.set(0, 4.5, 0.85);
    this.torso.add(core);
    for (const side of [-1, 1]) {
      const plate = box(1.35, 1.9, 0.26, armor, side * 0.68, 4.5, 1.0, this.torso);
      this.plates.push(plate);
      box(0.9, 0.9, 0.9, armor, side * 2.2, 5.3, 0, this.torso);
      box(0.7, 1.7, 0.7, dark, side * 2.3, 4.0, 0.2, this.torso);
      const gun = new THREE.Group();
      gun.position.set(side * 2.3, 3.2, 0.9);
      box(0.55, 0.6, 1.5, dark, 0, 0, 0.2, gun);
      for (const o of [-0.14, 0.14]) {
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.4, 8), armor);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(o, 0, 1.2);
        gun.add(barrel);
      }
      const muzzle = new THREE.Object3D();
      muzzle.position.set(0, 0, 1.95);
      gun.add(muzzle);
      this.muzzles.push(muzzle);
      this.torso.add(gun);
    }
    for (let i = 0; i < 2; i++) {
      const laser = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, 1, 4),
        new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.6, toneMapped: false, depthWrite: false }),
      );
      laser.visible = false;
      laser.userData.noDebris = true;
      this.lasers.push(laser);
      this.sceneExtras.push(laser);
    }
    this.beam = new THREE.Mesh(
      new THREE.BoxGeometry(BEAM_WIDTH, BEAM_WIDTH * 0.6, 1),
      new THREE.MeshBasicMaterial({ color: 0xff5a20, transparent: true, opacity: 0.85, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.beam.visible = false;
    this.beam.userData.noDebris = true;
    this.ring = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.1, 6, 64),
      new THREE.MeshBasicMaterial({ color: 0xff7a30, transparent: true, opacity: 0.9, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.ring.rotation.x = Math.PI / 2;
    this.ring.visible = false;
    this.ring.userData.noDebris = true;
    this.sceneExtras.push(this.beam, this.ring, this.missileRoot);
    this.refreshHitboxes();
  }

  get fraction(): number {
    return Math.max(0, this.health / BOSS_MAX_HEALTH);
  }

  override extraTargets(): readonly Hittable[] {
    return this.missiles.filter((m) => m.alive);
  }

  override dispose(): void {
    for (const e of this.sceneExtras) e.visible = false;
    for (const m of this.missiles) m.mesh.removeFromParent();
    this.missiles.length = 0;
    this.missileRoot.visible = false;
  }

  override onHit(hit: HitInfo): void {
    // Atordoado, o chefe não toma dano; blindado (fases 1 e 2), o corpo toma menos.
    if (this.move === 'stagger') return;
    super.onHit(this.phase < 3 && hit.kind === 'body' ? { ...hit, damage: hit.damage * ARMOR } : hit);
  }

  /** Caixas de acerto: o núcleo do peito só existe com a blindagem aberta (fase 3). */
  private refreshHitboxes(): void {
    const boxes: Hitbox[] = [
      { part: 'head', x: 0, y: 6.15, z: 0.1, r: 0.7 },
      { part: 'body', x: 0, y: 4.4, z: 0, r: 1.7 },
      { part: 'body', x: 0, y: 3.0, z: 0, r: 1.4 },
      { part: 'body', x: -1, y: 1.4, z: 0, r: 1.0 },
      { part: 'body', x: 1, y: 1.4, z: 0, r: 1.0 },
    ];
    if (this.phase >= 3) boxes.push({ part: 'head', x: 0, y: 4.5, z: 1.0, r: 0.65 });
    this.hitboxes = boxes;
  }

  protected behave(f: EnemyFrame): void {
    const dt = f.dt;
    this.moveTime += dt;
    this.cooldown -= dt;
    this.beamHitCd -= dt;
    this.activated ||= this.mem.mode !== 'patrol' || this.distanceToPlayer(f) < 34;
    this.updateMissiles(f);
    this.updateRing(f);
    this.checkPhase();
    this.armorOpen += ((this.phase >= 3 ? 1 : 0) - this.armorOpen) * Math.min(1, dt * 2);
    this.plates[0]?.position.setX(-0.68 - this.armorOpen * 1.0);
    this.plates[1]?.position.setX(0.68 + this.armorOpen * 1.0);
    this.coreMat.emissiveIntensity = 2.5 + this.armorOpen * 3 + Math.sin(f.time * 6) * 0.6 * this.armorOpen;
    if (!this.activated) {
      this.animate(dt, false);
      return;
    }
    if (this.move === 'stagger') {
      this.stopMoving();
      this.body.rotation.z = Math.sin(this.moveTime * 18) * 0.03;
      if (this.moveTime > STAGGER_TIME) this.setMove('walk');
      this.animate(dt, false);
      return;
    }
    this.body.rotation.z = 0;
    let walking = false;
    switch (this.move) {
      case 'walk':
        walking = this.doWalk(f);
        break;
      case 'burst':
        this.doBurst(f);
        break;
      case 'missiles':
        this.doMissiles(f);
        break;
      case 'beam':
        this.doBeam(f);
        break;
      case 'stomp':
        this.doStomp(f);
        break;
    }
    this.animate(dt, walking);
  }

  private setMove(m: Move): void {
    this.move = m;
    this.moveTime = 0;
    this.shots = 0;
  }

  private checkPhase(): void {
    const fr = this.fraction;
    const next = fr > PHASE_1_END ? 1 : fr > PHASE_2_END ? 2 : 3;
    if (next <= this.phase) return;
    this.phase = next;
    this.refreshHitboxes();
    this.setMove('stagger');
    this.cooldown = 1.5;
    for (const l of this.lasers) l.visible = false;
    this.beam.visible = false;
    this.services.sfx.roar(this.x, this.y + 4, this.z);
    this.services.shake(0.9);
    if (next === 2 && !this.spawnedAdds) {
      this.spawnedAdds = true;
      this.services.spawnDrone(this.x - 4, this.z + 5);
      this.services.spawnDrone(this.x + 4, this.z + 5);
    }
    this.onPhaseChange(next);
  }

  private doWalk(f: EnemyFrame): boolean {
    const dist = this.distanceToPlayer(f);
    this.faceTowards(f.player.x, f.player.z, 1.1, f.dt);
    let walking = false;
    if (dist > 17) walking = !this.navigate(f, f.player.x, f.player.z, WALK, 2);
    else if (dist < 9) {
      // Muito perto: recua em vez de esmagar o jogador.
      this.nudge(f.world, (this.x - f.player.x) / dist * 1.5 * f.dt, (this.z - f.player.z) / dist * 1.5 * f.dt);
      walking = true;
    } else this.stopMoving();
    if (this.cooldown <= 0 && this.sees) this.pickAttack();
    return walking;
  }

  private pickAttack(): void {
    const r = Math.random();
    if (this.phase === 1) this.setMove('burst');
    else if (this.phase === 2) this.setMove(r < 0.5 ? 'burst' : 'missiles');
    else this.setMove(r < 0.3 ? 'burst' : r < 0.65 ? 'beam' : 'stomp');
    if (this.move === 'beam') {
      this.beamHeight = Math.random() < 0.5 ? 'low' : 'high';
    }
  }

  private muzzleWorld(i: number, out: THREE.Vector3): THREE.Vector3 {
    this.group.updateMatrixWorld(true);
    return (this.muzzles[i] ?? this.muzzles[0])?.getWorldPosition(out) ?? out.set(this.x, 4, this.z);
  }

  private doBurst(f: EnemyFrame): void {
    this.faceTowards(f.player.x, f.player.z, 1.6, f.dt);
    const telegraph = 0.9;
    if (this.moveTime < telegraph) {
      this.aim.set(f.player.x, f.player.eyeY - 0.4, f.player.z);
      for (let i = 0; i < 2; i++) this.drawLaser(this.lasers[i], this.muzzleWorld(i, this.tmp), this.aim, 0.3 + Math.sin(f.time * 50) * 0.25);
      return;
    }
    for (const l of this.lasers) l.visible = false;
    const gap = 0.075;
    const total = this.phase === 1 ? 14 : 18;
    while (this.shots < total && this.moveTime - telegraph > this.shots * gap) {
      this.muzzleWorld(this.shots % 2, this.tmp);
      const p = f.player;
      const sweep = Math.sin(this.shots * 0.55) * 1.4;
      this.aim.set(p.x + p.vx * 0.2 + sweep, p.eyeY - 0.5 + (Math.random() - 0.5) * 0.9, p.z + p.vz * 0.2 + Math.cos(this.shots * 0.55) * 0.6);
      const vel = this.aim.sub(this.tmp).normalize().multiplyScalar(BOLT_SPEED);
      this.services.projectiles.fire(this.tmp, vel, BOLT_DAMAGE, BOLT_COLOR, 0.1);
      this.services.sfx.bolt(this.tmp.x, this.tmp.y, this.tmp.z);
      this.shots++;
    }
    if (this.shots >= total) {
      this.setMove('walk');
      this.cooldown = this.phase === 1 ? 2.4 : 1.8;
    }
  }

  private drawLaser(mesh: THREE.Mesh | undefined, from: THREE.Vector3, to: THREE.Vector3, opacity: number): void {
    if (!mesh) return;
    mesh.visible = true;
    mesh.position.copy(from).lerp(to, 0.5);
    mesh.scale.set(1, from.distanceTo(to), 1);
    mesh.quaternion.setFromUnitVectors(UP, this.tmp2.copy(to).sub(from).normalize());
    (mesh.material as THREE.MeshBasicMaterial).opacity = opacity;
  }

  private readonly tmp2 = new THREE.Vector3();

  private doMissiles(f: EnemyFrame): void {
    this.faceTowards(f.player.x, f.player.z, 1.2, f.dt);
    if (this.moveTime > 0.6 && this.shots === 0) {
      for (let i = 0; i < 3; i++) {
        this.muzzleWorld(i % 2, this.tmp);
        this.tmp.y += 1.4;
        const dir = new THREE.Vector3(Math.sin(this.yaw) + (i - 1) * 0.5, 1.2, Math.cos(this.yaw));
        const m = new Missile(this.tmp, dir);
        m.onExplode = (x, y, z, byPlayer) => this.onMissileExplode(x, y, z, byPlayer);
        this.missiles.push(m);
        this.missileRoot.add(m.mesh);
        this.services.sfx.whoosh(this.tmp.x, this.tmp.y, this.tmp.z);
      }
      this.shots = 1;
    }
    if (this.moveTime > 1.4) {
      this.setMove('walk');
      this.cooldown = 3.2;
    }
  }

  private onMissileExplode(x: number, y: number, z: number, byPlayer: boolean): void {
    this.services.sfx.explode(x, y, z, byPlayer ? 0.5 : 0.7);
    this.services.sparks.emit({ count: 26, x, y, z, nx: 0, ny: 1, nz: 0, speed: 6, spread: 2, color: BOLT_COLOR, size: 0.09, life: 0.5, gravity: 7, drag: 1 });
    this.services.smoke.emit({ count: 6, x, y, z, nx: 0, ny: 1, nz: 0, speed: 1.5, spread: 1.5, color: SMOKE, size: 0.5, life: 1, gravity: -0.5, drag: 1.5, grow: 3 });
  }

  private updateMissiles(f: EnemyFrame): void {
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      if (!m) continue;
      const dmg = m.update(f.dt, f.world, f.player, this.scratch);
      if (dmg > 0) {
        f.damagePlayer(dmg, m.pos.x, m.pos.z, 0, 0);
        this.services.shake(0.35);
      }
      if (m.alive) {
        this.services.smoke.emit({ count: 1, x: m.pos.x, y: m.pos.y, z: m.pos.z, nx: 0, ny: 0.1, nz: 0, speed: 0.2, spread: 0.3, color: SMOKE, size: 0.18, life: 0.7, gravity: -0.2, drag: 1, grow: 2 });
      } else {
        m.mesh.removeFromParent();
        this.missiles.splice(i, 1);
      }
    }
  }

  private doBeam(f: EnemyFrame): void {
    this.faceTowards(f.player.x, f.player.z, 0.6, f.dt);
    const telegraph = 1.1;
    const y = this.beamHeight === 'low' ? 0.35 : 1.75;
    const toPlayer = Math.atan2(f.player.x - this.x, f.player.z - this.z);
    if (this.moveTime < telegraph) {
      // Aviso: o feixe aparece apagado, na altura e no ponto de partida da varredura.
      this.beamFrom = toPlayer + (this.shots === 0 ? 1.25 * (Math.random() < 0.5 ? 1 : -1) : 0);
      this.shots = 1;
      this.beamAngle = this.beamFrom;
      this.placeBeam(y, 0.25 + Math.sin(f.time * 40) * 0.15);
      return;
    }
    const t = (this.moveTime - telegraph) / BEAM_SWEEP_TIME;
    if (t >= 1) {
      this.beam.visible = false;
      this.setMove('walk');
      this.cooldown = 2;
      return;
    }
    this.beamAngle = this.beamFrom - Math.sign(this.beamFrom - toPlayer || 1) * 2.5 * t;
    this.placeBeam(y, 0.9);
    this.hitByBeam(f, y);
  }

  private placeBeam(y: number, opacity: number): void {
    this.beam.visible = true;
    this.beam.position.set(this.x + Math.sin(this.beamAngle) * BEAM_RANGE * 0.5, y, this.z + Math.cos(this.beamAngle) * BEAM_RANGE * 0.5);
    this.beam.rotation.y = this.beamAngle;
    this.beam.scale.set(1, 1, BEAM_RANGE);
    (this.beam.material as THREE.MeshBasicMaterial).opacity = opacity;
  }

  /** Feixe baixo: se pula. Feixe alto: se agacha. Pilares e caixas bloqueiam a linha. */
  private hitByBeam(f: EnemyFrame, y: number): void {
    const p = f.player;
    const dx = p.x - this.x;
    const dz = p.z - this.z;
    const dist = Math.hypot(dx, dz);
    if (this.beamHitCd > 0 || dist > BEAM_RANGE || Math.abs(angleDiff(Math.atan2(dx, dz), this.beamAngle)) * dist > BEAM_WIDTH * 0.8) return;
    const head = p.feetY + (p.crouched ? 1.1 : 1.75);
    const hits = this.beamHeight === 'low' ? p.feetY < 0.7 : head > 1.3;
    if (!hits || !f.world.lineOfSight(this.x, y, this.z, p.x, y, p.z, this.beamRay)) return;
    this.beamHitCd = 0.45;
    f.damagePlayer(BEAM_DAMAGE, this.x, this.z, 0, 0);
  }

  private doStomp(f: EnemyFrame): void {
    this.faceTowards(f.player.x, f.player.z, 1, f.dt);
    if (this.moveTime < 0.9) {
      this.body.position.y = Math.sin(this.moveTime * 3.5) * 0.25;
      return;
    }
    this.body.position.y = 0;
    if (this.shots === 0) {
      this.shots = 1;
      this.ringRadius = 1.5;
      this.ringHit = false;
      this.ringActive = true;
      this.services.sfx.stomp(this.x, 0, this.z, 3);
      this.services.shake(0.7);
    }
    if (this.moveTime > 1.2 && !this.ringActive) {
      this.setMove('walk');
      this.cooldown = 2.4;
    }
  }

  private updateRing(f: EnemyFrame): void {
    if (!this.ringActive) {
      this.ring.visible = false;
      return;
    }
    this.ringRadius += RING_SPEED * f.dt;
    this.ring.visible = true;
    this.ring.position.set(this.x, 0.12, this.z);
    this.ring.scale.set(this.ringRadius, this.ringRadius, 1);
    (this.ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - this.ringRadius / RING_MAX);
    const p = f.player;
    const d = Math.hypot(p.x - this.x, p.z - this.z);
    if (!this.ringHit && Math.abs(d - this.ringRadius) < 0.9 && p.feetY < 0.4) {
      this.ringHit = true;
      f.damagePlayer(RING_DAMAGE, this.x, this.z, ((p.x - this.x) / Math.max(d, 1e-3)) * 5, ((p.z - this.z) / Math.max(d, 1e-3)) * 5);
    }
    if (this.ringRadius > RING_MAX) this.ringActive = false;
  }

  private animate(dt: number, walking: boolean): void {
    if (walking) {
      this.legSwing += dt * 2.4;
      const side = Math.floor(this.legSwing / Math.PI);
      if (side !== this.lastStep) {
        this.lastStep = side;
        this.services.sfx.stomp(this.x, 0, this.z, 2.2);
        this.services.shake(0.12);
      }
    }
    const sw = walking ? Math.sin(this.legSwing) * 0.4 : 0;
    this.legs[0]?.rotation.set(sw, 0, 0);
    this.legs[1]?.rotation.set(-sw, 0, 0);
    if (this.move !== 'stomp') this.body.position.y = walking ? Math.abs(Math.sin(this.legSwing)) * 0.12 : 0;
    this.torso.rotation.y = walking ? Math.sin(this.legSwing) * 0.06 : 0;
  }
}

const UP = new THREE.Vector3(0, 1, 0);
const SMOKE = new THREE.Color(0.3, 0.3, 0.32);
