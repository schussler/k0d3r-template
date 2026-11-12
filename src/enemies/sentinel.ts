import * as THREE from 'three';
import { shouldFlank } from '../rules/ai';
import { cellCenter, isLowCover, tileAt, worldToCell } from '../level/grid';
import { type EnemyFrame, type EnemyServices, type Hitbox, Robot, robotMaterial } from './robot';

/**
 * Sentinela: atira de longe e se esconde. Ciclo de combate: vai para uma cobertura entre ela e o jogador,
 * agacha, levanta, mira com um laser vermelho (o aviso), dispara uma rajada de 3 e volta a se esconder.
 * Se o jogador some por muito tempo, troca de cobertura para outro ângulo (flanco).
 */
const WALK = 2.2;
const RUN = 3.8;
const BURST = 3;
const BURST_GAP = 0.17;
const AIM_TIME = 0.75;
const BOLT_SPEED = 34;
const BOLT_DAMAGE = 8;
const BOLT_COLOR = new THREE.Color(3, 0.5, 0.3);
const MIN_RANGE = 7;
const MAX_RANGE = 22;

type Phase = 'move' | 'hide' | 'aim' | 'burst';

let geo: { torso: THREE.BoxGeometry; head: THREE.BoxGeometry; visor: THREE.BoxGeometry; leg: THREE.BoxGeometry; foot: THREE.BoxGeometry; gun: THREE.BoxGeometry; barrel: THREE.CylinderGeometry; pack: THREE.BoxGeometry; arm: THREE.BoxGeometry } | null = null;

export class Sentinel extends Robot {
  readonly kind = 'sentinel';
  protected readonly radius = 0.42;
  protected readonly eyeHeight = 1.6;
  protected readonly flying = false;
  protected readonly hitboxes: readonly Hitbox[];
  private readonly standBoxes: readonly Hitbox[] = [
    { part: 'head', x: 0, y: 1.62, z: 0.02, r: 0.2 },
    { part: 'body', x: 0, y: 1.15, z: 0, r: 0.38 },
    { part: 'body', x: 0, y: 0.55, z: 0, r: 0.32 },
  ];
  private phase: Phase = 'move';
  private phaseTime = 0;
  private shots = 0;
  private cover: { x: number; z: number } | null = null;
  private coverAge = 0;
  private crouch = 0;
  private walkPhase = 0;
  private target = { x: 0, z: 0 };
  private retarget = 0;
  private readonly legs: THREE.Object3D[] = [];
  private readonly upper = new THREE.Group();
  private readonly muzzle = new THREE.Object3D();
  private readonly laser: THREE.Mesh;
  private readonly aimPoint = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();

  constructor(x: number, z: number, s: EnemyServices) {
    super(x, z, 70, s);
    // As caixas de acerto acompanham o agachar: são lidas de `standBoxes` ajustadas em `behave`.
    this.hitboxes = this.standBoxes.map((h) => ({ ...h }));
    geo ??= {
      torso: new THREE.BoxGeometry(0.62, 0.62, 0.42),
      head: new THREE.BoxGeometry(0.34, 0.26, 0.32),
      visor: new THREE.BoxGeometry(0.28, 0.07, 0.04),
      leg: new THREE.BoxGeometry(0.16, 0.5, 0.18),
      foot: new THREE.BoxGeometry(0.2, 0.08, 0.32),
      gun: new THREE.BoxGeometry(0.14, 0.16, 0.62),
      barrel: new THREE.CylinderGeometry(0.04, 0.05, 0.3, 10),
      pack: new THREE.BoxGeometry(0.5, 0.5, 0.2),
      arm: new THREE.BoxGeometry(0.12, 0.45, 0.14),
    };
    const shell = this.flashable(robotMaterial(0xb9c0c8, 0x000000, 1, 0.5, 0.4));
    const dark = this.flashable(robotMaterial(0x2a2f37, 0x000000, 1, 0.8, 0.35));
    const glow = this.flashable(robotMaterial(0x111111, 0xff2a1a, 3));
    const stripe = this.flashable(robotMaterial(0xd9a400, 0x000000, 1, 0.3, 0.5));
    this.body.add(this.upper);
    for (const side of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(side * 0.16, 0.82, 0);
      const thigh = new THREE.Mesh(geo.leg, dark);
      thigh.position.y = -0.22;
      const shin = new THREE.Mesh(geo.leg, shell);
      shin.position.y = -0.6;
      const foot = new THREE.Mesh(geo.foot, dark);
      foot.position.set(0, -0.8, 0.05);
      leg.add(thigh, shin, foot);
      this.legs.push(leg);
      this.body.add(leg);
    }
    const torso = new THREE.Mesh(geo.torso, shell);
    torso.position.y = 1.15;
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.63, 0.07, 0.43), stripe);
    band.position.y = 1.0;
    const pack = new THREE.Mesh(geo.pack, dark);
    pack.position.set(0, 1.2, -0.3);
    const head = new THREE.Mesh(geo.head, dark);
    head.position.y = 1.6;
    const visor = new THREE.Mesh(geo.visor, glow);
    visor.position.set(0, 1.62, 0.17);
    const armL = new THREE.Mesh(geo.arm, dark);
    armL.position.set(-0.4, 1.12, 0.05);
    const gun = new THREE.Mesh(geo.gun, dark);
    gun.position.set(0.42, 1.18, 0.18);
    const barrel = new THREE.Mesh(geo.barrel, shell);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0.42, 1.2, 0.6);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), glow);
    tip.position.set(0.42, 1.2, 0.76);
    this.muzzle.position.set(0.42, 1.2, 0.8);
    this.upper.add(torso, band, pack, head, visor, armL, gun, barrel, tip, this.muzzle);
    this.laser = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, 1, 4),
      new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.7, toneMapped: false, depthWrite: false }),
    );
    this.laser.userData.noDebris = true;
    this.laser.visible = false;
    this.sceneExtras.push(this.laser);
    this.body.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
  }

  override dispose(): void {
    this.laser.visible = false;
  }

  protected behave(f: EnemyFrame): void {
    const dt = f.dt;
    this.phaseTime += dt;
    this.coverAge += dt;
    const mode = this.mem.mode;
    let moving: boolean;
    if (mode === 'combat' || (mode === 'search' && this.cover)) moving = this.combat(f);
    else {
      this.phase = 'move';
      this.laser.visible = false;
      const goal = mode === 'alert' ? { x: this.noiseX, z: this.noiseZ } : mode === 'search' ? { x: this.lastSeenX, z: this.lastSeenZ } : this.patrol(f);
      const arrived = this.navigate(f, goal.x, goal.z, mode === 'patrol' ? WALK * 0.6 : RUN);
      moving = !arrived;
      if (moving) this.faceTowards(this.x + this.vx, this.z + this.vz, 6, dt);
    }
    this.animate(dt, moving);
  }

  private patrol(f: EnemyFrame): { x: number; z: number } {
    this.retarget -= f.dt;
    if (this.retarget <= 0) {
      this.target = this.patrolPoint(f, 4);
      this.retarget = 5 + Math.random() * 4;
    }
    return this.target;
  }

  private combat(f: EnemyFrame): boolean {
    const p = f.player;
    const dist = this.distanceToPlayer(f);
    const needCover = !this.cover || (shouldFlank(this.mem) && this.coverAge > 3) || dist < MIN_RANGE * 0.6 || this.coverAge > 14;
    if (needCover && this.phase !== 'burst') {
      this.cover = this.pickCover(f, shouldFlank(this.mem)) ?? this.cover ?? { x: this.x, z: this.z };
      this.coverAge = 0;
      this.phase = 'move';
      this.laser.visible = false;
    }
    if (this.phase === 'move') {
      const c = this.cover ?? { x: this.x, z: this.z };
      const arrived = this.navigate(f, c.x, c.z, RUN);
      this.faceTowards(arrived ? p.x : this.x + this.vx, arrived ? p.z : this.z + this.vz, 6, f.dt);
      if (arrived) this.setPhase('hide');
      return !arrived;
    }
    this.stopMoving();
    this.faceTowards(p.x, p.z, 5, f.dt);
    if (this.phase === 'hide') {
      this.crouch = Math.min(1, this.crouch + f.dt * 4);
      if (this.phaseTime > 1.2 + Math.random() * 0.02 + (this.cover ? 0.6 : 0)) {
        this.setPhase('aim');
        this.services.sfx.charge(this.x, this.y + 1.2, this.z, AIM_TIME);
      }
    } else if (this.phase === 'aim') {
      this.crouch = Math.max(0, this.crouch - f.dt * 5);
      this.updateLaser(f);
      if (this.phaseTime > AIM_TIME) {
        if (this.sees) {
          this.setPhase('burst');
          this.shots = 0;
        } else {
          // Levantou e não vê: a cobertura não serve mais.
          this.cover = null;
          this.laser.visible = false;
        }
      }
    } else if (this.phase === 'burst') {
      this.updateLaser(f);
      if (this.phaseTime > this.shots * BURST_GAP) {
        this.shoot(f);
        this.shots++;
        if (this.shots >= BURST) {
          this.setPhase('hide');
          this.laser.visible = false;
        }
      }
    }
    return false;
  }

  private setPhase(p: Phase): void {
    this.phase = p;
    this.phaseTime = 0;
  }

  private updateLaser(f: EnemyFrame): void {
    this.muzzle.getWorldPosition(this.tmp);
    this.aimPoint.set(f.player.x, f.player.eyeY - 0.35, f.player.z);
    const len = this.tmp.distanceTo(this.aimPoint);
    this.laser.visible = true;
    this.laser.position.copy(this.tmp).lerp(this.aimPoint, 0.5);
    this.laser.scale.set(1, len, 1);
    this.laser.quaternion.setFromUnitVectors(UP, this.aimPoint.clone().sub(this.tmp).normalize());
    (this.laser.material as THREE.MeshBasicMaterial).opacity = 0.35 + Math.sin(f.time * 40) * 0.25;
  }

  private shoot(f: EnemyFrame): void {
    this.muzzle.getWorldPosition(this.tmp);
    const p = f.player;
    // Mira um pouco à frente do jogador e erra mais quando ele corre: correr é a defesa.
    const lead = 0.12;
    const speed = Math.hypot(p.vx, p.vz);
    const spread = 0.35 + speed * 0.12;
    const aim = new THREE.Vector3(
      p.x + p.vx * lead + (Math.random() - 0.5) * spread,
      p.eyeY - 0.4 + (Math.random() - 0.5) * spread * 0.5,
      p.z + p.vz * lead + (Math.random() - 0.5) * spread,
    );
    const vel = aim.sub(this.tmp).normalize().multiplyScalar(BOLT_SPEED);
    this.services.projectiles.fire(this.tmp, vel, BOLT_DAMAGE, BOLT_COLOR);
    this.services.sfx.bolt(this.tmp.x, this.tmp.y, this.tmp.z);
    this.services.sparks.emit({ count: 4, x: this.tmp.x, y: this.tmp.y, z: this.tmp.z, nx: vel.x, ny: vel.y, nz: vel.z, speed: 3, spread: 0.5, color: BOLT_COLOR, size: 0.06, life: 0.15, gravity: 0, drag: 4 });
    this.recoil = { offset: this.recoil.offset, velocity: this.recoil.velocity - 3 };
  }

  /**
   * Cobertura: célula livre vizinha de um obstáculo que fica entre ela e o jogador, a uma distância boa de tiro.
   * No flanco, prefere células num ângulo diferente do atual em relação ao jogador.
   */
  private pickCover(f: EnemyFrame, flank: boolean): { x: number; z: number } | null {
    const p = f.player;
    const here = worldToCell(this.x, this.z);
    const curAngle = Math.atan2(this.x - p.x, this.z - p.z);
    let best: { x: number; z: number } | null = null;
    let bestScore = Infinity;
    const R = 8;
    for (let dr = -R; dr <= R; dr++) {
      for (let dc = -R; dc <= R; dc++) {
        const col = here.col + dc;
        const row = here.row + dr;
        if (!f.passable(col, row, false)) continue;
        const c = cellCenter(col, row);
        const toP = Math.hypot(p.x - c.x, p.z - c.z);
        if (toP < MIN_RANGE || toP > MAX_RANGE) continue;
        const ux = (p.x - c.x) / toP;
        const uz = (p.z - c.z) / toP;
        // O vizinho na direção do jogador precisa ser obstáculo.
        const nc = col + Math.round(ux);
        const nr = row + Math.round(uz);
        const t = tileAt(f.grid, nc, nr);
        const solid = isLowCover(t) || t === 'stack' || t === 'pillar' || t === 'wall';
        if (!solid) continue;
        const angle = Math.atan2(c.x - p.x, c.z - p.z);
        let da = Math.abs(angle - (flank ? curAngle : this.flankAngle)) % (Math.PI * 2);
        if (da > Math.PI) da = Math.PI * 2 - da;
        const travel = Math.hypot(c.x - this.x, c.z - this.z);
        const score = travel * 0.6 + (flank ? (Math.PI - da) * 6 : da * 3) + Math.abs(toP - 13) * 0.3 + (isLowCover(t) ? 0 : 1.5);
        if (score < bestScore) {
          bestScore = score;
          best = c;
        }
      }
    }
    return best;
  }

  private animate(dt: number, moving: boolean): void {
    if (moving) this.walkPhase += dt * Math.hypot(this.vx, this.vz) * 3.2;
    const swing = moving ? Math.sin(this.walkPhase) * 0.6 : 0;
    this.legs[0]?.rotation.set(swing, 0, 0);
    this.legs[1]?.rotation.set(-swing, 0, 0);
    if (this.phase !== 'hide') this.crouch = Math.max(0, this.crouch - dt * 4);
    // Agachada atrás da caixa: o corpo e as caixas de acerto descem juntos.
    const drop = this.crouch * 0.62;
    this.upper.position.y = -drop;
    for (const leg of this.legs) leg.scale.y = 1 - this.crouch * 0.4;
    for (const leg of this.legs) leg.position.y = 0.82 - drop * 0.5;
    const boxes = this.hitboxes as Hitbox[];
    this.standBoxes.forEach((h, i) => {
      boxes[i] = { ...h, y: h.y - drop * (i === 2 ? 0.5 : 1) };
    });
    this.upper.position.y += moving ? Math.abs(Math.cos(this.walkPhase)) * 0.04 : 0;
  }
}

const UP = new THREE.Vector3(0, 1, 0);
