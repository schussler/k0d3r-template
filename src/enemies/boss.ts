import * as THREE from 'three';
import type { GameContext } from '../game/context';
import { raycastGrid } from '../logic/collision';
import { bossPhase, type BossPhase } from '../logic/combat';
import { CELL } from '../logic/level';
import { Enemy, type HitInfo } from './enemy';
import { ROBOT, anchor, geo, part } from './parts';

type Attack = 'idle' | 'fan' | 'laser' | 'stomp' | 'summon' | 'transition';

export const BOSS_HEALTH = 2600;
const ORB_SPEED = 11;
const ORB_DAMAGE = 12;
const LASER_HEIGHT = 1.35;
const LASER_DAMAGE = 25;
const LASER_SWEEP = 2.4;
const STOMP_DAMAGE = 20;
const SHOCK_SPEED = 11;
const SHOCK_MAX = 28;
const CORE_OPEN_TIME = 3.5;

const ATTACKS: Readonly<Record<BossPhase, readonly Attack[]>> = {
  1: ['fan', 'laser', 'fan', 'laser'],
  2: ['summon', 'stomp', 'fan', 'stomp', 'laser'],
  3: ['stomp', 'fan', 'laser', 'summon', 'fan', 'stomp'],
};

/**
 * Chefe do núcleo: robô gigante com 3 fases por vida. Fase 1: leque de projéteis lentos e laser na altura do
 * peito (agachar desvia). Fase 2: chama drones e dá pisão com onda de choque (pular desvia); o núcleo abre
 * depois do pisão. Fase 3: tudo mais rápido, núcleo sempre aberto.
 */
export class Boss extends Enemy {
  readonly kind = 'boss' as const;
  readonly fly = false;
  phase: BossPhase = 1;
  private attack: Attack = 'idle';
  private attackTime = 0;
  private attackIndex = 0;
  private idleTime = 2.5;
  private coreOpenTime = 0;
  private volleys = 0;
  private laserAngle = 0;
  private laserHitCooldown = 0;
  private shockRadius = -1;
  private shockHit = false;
  private readonly laser: THREE.Mesh;
  private readonly shock: THREE.Mesh;
  private readonly corePlates: THREE.Object3D[] = [];
  private readonly coreMat: THREE.MeshStandardMaterial;
  private readonly legs: THREE.Object3D[] = [];
  private readonly home = new THREE.Vector3();
  private walk = 0;

  constructor() {
    super(BOSS_HEALTH);
    this.radius = 1.6;
    this.eyeHeight = 5.6;
    this.sightRange = 80;
    this.fovCos = -1;
    const shell = this.own(ROBOT.shell);
    const dark = this.own(ROBOT.dark);
    const red = this.own(ROBOT.red);
    const eye = this.own(ROBOT.eyeRed);
    const weak = this.own(ROBOT.eyeOrange);
    this.coreMat = this.own(ROBOT.eyeCyan);
    for (const side of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(side * 1.3, 2.6, 0);
      leg.add(part(geo('boss-thigh', () => new THREE.BoxGeometry(0.9, 1.4, 1)), dark, 0, -0.6, 0));
      leg.add(part(geo('boss-shin', () => new THREE.BoxGeometry(1.1, 1.3, 1.3)), shell, 0, -1.8, 0.1));
      leg.add(part(geo('boss-foot', () => new THREE.BoxGeometry(1.4, 0.35, 2)), dark, 0, -2.45, 0.3));
      this.body.add(leg);
      this.legs.push(leg);
    }
    this.body.add(part(geo('boss-pelvis', () => new THREE.BoxGeometry(2.6, 0.8, 1.6)), dark, 0, 2.9, 0));
    this.body.add(part(geo('boss-torso', () => new THREE.BoxGeometry(3.6, 2.4, 2.2)), shell, 0, 4.5, 0));
    this.body.add(part(geo('boss-collar', () => new THREE.BoxGeometry(2.4, 0.5, 1.8)), red, 0, 5.8, 0));
    this.body.add(part(geo('boss-head', () => new THREE.BoxGeometry(1.3, 0.9, 1.2)), dark, 0, 6.4, 0.2));
    this.body.add(part(geo('boss-eye', () => new THREE.BoxGeometry(0.9, 0.18, 0.1)), eye, 0, 6.45, 0.82));
    this.body.add(part(geo('boss-core', () => new THREE.SphereGeometry(0.55, 16, 12)), this.coreMat, 0, 4.4, 1.0));
    for (const side of [-1, 1]) {
      const plate = new THREE.Group();
      plate.position.set(side * 0.35, 4.4, 1.12);
      plate.add(part(geo('boss-plate', () => new THREE.BoxGeometry(0.7, 1.3, 0.15)), red, side * 0.35, 0, 0));
      this.body.add(plate);
      this.corePlates.push(plate);
      const shoulder = part(geo('boss-shoulder', () => new THREE.BoxGeometry(1.2, 1.1, 1.3)), shell, side * 2.4, 5.4, 0);
      this.body.add(shoulder);
      this.body.add(part(geo('boss-weak', () => new THREE.SphereGeometry(0.42, 14, 10)), weak, side * 2.4, 6.05, 0.2));
      this.body.add(part(geo('boss-cannon', () => new THREE.CylinderGeometry(0.3, 0.35, 1.8, 10).rotateX(Math.PI / 2)), dark, side * 2.4, 4.6, 0.9));
      this.body.add(part(geo('boss-arm', () => new THREE.BoxGeometry(0.7, 2.2, 0.8)), dark, side * 2.3, 3.6, -0.1));
      this.zones.push({ zone: 'weak', object: anchor(this.body, side * 2.4, 6.05, 0.2), radius: 0.55 });
    }
    this.zones.push({ zone: 'core', object: anchor(this.body, 0, 4.4, 1.0), radius: 0.7 });
    this.zones.push({ zone: 'head', object: anchor(this.body, 0, 6.4, 0.2), radius: 0.8 });
    this.zones.push({ zone: 'body', object: anchor(this.body, 0, 4.5, 0), radius: 1.9 });
    this.zones.push({ zone: 'body', object: anchor(this.body, -1.3, 1.4, 0), radius: 0.9 });
    this.zones.push({ zone: 'body', object: anchor(this.body, 1.3, 1.4, 0), radius: 0.9 });

    this.laser = new THREE.Mesh(
      geo('boss-laser', () => new THREE.BoxGeometry(0.12, 0.12, 1).translate(0, 0, 0.5)),
      new THREE.MeshBasicMaterial({ color: 0xff3050, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.laser.visible = false;
    this.shock = new THREE.Mesh(
      geo('boss-shock', () => new THREE.RingGeometry(0.85, 1, 64).rotateX(-Math.PI / 2)),
      new THREE.MeshBasicMaterial({ color: 0x8fd0ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.shock.visible = false;
  }

  override placeAt(x: number, z: number, ctx: GameContext): void {
    super.placeAt(x, z, ctx);
    this.home.set(x, 0, z);
    this.yaw = Math.PI;
    ctx.scene.add(this.laser, this.shock);
  }

  get coreOpen(): boolean {
    return this.phase === 3 || this.coreOpenTime > 0;
  }

  override takeHit(hit: HitInfo, ctx: GameContext): boolean {
    const killed = super.takeHit(hit, ctx);
    const next = bossPhase(Math.max(0, this.health) / this.maxHealth);
    if (!killed && next !== this.phase) {
      this.phase = next;
      this.startAttack('transition');
      ctx.audio.roar(this.position, true);
      ctx.player.shake(0.35);
    }
    return killed;
  }

  protected override knockback(): number {
    return 0;
  }

  protected think(dt: number, ctx: GameContext): void {
    this.state = 'combat';
    this.attackTime += dt;
    this.coreOpenTime = Math.max(0, this.coreOpenTime - dt);
    this.laserHitCooldown -= dt;
    const p = ctx.player.position;
    const speedUp = this.phase === 3 ? 1.45 : 1;
    this.faceTowards(dt, p.x, p.z, this.attack === 'laser' ? 0 : 0.9);
    this.updateCorePlates(dt);
    this.updateShock(dt, ctx);

    switch (this.attack) {
      case 'idle':
        this.stroll(dt, ctx);
        if (this.attackTime >= this.idleTime / speedUp) {
          const list = ATTACKS[this.phase];
          let next = list[this.attackIndex % list.length]!;
          this.attackIndex += 1;
          if (next === 'summon' && ctx.countAlive('drone') >= 3) next = 'fan';
          this.startAttack(next);
        }
        break;
      case 'fan':
        if (this.attackTime >= 0.55 / speedUp) {
          this.attackTime = 0;
          this.fireFan(ctx);
          this.volleys += 1;
          if (this.volleys >= (this.phase === 3 ? 4 : 3)) this.endAttack(1.6);
        }
        break;
      case 'laser':
        this.updateLaser(dt * speedUp, ctx);
        break;
      case 'stomp':
        this.legs[0]!.rotation.x = -Math.min(1, this.attackTime / 0.8) * 0.9;
        this.body.position.y = Math.min(1, this.attackTime / 0.8) * 0.4;
        if (this.attackTime >= 0.8 / speedUp && this.shockRadius < 0) {
          this.legs[0]!.rotation.x = 0;
          this.body.position.y = 0;
          this.shockRadius = 1;
          this.shockHit = false;
          this.coreOpenTime = CORE_OPEN_TIME;
          ctx.audio.stomp(this.position);
          ctx.player.shake(0.5);
          ctx.fx.sparkBurst(this.position.clone().setY(0.2), new THREE.Vector3(0, 1, 0), 60, new THREE.Color(0x9fd8ff), 9, 1.4);
        }
        if (this.attackTime > 1.6) this.endAttack(1.8);
        break;
      case 'summon':
        this.body.rotation.y = Math.sin(this.attackTime * 8) * 0.05;
        if (this.attackTime >= 1) {
          this.body.rotation.y = 0;
          for (const side of [-1, 1]) {
            const off = new THREE.Vector3(side * 4, 0, 1.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
            ctx.spawnEnemy('drone', this.position.x + off.x, this.position.z + off.z);
          }
          ctx.audio.roar(this.position, false);
          this.endAttack(1.5);
        }
        break;
      case 'transition':
        this.body.rotation.z = Math.sin(this.attackTime * 30) * 0.03;
        if (Math.floor(this.attackTime * 10) !== Math.floor((this.attackTime - dt) * 10)) {
          const at = this.position.clone().add(new THREE.Vector3((ctx.rng() - 0.5) * 3, 3 + ctx.rng() * 3, (ctx.rng() - 0.5) * 2));
          ctx.fx.sparkBurst(at, new THREE.Vector3(0, 1, 0), 12, new THREE.Color(0xffc070), 6);
          ctx.fx.glow(at, new THREE.Color(0xcfd8e0), 2.5, 0.4);
        }
        if (this.attackTime >= 2) {
          this.body.rotation.z = 0;
          this.endAttack(0.5);
        }
        break;
    }
  }

  private startAttack(a: Attack): void {
    this.attack = a;
    this.attackTime = 0;
    this.volleys = 0;
    this.laser.visible = false;
    if (a === 'laser') this.laserAngle = -1;
  }

  private endAttack(idle: number): void {
    this.attack = 'idle';
    this.attackTime = 0;
    this.idleTime = idle;
    this.laser.visible = false;
  }

  /** Anda devagar, sem sair do centro da arena, para manter distância média da jogadora. */
  private stroll(dt: number, ctx: GameContext): void {
    const p = ctx.player.position;
    const toPlayer = new THREE.Vector3(p.x - this.home.x, 0, p.z - this.home.z);
    const target = this.home.clone().addScaledVector(toPlayer.normalize(), 3);
    const before = this.position.clone();
    if (this.position.distanceTo(target) > 0.5) this.moveTo(dt, ctx, target, 1.4, false);
    const moved = this.position.distanceTo(before);
    this.walk += moved * 1.5;
    this.legs[0]!.rotation.x = Math.sin(this.walk) * 0.3;
    this.legs[1]!.rotation.x = -Math.sin(this.walk) * 0.3;
  }

  private fireFan(ctx: GameContext): void {
    const p = ctx.player;
    const count = this.phase === 1 ? 7 : 9;
    const spreadAngle = 0.9;
    for (const side of [-1, 1]) {
      const from = new THREE.Vector3(side * 2.4, 4.6, 1.8).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw).add(this.position);
      const aim = new THREE.Vector3(p.position.x, p.position.y + 1, p.position.z).sub(from);
      const base = Math.atan2(aim.x, aim.z);
      const pitch = Math.atan2(aim.y, Math.hypot(aim.x, aim.z));
      for (let n = 0; n < count; n++) {
        if ((n + this.volleys + (side > 0 ? 1 : 0)) % 2 === 1) continue;
        const a = base + (n / (count - 1) - 0.5) * spreadAngle;
        const dir = new THREE.Vector3(Math.sin(a) * Math.cos(pitch), Math.sin(pitch), Math.cos(a) * Math.cos(pitch));
        ctx.spawnProjectile({ from, velocity: dir.multiplyScalar(ORB_SPEED), damage: ORB_DAMAGE, radius: 0.35, color: 0xff8a2a, size: 1.6, life: 5 });
      }
      ctx.fx.glow(from, new THREE.Color(0xff9a40), 2.4, 0.15);
    }
    ctx.audio.enemyShot(this.position, true);
  }

  private updateLaser(dt: number, ctx: GameContext): void {
    const charge = 0.8;
    if (this.attackTime < charge) {
      if (this.attackTime < dt * 1.5) ctx.audio.laserCharge(this.position);
      this.coreMat.emissive.setHex(0xff3050);
      return;
    }
    if (!this.laser.visible) {
      this.laser.visible = true;
      ctx.audio.laserBeam(this.position, LASER_SWEEP);
    }
    const t = (this.attackTime - charge) / LASER_SWEEP;
    this.laserAngle = -1.2 + t * 2.4;
    const angle = this.yaw + this.laserAngle;
    const dir = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
    const origin = this.position.clone().setY(LASER_HEIGHT).addScaledVector(dir, 1.8);
    const hit = raycastGrid(ctx.grid, origin.x, origin.y, origin.z, dir.x, 0, dir.z, 60, ctx.ceiling, 'bullet');
    const len = hit ? hit.t : 60;
    this.laser.position.copy(origin);
    this.laser.lookAt(origin.clone().add(dir));
    this.laser.scale.set(1 + Math.sin(ctx.time * 60) * 0.3, 1, len);
    if (hit && Math.floor(ctx.time * 30) % 2 === 0) ctx.fx.sparkBurst(new THREE.Vector3(hit.x, hit.y, hit.z), new THREE.Vector3(hit.nx, 0.5, hit.nz), 3, new THREE.Color(0xff4060), 5);

    const p = ctx.player;
    const rel = new THREE.Vector3(p.position.x - origin.x, 0, p.position.z - origin.z);
    const along = rel.dot(dir);
    const across = Math.abs(rel.x * dir.z - rel.z * dir.x);
    const playerTop = p.position.y + p.height;
    const bodyCrossesBeam = p.position.y < LASER_HEIGHT && playerTop > LASER_HEIGHT + 0.1;
    if (this.laserHitCooldown <= 0 && along > 0 && along < len && across < 0.55 && bodyCrossesBeam) {
      this.laserHitCooldown = 0.7;
      ctx.damagePlayer(LASER_DAMAGE, origin);
    }
    if (t >= 1) {
      this.coreMat.emissive.setHex(0x3ff0ff);
      this.endAttack(1.4);
    }
  }

  private updateShock(dt: number, ctx: GameContext): void {
    if (this.shockRadius < 0) {
      this.shock.visible = false;
      return;
    }
    this.shockRadius += SHOCK_SPEED * dt;
    this.shock.visible = true;
    this.shock.position.set(this.position.x, 0.15, this.position.z);
    this.shock.scale.setScalar(this.shockRadius);
    (this.shock.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - this.shockRadius / SHOCK_MAX);
    const p = ctx.player.position;
    const d = Math.hypot(p.x - this.position.x, p.z - this.position.z);
    if (!this.shockHit && Math.abs(d - this.shockRadius) < 0.8 && p.y < 0.45) {
      this.shockHit = true;
      ctx.damagePlayer(STOMP_DAMAGE, this.position);
      ctx.pushPlayer(new THREE.Vector3(p.x - this.position.x, 0, p.z - this.position.z).normalize().multiplyScalar(6).setY(4));
    }
    if (this.shockRadius > SHOCK_MAX) this.shockRadius = -1;
  }

  private updateCorePlates(dt: number): void {
    const open = this.coreOpen ? 1 : 0;
    this.corePlates.forEach((plate, n) => {
      const side = n === 0 ? -1 : 1;
      plate.position.x += (side * (0.35 + open * 0.55) - plate.position.x) * Math.min(1, dt * 6);
    });
  }

  override explode(ctx: GameContext, dir: THREE.Vector3, force = 1): void {
    this.laser.removeFromParent();
    this.shock.removeFromParent();
    super.explode(ctx, dir, force);
  }

  override dispose(): void {
    this.laser.removeFromParent();
    this.shock.removeFromParent();
    super.dispose();
  }
}

/** Raio da arena do núcleo em metros (para posicionar o chefe e as vagas). */
export const ARENA_RADIUS = 11 * CELL;
