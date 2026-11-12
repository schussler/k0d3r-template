import * as THREE from 'three';
import { isFrontal } from '../rules/damage';
import { type EnemyFrame, type EnemyServices, type Hitbox, Robot, robotMaterial } from './robot';

/**
 * Brutamontes: lento, com escudo frontal que bloqueia pistola e rifle (a escopeta passa pela metade). Sempre vira
 * para o jogador, mas devagar: quem corre em volta chega às costas, onde as aberturas de exaustão brilham.
 * Soca de perto e dá uma investida curta; se a investida bate na parede, fica atordoado.
 */
const WALK = 2.1;
const TURN_RATE = 1.5;
const PUNCH_RANGE = 2.5;
const PUNCH_DAMAGE = 25;
const CHARGE_SPEED = 9.5;
const CHARGE_DAMAGE = 30;

type Phase = 'walk' | 'punchWindup' | 'punch' | 'chargeWindup' | 'charge' | 'stunned';

let geo: Record<string, THREE.BufferGeometry> | null = null;

export class Brute extends Robot {
  readonly kind = 'brute';
  protected readonly radius = 0.75;
  protected readonly eyeHeight = 2.3;
  protected readonly flying = false;
  protected override readonly knockScale = 0.2;
  protected readonly hitboxes: readonly Hitbox[] = [
    { part: 'head', x: 0, y: 2.38, z: -0.05, r: 0.28 },
    { part: 'body', x: 0, y: 1.6, z: 0, r: 0.75 },
    { part: 'body', x: 0, y: 0.7, z: 0, r: 0.55 },
  ];
  private phase: Phase = 'walk';
  private phaseTime = 0;
  private punchCd = 0;
  private chargeCd = 3;
  private chargeHit = false;
  private walkPhase = 0;
  private stepSide = 0;
  private target = { x: 0, z: 0 };
  private retarget = 0;
  private readonly legs: THREE.Object3D[] = [];
  private readonly fist: THREE.Object3D;
  private readonly shield: THREE.Object3D;
  private readonly fwd = { x: 0, z: 1 };

  constructor(x: number, z: number, s: EnemyServices) {
    super(x, z, 260, s);
    geo ??= {
      torso: new THREE.BoxGeometry(1.3, 1.1, 0.9),
      belly: new THREE.BoxGeometry(1.0, 0.5, 0.75),
      head: new THREE.BoxGeometry(0.45, 0.35, 0.45),
      leg: new THREE.BoxGeometry(0.38, 0.8, 0.42),
      foot: new THREE.BoxGeometry(0.45, 0.16, 0.65),
      arm: new THREE.BoxGeometry(0.34, 0.9, 0.38),
      fist: new THREE.BoxGeometry(0.46, 0.46, 0.46),
      shield: new THREE.BoxGeometry(1.5, 1.9, 0.14),
      rim: new THREE.BoxGeometry(1.56, 0.1, 0.18),
      vent: new THREE.BoxGeometry(0.22, 0.5, 0.08),
    };
    const g = geo as Record<'torso' | 'belly' | 'head' | 'leg' | 'foot' | 'arm' | 'fist' | 'shield' | 'rim' | 'vent', THREE.BufferGeometry>;
    const armor = this.flashable(robotMaterial(0x6b5a3c, 0x000000, 1, 0.75, 0.45));
    const dark = this.flashable(robotMaterial(0x24272d, 0x000000, 1, 0.85, 0.35));
    const glow = this.flashable(robotMaterial(0x111111, 0xff7a1a, 3.5));
    const shieldMat = this.flashable(robotMaterial(0x4d6b80, 0x0a2a40, 0.8, 0.9, 0.25));
    const eye = this.flashable(robotMaterial(0x111111, 0xff2a1a, 4));
    for (const side of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(side * 0.38, 1.0, 0);
      const thigh = new THREE.Mesh(g.leg, dark);
      thigh.position.y = -0.3;
      const foot = new THREE.Mesh(g.foot, armor);
      foot.position.set(0, -0.9, 0.08);
      leg.add(thigh, foot);
      this.legs.push(leg);
      this.body.add(leg);
    }
    const torso = new THREE.Mesh(g.torso, armor);
    torso.position.y = 1.7;
    const belly = new THREE.Mesh(g.belly, dark);
    belly.position.y = 1.05;
    const head = new THREE.Mesh(g.head, dark);
    head.position.set(0, 2.38, -0.05);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.08, 0.05), eye);
    visor.position.set(0, 2.4, 0.19);
    // Aberturas de exaustão nas costas: o ponto fraco à vista.
    for (const vx of [-0.3, 0, 0.3]) {
      const vent = new THREE.Mesh(g.vent, glow);
      vent.position.set(vx, 1.75, -0.46);
      this.body.add(vent);
    }
    const armR = new THREE.Mesh(g.arm, dark);
    armR.position.set(0.85, 1.6, 0.1);
    this.fist = new THREE.Mesh(g.fist, armor);
    this.fist.position.set(0.85, 1.05, 0.25);
    const armL = new THREE.Mesh(g.arm, dark);
    armL.position.set(-0.8, 1.6, 0.25);
    this.shield = new THREE.Group();
    this.shield.position.set(-0.25, 1.45, 0.75);
    const plate = new THREE.Mesh(g.shield, shieldMat);
    const rimTop = new THREE.Mesh(g.rim, glow);
    rimTop.position.y = 0.95;
    const rimBottom = new THREE.Mesh(g.rim, glow);
    rimBottom.position.y = -0.95;
    this.shield.add(plate, rimTop, rimBottom);
    this.body.add(torso, belly, head, visor, armR, this.fist, armL, this.shield);
    this.body.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
  }

  override frontalShieldAgainst(shooter: THREE.Vector3): boolean {
    this.fwd.x = Math.sin(this.yaw);
    this.fwd.z = Math.cos(this.yaw);
    return this.alive && this.phase !== 'stunned' && isFrontal(this.fwd, { x: shooter.x - this.x, z: shooter.z - this.z });
  }

  protected behave(f: EnemyFrame): void {
    const dt = f.dt;
    this.phaseTime += dt;
    this.punchCd -= dt;
    this.chargeCd -= dt;
    let moving = false;
    switch (this.phase) {
      case 'walk':
        moving = this.walk(f);
        break;
      case 'punchWindup':
        this.faceTowards(f.player.x, f.player.z, TURN_RATE, dt);
        this.fist.position.z = 0.25 - this.phaseTime * 0.8;
        if (this.phaseTime > 0.45) {
          this.set('punch');
          this.services.sfx.swing(this.x, this.y + 1.5, this.z);
          this.tryPunch(f);
        }
        break;
      case 'punch':
        this.fist.position.z = 0.25 + Math.sin(Math.min(1, this.phaseTime / 0.25) * Math.PI) * 0.9;
        if (this.phaseTime > 0.5) this.set('walk');
        break;
      case 'chargeWindup':
        this.faceTowards(f.player.x, f.player.z, TURN_RATE * 1.5, dt);
        this.body.position.z = -Math.sin(this.phaseTime * 20) * 0.03;
        if (this.phaseTime > 0.8) {
          this.set('charge');
          this.chargeHit = false;
        }
        break;
      case 'charge':
        moving = true;
        this.doCharge(f);
        break;
      case 'stunned':
        this.body.rotation.z = Math.sin(this.phaseTime * 9) * 0.08;
        if (this.phaseTime > 1.8) {
          this.body.rotation.z = 0;
          this.set('walk');
        }
        break;
    }
    this.animate(dt, moving);
  }

  private set(p: Phase): void {
    this.phase = p;
    this.phaseTime = 0;
  }

  private walk(f: EnemyFrame): boolean {
    const mode = this.mem.mode;
    const p = f.player;
    if (mode === 'combat') {
      const dist = this.distanceToPlayer(f);
      this.faceTowards(p.x, p.z, TURN_RATE, f.dt);
      const facing = this.facingPlayer(f, 0.6);
      if (dist < PUNCH_RANGE && this.punchCd <= 0 && facing) {
        this.set('punchWindup');
        this.punchCd = 1.4;
        return false;
      }
      if (this.sees && dist > 5 && dist < 12 && this.chargeCd <= 0 && this.facingPlayer(f, 0.95)) {
        this.set('chargeWindup');
        this.chargeCd = 6 + Math.random() * 2;
        this.services.sfx.roar(this.x, this.y + 2, this.z);
        return false;
      }
      if (dist < 1.8) {
        this.stopMoving();
        return false;
      }
      return !this.navigate(f, p.x, p.z, WALK, 3);
    }
    const goal = mode === 'alert' ? { x: this.noiseX, z: this.noiseZ } : mode === 'search' ? { x: this.lastSeenX, z: this.lastSeenZ } : this.patrol(f);
    const arrived = this.navigate(f, goal.x, goal.z, mode === 'patrol' ? WALK * 0.6 : WALK, 3);
    if (!arrived) this.faceTowards(this.x + this.vx, this.z + this.vz, TURN_RATE, f.dt);
    return !arrived;
  }

  private patrol(f: EnemyFrame): { x: number; z: number } {
    this.retarget -= f.dt;
    if (this.retarget <= 0) {
      this.target = this.patrolPoint(f, 3);
      this.retarget = 6 + Math.random() * 4;
    }
    return this.target;
  }

  private facingPlayer(f: EnemyFrame, cos: number): boolean {
    const dx = f.player.x - this.x;
    const dz = f.player.z - this.z;
    const d = Math.max(1e-3, Math.hypot(dx, dz));
    return (Math.sin(this.yaw) * dx + Math.cos(this.yaw) * dz) / d > cos;
  }

  private tryPunch(f: EnemyFrame): void {
    if (this.distanceToPlayer(f) < PUNCH_RANGE + 0.4 && this.facingPlayer(f, 0.35)) {
      f.damagePlayer(PUNCH_DAMAGE, this.x, this.z, Math.sin(this.yaw) * 7, Math.cos(this.yaw) * 7);
    }
  }

  private doCharge(f: EnemyFrame): void {
    const vx = Math.sin(this.yaw) * CHARGE_SPEED;
    const vz = Math.cos(this.yaw) * CHARGE_SPEED;
    const bx = this.x;
    const bz = this.z;
    const m = { x: this.x, z: this.z };
    const hitWall = this.chargeStep(f, m, vx * f.dt, vz * f.dt);
    this.x = m.x;
    this.z = m.z;
    if (!this.chargeHit && this.distanceToPlayer(f) < 1.7) {
      this.chargeHit = true;
      f.damagePlayer(CHARGE_DAMAGE, this.x, this.z, vx * 1.1, vz * 1.1);
      this.set('walk');
      return;
    }
    if (hitWall || (bx === this.x && bz === this.z)) {
      this.services.sfx.stomp(this.x, this.y, this.z, 1.5);
      this.services.sparks.emit({ count: 20, x: this.x + vx * 0.08, y: 1.5, z: this.z + vz * 0.08, nx: -vx, ny: 2, nz: -vz, speed: 6, spread: 1, color: new THREE.Color(1, 0.7, 0.3), size: 0.07, life: 0.4, gravity: 9, drag: 1 });
      this.set('stunned');
      return;
    }
    if (this.phaseTime > 1.3) this.set('walk');
  }

  private chargeStep(f: EnemyFrame, m: { x: number; z: number }, dx: number, dz: number): boolean {
    const nx = m.x + dx;
    const nz = m.z + dz;
    for (const b of f.world.query(nx - this.radius, nz - this.radius, nx + this.radius, nz + this.radius, this.scratch)) {
      if (b.maxY < 0.5) continue;
      const cx = Math.max(b.minX, Math.min(nx, b.maxX));
      const cz = Math.max(b.minZ, Math.min(nz, b.maxZ));
      if ((cx - nx) ** 2 + (cz - nz) ** 2 < this.radius * this.radius) return true;
    }
    m.x = nx;
    m.z = nz;
    return false;
  }

  private animate(dt: number, moving: boolean): void {
    const speed = this.phase === 'charge' ? 2.4 : 1;
    if (moving) {
      const before = Math.floor(this.walkPhase / Math.PI);
      this.walkPhase += dt * 4.2 * speed;
      if (Math.floor(this.walkPhase / Math.PI) !== before) {
        this.stepSide ^= 1;
        this.services.sfx.stomp(this.x, this.y, this.z, this.phase === 'charge' ? 1.2 : 0.8);
      }
    }
    const swing = moving ? Math.sin(this.walkPhase) * 0.45 : 0;
    this.legs[0]?.rotation.set(swing, 0, 0);
    this.legs[1]?.rotation.set(-swing, 0, 0);
    this.body.position.y = moving ? Math.abs(Math.sin(this.walkPhase)) * 0.06 : 0;
    this.shield.rotation.y = Math.sin(this.walkPhase * 0.5) * 0.04;
  }
}
