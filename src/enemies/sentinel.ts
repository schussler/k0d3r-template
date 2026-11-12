import * as THREE from 'three';
import type { GameContext } from '../game/context';
import { findCover, findPeek } from '../logic/ai';
import type { Cell } from '../logic/level';
import { Enemy, type HitInfo } from './enemy';
import { ROBOT, anchor, geo, part } from './parts';

type SentinelMode = 'advance' | 'aim' | 'burst' | 'cover' | 'hide' | 'peek';

const SPEED = 3.8;
const MIN_RANGE = 8;
const MAX_RANGE = 26;
const AIM_TIME = 0.6;
const SHOTS = 3;
const SHOT_GAP = 0.13;
const SHOT_SPEED = 36;
const SHOT_DAMAGE = 7;
/** Dano acumulado que manda a sentinela procurar cobertura. */
const COVER_DAMAGE = 25;

/** Sentinela: atira de longe em rajadas com aviso (laser de mira) e se esconde atrás de cobertura. */
export class Sentinel extends Enemy {
  readonly kind = 'sentinel' as const;
  readonly fly = false;
  private mode: SentinelMode = 'advance';
  private modeTime = 0;
  private shotsLeft = 0;
  private burstsSinceCover = 0;
  private damageSinceCover = 0;
  private cover: Cell | null = null;
  private peek: Cell | null = null;
  private hideTime = 1.5;
  private readonly laser: THREE.Mesh;
  private readonly head: THREE.Object3D;
  private readonly gun: THREE.Object3D;
  private readonly legs: THREE.Object3D[] = [];
  private walk = 0;

  constructor() {
    super(70);
    this.radius = 0.45;
    this.eyeHeight = 1.85;
    const shell = this.own(ROBOT.shell);
    const dark = this.own(ROBOT.dark);
    const red = this.own(ROBOT.red);
    const eye = this.own(ROBOT.eyeRed);
    for (const side of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(side * 0.2, 0.9, 0);
      leg.add(part(geo('sen-thigh', () => new THREE.BoxGeometry(0.16, 0.5, 0.18)), dark, 0, -0.25, 0));
      leg.add(part(geo('sen-shin', () => new THREE.BoxGeometry(0.13, 0.45, 0.14)), shell, 0, -0.68, 0.04));
      leg.add(part(geo('sen-foot', () => new THREE.BoxGeometry(0.18, 0.08, 0.32)), dark, 0, -0.88, 0.06));
      this.body.add(leg);
      this.legs.push(leg);
    }
    this.body.add(part(geo('sen-hip', () => new THREE.BoxGeometry(0.5, 0.18, 0.3)), dark, 0, 0.98, 0));
    this.body.add(part(geo('sen-torso', () => new THREE.BoxGeometry(0.62, 0.62, 0.38)), shell, 0, 1.35, 0));
    this.body.add(part(geo('sen-chest', () => new THREE.BoxGeometry(0.4, 0.2, 0.05)), red, 0, 1.45, 0.2));
    this.head = new THREE.Group();
    this.head.position.set(0, 1.85, 0);
    this.head.add(part(geo('sen-head', () => new THREE.CylinderGeometry(0.17, 0.2, 0.28, 10)), shell));
    this.head.add(part(geo('sen-lens', () => new THREE.SphereGeometry(0.09, 10, 8)), eye, 0, 0, 0.17));
    this.head.add(part(geo('sen-antenna', () => new THREE.BoxGeometry(0.02, 0.25, 0.02)), dark, 0.1, 0.22, -0.05));
    this.body.add(this.head);
    this.gun = new THREE.Group();
    this.gun.position.set(0.4, 1.4, 0.1);
    this.gun.add(part(geo('sen-arm', () => new THREE.BoxGeometry(0.14, 0.14, 0.5)), dark, 0, 0, 0.15));
    this.gun.add(part(geo('sen-barrel', () => new THREE.CylinderGeometry(0.04, 0.04, 0.4, 8).rotateX(Math.PI / 2)), red, 0, 0, 0.55));
    this.body.add(this.gun);
    this.body.add(part(geo('sen-arm-l', () => new THREE.BoxGeometry(0.12, 0.45, 0.14)), dark, -0.4, 1.25, 0));

    const laserGeo = geo('sen-laser', () => new THREE.BoxGeometry(0.015, 0.015, 1).translate(0, 0, 0.5));
    this.laser = new THREE.Mesh(laserGeo, new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.laser.visible = false;
    this.root.add(this.laser);

    this.zones.push({ zone: 'head', object: this.head, radius: 0.22 });
    this.zones.push({ zone: 'body', object: anchor(this.body, 0, 1.35, 0), radius: 0.4 });
    this.zones.push({ zone: 'body', object: anchor(this.body, 0, 0.6, 0), radius: 0.32 });
  }

  override takeHit(hit: HitInfo, ctx: GameContext): boolean {
    this.damageSinceCover += hit.result.damage;
    return super.takeHit(hit, ctx);
  }

  protected think(dt: number, ctx: GameContext): void {
    this.laser.visible = false;
    if (this.state !== 'combat') {
      const before = this.position.clone();
      this.wander(dt, ctx, SPEED * 0.6);
      this.animateWalk(dt, before);
      this.mode = 'advance';
      return;
    }
    this.modeTime += dt;
    const player = ctx.player;
    const dist = Math.hypot(player.position.x - this.position.x, player.position.z - this.position.z);
    const before = this.position.clone();

    if ((this.damageSinceCover >= COVER_DAMAGE || this.burstsSinceCover >= 2) && this.mode !== 'cover' && this.mode !== 'hide' && this.mode !== 'burst') {
      this.cover = findCover(ctx.grid, this.position, player.position, player.position.y + player.eyeHeight, ctx.ceiling);
      this.damageSinceCover = 0;
      this.burstsSinceCover = 0;
      if (this.cover) this.setMode('cover');
    }

    switch (this.mode) {
      case 'advance': {
        // modeTime negativo = pausa entre rajadas.
        if (this.modeTime >= 0 && this.seesPlayer && dist >= MIN_RANGE && dist <= MAX_RANGE) {
          this.setMode('aim');
          break;
        }
        const away = dist < MIN_RANGE;
        const target = away
          ? new THREE.Vector3(this.position.x * 2 - player.position.x, 0, this.position.z * 2 - player.position.z)
          : new THREE.Vector3(this.flankTarget?.x ?? player.position.x, 0, this.flankTarget?.z ?? player.position.z);
        this.moveTo(dt, ctx, target, SPEED, !away);
        if (away) this.faceTowards(dt, player.position.x, player.position.z, 6);
        break;
      }
      case 'aim':
        this.faceTowards(dt, player.position.x, player.position.z, 8);
        this.showLaser(ctx);
        if (this.modeTime < dt * 1.5) ctx.audio.laserCharge(this.position);
        if (!this.seesPlayer) this.setMode('advance');
        else if (this.modeTime >= AIM_TIME) {
          this.shotsLeft = SHOTS;
          this.setMode('burst');
        }
        break;
      case 'burst':
        this.faceTowards(dt, player.position.x, player.position.z, 8);
        if (this.modeTime >= SHOT_GAP) {
          this.modeTime = 0;
          this.fire(ctx);
          this.shotsLeft -= 1;
          if (this.shotsLeft <= 0) {
            this.burstsSinceCover += 1;
            this.setMode('advance');
            this.modeTime = -(1.2 + ctx.rng() * 1.2);
          }
        }
        break;
      case 'cover': {
        if (!this.cover) {
          this.setMode('advance');
          break;
        }
        const c = ctx.grid.cellCenter(this.cover);
        if (this.moveTo(dt, ctx, new THREE.Vector3(c.x, 0, c.z), SPEED * 1.3) < 0.5) {
          this.setMode('hide');
          this.hideTime = 1.5 + ctx.rng();
        }
        break;
      }
      case 'hide':
        this.faceTowards(dt, player.position.x, player.position.z, 4);
        if (this.modeTime > this.hideTime) {
          this.peek = this.cover ? findPeek(ctx.grid, this.cover, player.position, player.position.y + player.eyeHeight, ctx.ceiling) : null;
          this.setMode(this.peek ? 'peek' : 'advance');
        }
        break;
      case 'peek': {
        const p = this.peek ? ctx.grid.cellCenter(this.peek) : null;
        if (!p || this.moveTo(dt, ctx, new THREE.Vector3(p.x, 0, p.z), SPEED) < 0.5 || this.seesPlayer) this.setMode(this.seesPlayer ? 'aim' : 'advance');
        break;
      }
    }
    if (this.mode === 'advance' && this.modeTime < 0) this.faceTowards(dt, player.position.x, player.position.z, 6);
    this.animateWalk(dt, before);
  }

  private setMode(m: SentinelMode): void {
    this.mode = m;
    this.modeTime = 0;
  }

  private muzzle(): THREE.Vector3 {
    return new THREE.Vector3(0.4, 1.4, 0.75).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw).add(this.position);
  }

  private aimPoint(ctx: GameContext): THREE.Vector3 {
    const p = ctx.player;
    return new THREE.Vector3(p.position.x, p.position.y + p.height * 0.65, p.position.z);
  }

  private showLaser(ctx: GameContext): void {
    const from = this.muzzle();
    const to = this.aimPoint(ctx);
    const local = from.clone().sub(this.position);
    this.laser.position.copy(local.applyAxisAngle(new THREE.Vector3(0, 1, 0), -this.yaw));
    this.laser.lookAt(to);
    this.laser.scale.z = from.distanceTo(to);
    this.laser.visible = Math.floor(this.modeTime * 20) % 2 === 0 || this.modeTime > AIM_TIME * 0.6;
  }

  private fire(ctx: GameContext): void {
    const from = this.muzzle();
    const dir = this.aimPoint(ctx).sub(from).normalize();
    const spread = 0.025;
    dir.x += (ctx.rng() - 0.5) * spread * 2;
    dir.y += (ctx.rng() - 0.5) * spread;
    dir.z += (ctx.rng() - 0.5) * spread * 2;
    dir.normalize();
    ctx.spawnProjectile({ from, velocity: dir.multiplyScalar(SHOT_SPEED), damage: SHOT_DAMAGE, radius: 0.12, color: 0xff5030, size: 0.5, life: 2 });
    ctx.audio.enemyShot(from);
    ctx.fx.glow(from, new THREE.Color(0xff6030), 0.7, 0.06);
    this.gun.position.z = 0.02;
  }

  private animateWalk(dt: number, before: THREE.Vector3): void {
    const speed = Math.hypot(this.position.x - before.x, this.position.z - before.z) / Math.max(dt, 1e-4);
    this.walk += speed * dt * 2.2;
    const swing = Math.min(1, speed / SPEED) * 0.6;
    this.legs[0]!.rotation.x = Math.sin(this.walk) * swing;
    this.legs[1]!.rotation.x = -Math.sin(this.walk) * swing;
    this.gun.position.z += (0.1 - this.gun.position.z) * Math.min(1, dt * 10);
  }
}
