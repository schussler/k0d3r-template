import * as THREE from 'three';
import type { GameContext } from '../game/context';
import { hasLineOfSight } from '../logic/collision';
import { Enemy, type HitInfo } from './enemy';
import { ROBOT, anchor, geo, part } from './parts';

type BruteMode = 'chase' | 'windup' | 'punch' | 'roar' | 'charge' | 'stagger';

const SPEED = 2.3;
/** Giro lento: é o que permite flanquear e acertar as costas. */
const TURN_RATE = 1.7;
const PUNCH_RANGE = 3.1;
const PUNCH_DAMAGE = 30;
const WINDUP = 0.55;
const CHARGE_SPEED = 9;
const CHARGE_TIME = 1.5;
const CHARGE_DAMAGE = 35;
const ROAR_TIME = 0.75;

/** Brutamontes: lento, escudo frontal (só cai pelas costas ou com a escopeta), soco e investida. */
export class Brute extends Enemy {
  readonly kind = 'brute' as const;
  readonly fly = false;
  private mode: BruteMode = 'chase';
  private modeTime = 0;
  private chargeCooldown = 3;
  private readonly chargeDir = new THREE.Vector3();
  private hitThisAttack = false;
  private stepTimer = 0;
  private readonly arms: THREE.Object3D[] = [];
  private readonly legs: THREE.Object3D[] = [];
  private readonly shield: THREE.Mesh;
  private walk = 0;

  constructor() {
    super(260);
    this.radius = 0.75;
    this.eyeHeight = 2.3;
    this.sightRange = 30;
    const shell = this.own(ROBOT.hazard);
    const dark = this.own(ROBOT.dark);
    const eye = this.own(ROBOT.eyeOrange);
    const core = this.own(ROBOT.eyeCyan);
    for (const side of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(side * 0.42, 1.1, 0);
      leg.add(part(geo('bru-thigh', () => new THREE.BoxGeometry(0.36, 0.6, 0.4)), dark, 0, -0.3, 0));
      leg.add(part(geo('bru-shin', () => new THREE.BoxGeometry(0.42, 0.55, 0.46)), shell, 0, -0.82, 0.04));
      this.body.add(leg);
      this.legs.push(leg);
    }
    this.body.add(part(geo('bru-torso', () => new THREE.BoxGeometry(1.4, 1.05, 0.9)), shell, 0, 1.7, 0));
    this.body.add(part(geo('bru-belly', () => new THREE.BoxGeometry(1.0, 0.4, 0.7)), dark, 0, 1.1, 0));
    this.body.add(part(geo('bru-head', () => new THREE.BoxGeometry(0.55, 0.4, 0.5)), dark, 0, 2.38, 0.1));
    this.body.add(part(geo('bru-visor', () => new THREE.BoxGeometry(0.4, 0.08, 0.05)), eye, 0, 2.4, 0.36));
    // Núcleo exposto nas costas: o ponto fraco que o desenho mostra.
    this.body.add(part(geo('bru-core', () => new THREE.CylinderGeometry(0.28, 0.28, 0.12, 14).rotateX(Math.PI / 2)), core, 0, 1.75, -0.48));
    this.body.add(part(geo('bru-vent', () => new THREE.BoxGeometry(0.9, 0.5, 0.2)), dark, 0, 2.1, -0.5));
    for (const side of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(side * 0.9, 2.05, 0);
      arm.add(part(geo('bru-shoulder', () => new THREE.BoxGeometry(0.45, 0.45, 0.5)), shell, 0, 0, 0));
      arm.add(part(geo('bru-forearm', () => new THREE.BoxGeometry(0.4, 0.95, 0.42)), dark, 0, -0.65, 0.05));
      arm.add(part(geo('bru-fist', () => new THREE.BoxGeometry(0.5, 0.4, 0.5)), shell, 0, -1.25, 0.08));
      this.body.add(arm);
      this.arms.push(arm);
    }
    this.shield = new THREE.Mesh(geo('bru-shield', () => new THREE.SphereGeometry(1.5, 24, 12, -Math.PI * 0.39, Math.PI * 0.78, Math.PI * 0.2, Math.PI * 0.55)), ROBOT.shield.clone());
    this.shield.position.set(0, 1.5, 0.1);
    this.root.add(this.shield);

    this.zones.push({ zone: 'head', object: anchor(this.body, 0, 2.38, 0.1), radius: 0.32 });
    this.zones.push({ zone: 'body', object: anchor(this.body, 0, 1.6, 0), radius: 0.8 });
    this.zones.push({ zone: 'body', object: anchor(this.body, 0, 0.6, 0), radius: 0.55 });
  }

  override takeHit(hit: HitInfo, ctx: GameContext): boolean {
    if (hit.result.blocked) {
      const mat = this.shield.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.9;
    } else if (hit.weapon === 'shotgun' && (this.mode === 'windup' || this.mode === 'chase')) {
      this.setMode('stagger');
      this.modeTime = 0.9;
    }
    return super.takeHit(hit, ctx);
  }

  override explode(ctx: GameContext, dir: THREE.Vector3, force = 1): void {
    (this.shield.material as THREE.Material).dispose();
    super.explode(ctx, dir, force);
  }

  override dispose(): void {
    (this.shield.material as THREE.Material).dispose();
    super.dispose();
  }

  protected override knockback(damage: number): number {
    return damage * 0.03;
  }

  protected think(dt: number, ctx: GameContext): void {
    const shieldMat = this.shield.material as THREE.MeshBasicMaterial;
    shieldMat.opacity += (0.32 + Math.sin(ctx.time * 6) * 0.05 - shieldMat.opacity) * Math.min(1, dt * 5);
    const before = this.position.clone();
    if (this.state !== 'combat') {
      this.wander(dt, ctx, SPEED * 0.7);
      this.animate(dt, before, ctx);
      this.mode = 'chase';
      return;
    }
    this.modeTime += dt;
    this.chargeCooldown -= dt;
    const p = ctx.player.position;
    const dist = Math.hypot(p.x - this.position.x, p.z - this.position.z);
    switch (this.mode) {
      case 'chase': {
        const target = new THREE.Vector3(this.flankTarget?.x ?? p.x, 0, this.flankTarget?.z ?? p.z);
        if (dist < 6) target.set(p.x, 0, p.z);
        this.moveTo(dt, ctx, target, SPEED, false);
        this.faceTowards(dt, p.x, p.z, TURN_RATE);
        if (dist < PUNCH_RANGE) this.setMode('windup');
        else if (this.chargeCooldown <= 0 && dist > 7 && dist < 16 && this.seesPlayer && this.clearLane(ctx)) {
          ctx.audio.roar(this.position);
          this.setMode('roar');
        }
        break;
      }
      case 'windup':
        this.faceTowards(dt, p.x, p.z, TURN_RATE);
        if (this.modeTime >= WINDUP) {
          ctx.audio.punch(this.position);
          this.hitThisAttack = false;
          this.setMode('punch');
        }
        break;
      case 'punch':
        if (!this.hitThisAttack && this.modeTime < 0.15 && dist < PUNCH_RANGE + 0.5 && this.facingDot(p) > 0.5) {
          this.hitThisAttack = true;
          ctx.damagePlayer(PUNCH_DAMAGE, this.position);
          ctx.pushPlayer(this.forward().multiplyScalar(9).setY(3));
        }
        if (this.modeTime > 0.7) this.setMode('chase');
        break;
      case 'roar':
        this.faceTowards(dt, p.x, p.z, TURN_RATE * 2);
        this.body.position.x = Math.sin(this.modeTime * 50) * 0.04;
        if (this.modeTime >= ROAR_TIME) {
          this.body.position.x = 0;
          this.chargeDir.copy(this.forward());
          this.hitThisAttack = false;
          this.setMode('charge');
        }
        break;
      case 'charge': {
        const blocked = this.stepBody(ctx, this.chargeDir.x * CHARGE_SPEED * dt, this.chargeDir.z * CHARGE_SPEED * dt);
        if (!this.hitThisAttack && dist < 1.7) {
          this.hitThisAttack = true;
          ctx.damagePlayer(CHARGE_DAMAGE, this.position);
          ctx.pushPlayer(this.chargeDir.clone().multiplyScalar(12).setY(4));
        }
        if (blocked) {
          // Bateu na parede: fica tonto, de costas expostas.
          ctx.audio.bruteStep(this.position);
          ctx.player.shake(dist < 10 ? 0.3 : 0.1);
          this.setMode('stagger');
          this.modeTime = -0.9;
          this.chargeCooldown = 7;
        } else if (this.modeTime > CHARGE_TIME) {
          this.chargeCooldown = 6;
          this.setMode('chase');
        }
        break;
      }
      case 'stagger':
        this.body.rotation.z = Math.sin(this.modeTime * 14) * 0.08;
        if (this.modeTime > 0.9) {
          this.body.rotation.z = 0;
          this.setMode('chase');
        }
        break;
    }
    this.animate(dt, before, ctx);
  }

  private clearLane(ctx: GameContext): boolean {
    const p = ctx.player.position;
    return hasLineOfSight(ctx.grid, this.position.x, 0.8, this.position.z, p.x, 0.8, p.z, ctx.ceiling, 'move');
  }

  private forward(): THREE.Vector3 {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  private facingDot(p: THREE.Vector3): number {
    const dx = p.x - this.position.x;
    const dz = p.z - this.position.z;
    const d = Math.hypot(dx, dz) || 1;
    return (Math.sin(this.yaw) * dx + Math.cos(this.yaw) * dz) / d;
  }

  private setMode(m: BruteMode): void {
    this.mode = m;
    this.modeTime = 0;
  }

  private animate(dt: number, before: THREE.Vector3, ctx: GameContext): void {
    const speed = Math.hypot(this.position.x - before.x, this.position.z - before.z) / Math.max(dt, 1e-4);
    this.walk += speed * dt * 1.4;
    const swing = Math.min(1, speed / SPEED) * 0.45;
    this.legs[0]!.rotation.x = Math.sin(this.walk) * swing;
    this.legs[1]!.rotation.x = -Math.sin(this.walk) * swing;
    const raise = this.mode === 'windup' ? Math.min(1, this.modeTime / WINDUP) : this.mode === 'punch' ? Math.max(0, 1 - this.modeTime * 5) : 0;
    this.arms[0]!.rotation.x = -raise * 2.2 + (this.mode === 'punch' ? -1.4 * Math.max(0, 1 - this.modeTime * 2) : Math.sin(this.walk) * swing * 0.5);
    this.arms[1]!.rotation.x = -raise * 1.2 - Math.sin(this.walk) * swing * 0.5;
    if (speed > 0.5) {
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        this.stepTimer = this.mode === 'charge' ? 0.28 : 0.7;
        ctx.audio.bruteStep(this.position);
        const d = this.position.distanceTo(ctx.player.position);
        if (d < 9) ctx.player.shake(0.05 * (1 - d / 9));
      }
    }
  }
}
