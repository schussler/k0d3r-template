import * as THREE from 'three';
import type { GameContext } from '../game/context';
import { clamp, damp } from '../logic/math';
import { Enemy } from './enemy';
import { ROBOT, anchor, geo, part } from './parts';

type DronePhase = 'orbit' | 'warn' | 'dive' | 'recover';

const HOVER = 2.4;
const ORBIT_SPEED = 6.5;
const DIVE_SPEED = 15;
const WARN_TIME = 0.65;
const DIVE_TIME = 1.1;
const RECOVER_TIME = 1;
const DIVE_DAMAGE = 15;

/** Drone: voa rápido e oscila de lado; avisa (olho vermelho e zumbido subindo) e dá rasante. */
export class Drone extends Enemy {
  readonly kind = 'drone' as const;
  readonly fly = true;
  private phase: DronePhase = 'orbit';
  private phaseTime = 0;
  private diveCooldown = 2;
  private readonly diveDir = new THREE.Vector3();
  private readonly eye: THREE.MeshStandardMaterial;
  private readonly rotors: THREE.Object3D[] = [];
  private bob = Math.random() * 10;
  private hitPlayer = false;

  constructor() {
    super(40);
    this.radius = 0.45;
    this.eyeHeight = 0;
    this.fovCos = Math.cos((80 * Math.PI) / 180);
    const shell = this.own(ROBOT.shell);
    const dark = this.own(ROBOT.dark);
    this.eye = this.own(ROBOT.eyeCyan);
    this.body.add(part(geo('drone-core', () => new THREE.SphereGeometry(0.38, 16, 12)), shell));
    this.body.add(part(geo('drone-ring', () => new THREE.TorusGeometry(0.45, 0.06, 8, 24).rotateX(Math.PI / 2)), dark));
    this.body.add(part(geo('drone-eye', () => new THREE.SphereGeometry(0.16, 12, 8)), this.eye, 0, 0, 0.32));
    for (const side of [-1, 1]) {
      const arm = part(geo('drone-arm', () => new THREE.BoxGeometry(0.5, 0.06, 0.1)), dark, side * 0.6, 0.05, 0);
      const rotor = part(geo('drone-rotor', () => new THREE.BoxGeometry(0.55, 0.02, 0.07)), shell, side * 0.85, 0.12, 0);
      this.body.add(arm, rotor);
      this.rotors.push(rotor);
    }
    this.body.add(part(geo('drone-fin', () => new THREE.BoxGeometry(0.06, 0.25, 0.2)), dark, 0, -0.38, -0.1));
    this.zones.push({ zone: 'body', object: anchor(this.body, 0, 0, 0), radius: 0.46 });
    this.zones.push({ zone: 'head', object: anchor(this.body, 0, 0, 0.32), radius: 0.2 });
  }

  protected override onEngage(ctx: GameContext): void {
    this.diveCooldown = 1 + ctx.rng() * 1.5;
  }

  protected think(dt: number, ctx: GameContext): void {
    this.bob += dt;
    for (const r of this.rotors) r.rotation.y += dt * 40;
    const player = ctx.player;
    if (this.state !== 'combat') {
      this.wander(dt, ctx, 3);
      this.hover(dt, HOVER + Math.sin(this.bob * 2) * 0.15, ctx);
      this.setEye(false);
      this.phase = 'orbit';
      return;
    }
    this.phaseTime += dt;
    const chest = new THREE.Vector3(player.position.x, player.position.y + player.height * 0.7, player.position.z);
    switch (this.phase) {
      case 'orbit': {
        const target = this.flankTarget ?? { x: chest.x, z: chest.z };
        // Oscila de lado enquanto procura a vaga, para ser difícil de mirar.
        const side = Math.sin(this.bob * 2.4) * 2.2;
        const t = new THREE.Vector3(target.x + Math.cos(this.yaw) * side, 0, target.z - Math.sin(this.yaw) * side);
        this.moveTo(dt, ctx, t, ORBIT_SPEED, false);
        this.faceTowards(dt, chest.x, chest.z, 8);
        this.hover(dt, HOVER + Math.sin(this.bob * 3) * 0.3, ctx);
        this.diveCooldown -= dt;
        const dist = this.position.distanceTo(chest);
        if (this.diveCooldown <= 0 && this.seesPlayer && dist < 18) this.setPhase('warn');
        break;
      }
      case 'warn':
        this.faceTowards(dt, chest.x, chest.z, 10);
        this.setEye(true);
        this.body.position.x = Math.sin(this.phaseTime * 60) * 0.03;
        if (this.phaseTime === dt) ctx.audio.droneWarn(this.position);
        if (this.phaseTime >= WARN_TIME) {
          this.diveDir.copy(chest).sub(this.position).normalize();
          this.hitPlayer = false;
          ctx.audio.droneDive(this.position);
          this.setPhase('dive');
        }
        break;
      case 'dive': {
        const blocked = this.stepBody(ctx, this.diveDir.x * DIVE_SPEED * dt, this.diveDir.z * DIVE_SPEED * dt);
        this.position.y = clamp(this.position.y + this.diveDir.y * DIVE_SPEED * dt, 0.5, ctx.ceiling - 0.5);
        if (!this.hitPlayer && this.position.distanceTo(chest) < 1.15) {
          this.hitPlayer = true;
          ctx.damagePlayer(DIVE_DAMAGE, this.position);
          ctx.pushPlayer(this.diveDir.clone().multiplyScalar(5));
          this.diveDir.multiplyScalar(-1);
          this.setPhase('recover');
        } else if (blocked || this.phaseTime > DIVE_TIME) this.setPhase('recover');
        break;
      }
      case 'recover':
        this.setEye(false);
        this.stepBody(ctx, -this.diveDir.x * 4 * dt, -this.diveDir.z * 4 * dt);
        this.hover(dt, HOVER + 0.6, ctx);
        if (this.phaseTime >= RECOVER_TIME) {
          this.diveCooldown = 2.5 + ctx.rng() * 2;
          this.setPhase('orbit');
        }
        break;
    }
  }

  private setPhase(p: DronePhase): void {
    this.phase = p;
    this.phaseTime = 0;
    this.body.position.x = 0;
  }

  private hover(dt: number, height: number, ctx: GameContext): void {
    this.position.y = damp(this.position.y, Math.min(height, ctx.ceiling - 0.6), 3, dt);
  }

  private setEye(warning: boolean): void {
    this.eye.emissive.setHex(warning ? 0xff2a1a : 0x3ff0ff);
  }

  protected override knockback(damage: number): number {
    return damage * 0.25;
  }
}
