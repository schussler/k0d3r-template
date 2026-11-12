import * as THREE from 'three';
import type { GameContext } from '../game/context';
import { hearsNoise, patrolRoute } from '../logic/ai';
import { hasLineOfSight, moveBody } from '../logic/collision';
import type { HitResult, HitZone } from '../logic/combat';
import type { Cell, EnemyKind } from '../logic/level';
import { angleDelta, turnTowards } from '../logic/math';
import { findPath, nearestWalkable, smoothPath } from '../logic/nav';
import type { WeaponId } from '../logic/weapons';

export type AIState = 'patrol' | 'alert' | 'combat' | 'search';

export interface HitZoneDef {
  readonly zone: HitZone;
  readonly object: THREE.Object3D;
  readonly radius: number;
}

export interface HitInfo {
  readonly result: HitResult;
  readonly point: THREE.Vector3;
  readonly dir: THREE.Vector3;
  readonly weapon: WeaponId;
}

const SIGHT_INTERVAL = 0.2;
const REPATH_INTERVAL = 0.6;
/** Sem avançar este tanto (m) em STUCK_TIME segundos querendo andar = preso. */
const STUCK_PROGRESS = 0.3;
const STUCK_TIME = 1;
const SEARCH_TIME = 6;

let nextId = 1;

/**
 * Base dos robôs: percepção (visão em cone com linha de visada, audição de tiro), estados, caminho pela
 * grade com A* e destravamento, reação a tiro (piscar, recuo) e desmonte em peças com física.
 */
export abstract class Enemy {
  readonly id = nextId++;
  abstract readonly kind: EnemyKind;
  abstract readonly fly: boolean;
  readonly root = new THREE.Group();
  /** Filho do root: recebe o "tranco" do recuo sem mexer na posição lógica. */
  readonly body = new THREE.Group();
  readonly zones: HitZoneDef[] = [];
  health: number;
  readonly maxHealth: number;
  alive = true;
  state: AIState = 'patrol';
  yaw = 0;
  lastKnown: THREE.Vector3 | null = null;
  /** Vaga de cerco calculada pelo diretor (sector). */
  flankTarget: { x: number; z: number } | null = null;
  seesPlayer = false;
  /** Maior tempo contínuo (s) querendo andar sem sair do lugar: o E2E mede robô preso em parede. */
  longestStuck = 0;
  protected radius = 0.45;
  protected sightRange = 34;
  protected fovCos = Math.cos((65 * Math.PI) / 180);
  protected eyeHeight = 1.6;
  protected readonly knock = new THREE.Vector3();
  protected flinch = 0;
  private flash = 0;
  private sightTimer = Math.random() * SIGHT_INTERVAL;
  private path: Cell[] = [];
  private pathIndex = 0;
  private pathGoal = -1;
  private pathRev = -1;
  private repathTimer = 0;
  private stuckTimer = 0;
  private stuckFails = 0;
  private readonly progressFrom = new THREE.Vector3();
  private patrol: Cell[] = [];
  private patrolIndex = 0;
  private patrolWait = 0;
  private searchTimer = 0;
  private readonly materials: { mat: THREE.MeshStandardMaterial; emissive: THREE.Color }[] = [];

  constructor(maxHealth: number) {
    this.maxHealth = maxHealth;
    this.health = maxHealth;
    this.root.add(this.body);
  }

  get position(): THREE.Vector3 {
    return this.root.position;
  }

  /** Clona o material para este robô (o piscar de acerto não pode acender todos do mesmo tipo). */
  protected own(mat: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
    const m = mat.clone();
    this.materials.push({ mat: m, emissive: m.emissive.clone() });
    return m;
  }

  placeAt(x: number, z: number, ctx: GameContext): void {
    this.root.position.set(x, this.fly ? 2.4 : 0, z);
    this.progressFrom.copy(this.root.position);
    const home = ctx.grid.worldToCell(x, z);
    this.patrol = patrolRoute(ctx.grid, home, ctx.rng, this.fly);
    this.yaw = ctx.rng() * Math.PI * 2;
  }

  /** Raio do ruído de tiro: entra em alerta e vai até a origem. */
  hear(source: THREE.Vector3, radius: number, ctx: GameContext): void {
    if (!this.alive || this.state === 'combat') return;
    if (!hearsNoise(ctx.grid, this.position, source, radius, ctx.ceiling)) return;
    this.state = 'alert';
    this.lastKnown = source.clone();
  }

  /** Avisa por proximidade de outro robô que entrou em combate (eles se comunicam). */
  alertTo(pos: THREE.Vector3): void {
    if (!this.alive || this.state === 'combat') return;
    this.state = 'alert';
    this.lastKnown = pos.clone();
  }

  update(dt: number, ctx: GameContext): void {
    if (!this.alive) return;
    this.perceive(dt, ctx);
    this.think(dt, ctx);
    this.applyKnock(dt, ctx);
    this.animateHit(dt);
    this.root.rotation.y = this.yaw;
  }

  protected abstract think(dt: number, ctx: GameContext): void;

  private perceive(dt: number, ctx: GameContext): void {
    this.sightTimer -= dt;
    if (this.sightTimer > 0) return;
    this.sightTimer = SIGHT_INTERVAL;
    const eye = ctx.player.eye;
    const dx = eye.x - this.position.x;
    const dz = eye.z - this.position.z;
    const dist = Math.hypot(dx, dz);
    const facing = (Math.sin(this.yaw) * dx + Math.cos(this.yaw) * dz) / (dist || 1);
    const inCone = this.state === 'combat' || dist < 4 || facing > this.fovCos;
    this.seesPlayer =
      dist < this.sightRange &&
      inCone &&
      hasLineOfSight(ctx.grid, this.position.x, this.position.y + this.eyeHeight, this.position.z, eye.x, eye.y - 0.2, eye.z, ctx.ceiling);
    if (this.seesPlayer) {
      if (this.state !== 'combat') this.onEngage(ctx);
      this.state = 'combat';
      this.lastKnown = ctx.player.position.clone();
      this.searchTimer = SEARCH_TIME;
    } else if (this.state === 'combat') {
      this.searchTimer -= SIGHT_INTERVAL;
      if (this.searchTimer <= 0) this.state = 'search';
    }
  }

  /** Primeira vez que vê a jogadora nesta perseguição (som, avisa os vizinhos via sector). */
  protected onEngage(_ctx: GameContext): void {
    // Os tipos sobrescrevem quando têm um som próprio de alerta.
  }

  /** Patrulha, alerta (vai até o som) e busca (última posição) são iguais para todos. */
  protected wander(dt: number, ctx: GameContext, speed: number): void {
    if (this.state === 'alert' || this.state === 'search') {
      const target = this.lastKnown;
      if (!target || this.moveTo(dt, ctx, target, speed * 1.4) < 1.5) {
        this.state = this.state === 'alert' ? 'search' : 'patrol';
        this.lastKnown = this.state === 'search' ? target : null;
        if (this.state === 'search') this.searchTimer = SEARCH_TIME;
      }
      if (this.state === 'search') {
        this.searchTimer -= dt;
        this.yaw += dt * 1.2;
        if (this.searchTimer <= 0) this.state = 'patrol';
      }
      return;
    }
    if (this.patrol.length === 0) return;
    if (this.patrolWait > 0) {
      this.patrolWait -= dt;
      return;
    }
    const cell = this.patrol[this.patrolIndex % this.patrol.length]!;
    const c = ctx.grid.cellCenter(cell);
    const target = new THREE.Vector3(c.x, this.position.y, c.z);
    if (this.moveTo(dt, ctx, target, speed) < 0.6) {
      this.patrolIndex += 1;
      this.patrolWait = 1 + ctx.rng() * 1.5;
    }
  }

  /**
   * Anda em direção ao alvo pelo caminho da grade. Devolve a distância restante. Recalcula o caminho quando
   * o alvo muda de célula, quando uma porta abre ou periodicamente; destrava se não progride.
   */
  protected moveTo(dt: number, ctx: GameContext, target: THREE.Vector3, speed: number, face = true): number {
    const grid = ctx.grid;
    const remaining = Math.hypot(target.x - this.position.x, target.z - this.position.z);
    if (remaining < 0.3) return remaining;
    const goalCell = grid.worldToCell(target.x, target.z);
    const goalKey = goalCell.j * 4096 + goalCell.i;
    this.repathTimer -= dt;
    if (goalKey !== this.pathGoal || grid.navRevision !== this.pathRev || this.repathTimer <= 0) {
      this.repath(ctx, goalCell);
      this.pathGoal = goalKey;
      this.pathRev = grid.navRevision;
      this.repathTimer = REPATH_INTERVAL;
    }
    let wx = target.x;
    let wz = target.z;
    while (this.pathIndex < this.path.length - 1) {
      const wp = grid.cellCenter(this.path[this.pathIndex]!);
      if (Math.hypot(wp.x - this.position.x, wp.z - this.position.z) > 0.7) {
        wx = wp.x;
        wz = wp.z;
        break;
      }
      this.pathIndex += 1;
    }
    const dx = wx - this.position.x;
    const dz = wz - this.position.z;
    const d = Math.hypot(dx, dz) || 1;
    const step = Math.min(speed * dt, d);
    if (face) this.yaw = turnTowards(this.yaw, Math.atan2(dx, dz), dt * 6);
    this.stepBody(ctx, (dx / d) * step, (dz / d) * step);
    this.trackStuck(dt, ctx, step > 0.001);
    return remaining;
  }

  private repath(ctx: GameContext, goal: Cell): void {
    const grid = ctx.grid;
    const from = nearestWalkable(grid, grid.worldToCell(this.position.x, this.position.z), this.fly, 3);
    const to = nearestWalkable(grid, goal, this.fly, 4);
    const raw = from && to ? findPath(grid, from, to, this.fly) : null;
    this.path = raw ? smoothPath(grid, raw, this.fly) : [];
    this.pathIndex = this.path.length > 1 ? 1 : 0;
  }

  /** Movimento com colisão (drones colidem só com o que é alto). */
  protected stepBody(ctx: GameContext, dx: number, dz: number): boolean {
    const r = moveBody(
      ctx.grid,
      { x: this.position.x, y: 0, z: this.position.z },
      { x: dx, y: 0, z: dz },
      this.radius,
      1,
      ctx.ceiling,
      this.fly ? 'fly' : 'move',
    );
    this.position.x = r.x;
    this.position.z = r.z;
    return r.blocked;
  }

  private trackStuck(dt: number, ctx: GameContext, wantsMove: boolean): void {
    if (!wantsMove) {
      this.stuckTimer = 0;
      this.progressFrom.copy(this.position);
      return;
    }
    this.stuckTimer += dt;
    if (this.stuckTimer < STUCK_TIME) return;
    const moved = Math.hypot(this.position.x - this.progressFrom.x, this.position.z - this.progressFrom.z);
    this.stuckTimer = 0;
    this.progressFrom.copy(this.position);
    if (moved >= STUCK_PROGRESS) {
      this.stuckFails = 0;
      return;
    }
    this.stuckFails += 1;
    this.longestStuck = Math.max(this.longestStuck, this.stuckFails * STUCK_TIME);
    this.repathTimer = 0;
    if (this.stuckFails < 2) return;
    // Persistiu: desloca para o centro da célula livre mais próxima. Sem célula livre, segue contando.
    const free = nearestWalkable(ctx.grid, ctx.grid.worldToCell(this.position.x, this.position.z), this.fly, 4);
    if (!free) {
      console.info(`[kepler] ${this.kind} #${this.id} preso sem célula livre por perto`);
      return;
    }
    const c = ctx.grid.cellCenter(free);
    this.position.x = c.x;
    this.position.z = c.z;
    this.progressFrom.copy(this.position);
    this.stuckFails = 0;
    console.info(`[kepler] ${this.kind} #${this.id} destravado`);
  }

  faceTowards(dt: number, x: number, z: number, rate: number): number {
    const want = Math.atan2(x - this.position.x, z - this.position.z);
    this.yaw = turnTowards(this.yaw, want, rate * dt);
    return Math.abs(angleDelta(this.yaw, want));
  }

  /** Aplica dano já resolvido pelas regras; devolve true se morreu agora. */
  takeHit(hit: HitInfo, ctx: GameContext): boolean {
    if (!this.alive) return false;
    if (this.state !== 'combat') {
      this.state = 'combat';
      this.lastKnown = ctx.player.position.clone();
    }
    this.flash = 0.09;
    if (hit.result.blocked) return false;
    this.health -= hit.result.damage;
    this.flinch = Math.min(1, this.flinch + hit.result.damage / 30);
    this.knock.addScaledVector(new THREE.Vector3(hit.dir.x, 0, hit.dir.z).normalize(), this.knockback(hit.result.damage));
    if (this.health <= 0) {
      this.alive = false;
      return true;
    }
    return false;
  }

  /** Força do recuo por ponto de dano (robôs grandes recuam menos). */
  protected knockback(damage: number): number {
    return damage * 0.12;
  }

  private applyKnock(dt: number, ctx: GameContext): void {
    if (this.knock.lengthSq() < 0.0004) return;
    this.stepBody(ctx, this.knock.x * dt, this.knock.z * dt);
    this.knock.multiplyScalar(Math.exp(-8 * dt));
  }

  private animateHit(dt: number): void {
    this.flinch = Math.max(0, this.flinch - dt * 4);
    this.body.rotation.x = -this.flinch * 0.35;
    if (this.flash <= 0) return;
    this.flash = Math.max(0, this.flash - dt);
    // Acende enquanto pisca e devolve a cor-base só no quadro em que o piscar acaba (o drone muda o olho).
    for (const m of this.materials) {
      // Brilho moderado: acima do limiar do bloom o robô inteiro viraria um borrão branco.
      if (this.flash > 0) m.mat.emissive.setRGB(0.45, 0.28, 0.12);
      else m.mat.emissive.copy(m.emissive);
    }
  }

  /** Desmonta: cada peça vira detrito com física, voando para longe do último tiro. */
  explode(ctx: GameContext, dir: THREE.Vector3, force = 1): void {
    this.root.updateMatrixWorld(true);
    const meshes: THREE.Mesh[] = [];
    this.body.traverse((o) => {
      if (o instanceof THREE.Mesh) meshes.push(o);
    });
    let remaining = meshes.length;
    const release = (): void => {
      remaining -= 1;
      if (remaining === 0) this.materials.forEach((m) => m.mat.dispose());
    };
    const center = this.position.clone().setY(this.position.y + 1);
    for (const mesh of meshes) {
      ctx.fx.group.attach(mesh);
      const out = mesh.position.clone().sub(center).normalize();
      const vel = out
        .multiplyScalar(2 + ctx.rng() * 3 * force)
        .addScaledVector(dir, 3 * force)
        .add(new THREE.Vector3(0, 3 + ctx.rng() * 4 * force, 0));
      const spin = new THREE.Vector3(ctx.rng() - 0.5, ctx.rng() - 0.5, ctx.rng() - 0.5).multiplyScalar(14);
      mesh.geometry.computeBoundingSphere();
      const radius = Math.min(0.5, (mesh.geometry.boundingSphere?.radius ?? 0.2) * 0.6);
      ctx.fx.addDebris({ mesh, vel, spin, life: 5 + ctx.rng() * 2, radius, scale: mesh.scale.x, release });
    }
    this.root.removeFromParent();
  }

  /** Remove sem desmontar (troca de setor). */
  dispose(): void {
    this.root.removeFromParent();
    this.materials.forEach((m) => m.mat.dispose());
  }
}
