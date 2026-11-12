import * as THREE from 'three';
import { type AiMemory, initialMemory, stepAi, turnTowards } from '../rules/ai';
import type { HitPart } from '../rules/damage';
import { REST, type Spring, kick, updateSpring } from '../rules/spring';
import { CELL, type Grid, cellCenter, worldToCell } from '../level/grid';
import { type Cell, findPath } from '../level/nav';
import type { Box, CollisionWorld } from '../world/collision';
import { makeRayHit } from '../world/collision';
import { moveCircle } from '../world/move';
import type { AudioEngine } from '../audio/engine';
import type { EnemySfx } from '../audio/sfx';
import type { ParticleSystem } from '../fx/particles';
import type { Projectiles } from './projectiles';
import { type HitInfo, type Hittable, type RayTarget, raySphere } from './hittable';

/**
 * Base dos robôs: percepção (visão com linha de visada e audição de tiro), máquina de estados comum
 * (`rules/ai.ts`), navegação pela grade do setor com desvio de "preso na parede", e reação a tiro (faísca, recuo
 * e piscar). Cada tipo decide o comportamento em `behave`. Estado mutável de propósito: roda a 60 Hz.
 */
export type RobotKind = 'drone' | 'sentinel' | 'brute' | 'boss';

export interface EnemyServices {
  readonly sfx: EnemySfx;
  readonly audio: AudioEngine;
  readonly sparks: ParticleSystem;
  readonly smoke: ParticleSystem;
  readonly projectiles: Projectiles;
  /** O chefe chama drones de reforço; quem cria é o diretor. */
  spawnDrone(x: number, z: number): void;
  shake(amount: number): void;
}

export interface PlayerView {
  x: number;
  z: number;
  feetY: number;
  eyeY: number;
  crouched: boolean;
  vx: number;
  vz: number;
}

export interface EnemyFrame {
  readonly dt: number;
  readonly time: number;
  readonly world: CollisionWorld;
  readonly grid: Grid;
  readonly player: PlayerView;
  passable(col: number, row: number, flying: boolean): boolean;
  damagePlayer(amount: number, fromX: number, fromZ: number, pushX: number, pushZ: number): void;
}

export interface Hitbox {
  readonly part: HitPart;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly r: number;
}

const LOS_INTERVAL = 0.15;
const WHITE = new THREE.Color(1, 1, 1);
const PATROL_VIEW = 20;
const NO_TARGETS: readonly Hittable[] = [];
const REPATH_INTERVAL = 0.55;
const STUCK_WINDOW = 1;

export abstract class Robot implements Hittable {
  abstract readonly kind: RobotKind;
  readonly group = new THREE.Group();
  /** Filho de `group` que inclina com o recuo do tiro. */
  readonly body = new THREE.Group();
  /** Objetos que vivem na cena e não no grupo do robô (laser de mira, feixe, onda de choque). O diretor os adiciona e remove. */
  readonly sceneExtras: THREE.Object3D[] = [];
  x: number;
  y = 0;
  z: number;
  yaw = 0;
  vx = 0;
  vz = 0;
  health: number;
  mem: AiMemory = initialMemory();
  sees = false;
  flankAngle = 0;
  /** Entrou em combate neste quadro: o diretor avisa os vizinhos. */
  enteredCombat = false;
  lastSeenX: number;
  lastSeenZ: number;
  noiseX: number;
  noiseZ: number;
  readonly homeX: number;
  readonly homeZ: number;
  readonly lastHitDir = new THREE.Vector3(0, 0, 1);
  protected heard = false;
  protected allyCall = false;
  protected damaged = false;
  protected flash = 0;
  protected recoil: Spring = REST;
  protected knockX = 0;
  protected knockZ = 0;
  protected readonly flashMats: THREE.MeshStandardMaterial[] = [];
  protected abstract readonly hitboxes: readonly Hitbox[];
  protected abstract readonly radius: number;
  protected abstract readonly eyeHeight: number;
  protected abstract readonly flying: boolean;
  protected readonly viewRange: number = 36;
  protected readonly knockScale: number = 1;
  /** Força do piscar branco no acerto; o chefe, sempre sob fogo, pisca pouco para não virar um bloco branco. */
  protected readonly flashStrength: number = 1;
  protected readonly scratch: Box[] = [];
  private losTimer = Math.random() * LOS_INTERVAL;
  private path: Cell[] = [];
  private pathI = 0;
  private repath = 0;
  private pathGoal = -1;
  /** A última busca de caminho não achou rota. Quem chama decide o que fazer (outra cobertura, outro ponto). */
  protected noRoute = false;
  /** Contador de diagnóstico: quantas buscas de caminho falharam. Sem isso a falha não muda nada na saída. */
  static readonly diagnostics = { noRoute: 0 };
  private stuckTimer = 0;
  private stuckX = 0;
  private stuckZ = 0;
  private readonly ray = makeRayHit();
  private readonly hbWorld = new THREE.Vector3();

  constructor(x: number, z: number, maxHealth: number, protected readonly services: EnemyServices) {
    this.x = this.homeX = this.lastSeenX = this.noiseX = x;
    this.z = this.homeZ = this.lastSeenZ = this.noiseZ = z;
    this.health = maxHealth;
    this.group.add(this.body);
  }

  get alive(): boolean {
    return this.health > 0;
  }

  /** Material que pisca no acerto; cada robô tem os seus. */
  protected flashable(m: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
    this.flashMats.push(m);
    return m;
  }

  raycast(o: THREE.Vector3, d: THREE.Vector3, maxDist: number, out: RayTarget): boolean {
    let any = false;
    for (const h of this.hitboxes) {
      this.hbWorld.set(h.x, h.y, h.z).applyMatrix4(this.body.matrixWorld);
      if (raySphere(o, d, this.hbWorld.x, this.hbWorld.y, this.hbWorld.z, h.r, maxDist, h.part, out)) any = true;
    }
    return any;
  }

  frontalShieldAgainst(_shooter: THREE.Vector3): boolean {
    return false;
  }

  onHit(hit: HitInfo): void {
    if (!this.alive) return;
    this.damaged = true;
    this.lastHitDir.copy(hit.dir);
    if (hit.kind === 'blocked') {
      this.flash = Math.max(this.flash, 0.15);
      return;
    }
    this.health -= hit.damage;
    this.flash = 1;
    const push = Math.min(5, hit.damage * 0.14) * this.knockScale;
    this.knockX += hit.dir.x * push;
    this.knockZ += hit.dir.z * push;
    this.recoil = kick(this.recoil, Math.min(8, hit.damage * 0.3) * this.knockScale);
    if (Math.random() < 0.5) this.services.sfx.clank(hit.point.x, hit.point.y, hit.point.z);
  }

  hear(x: number, z: number): void {
    this.heard = true;
    this.noiseX = x;
    this.noiseZ = z;
  }

  callForHelp(x: number, z: number): void {
    if (this.mem.mode === 'combat') return;
    this.allyCall = true;
    this.noiseX = x;
    this.noiseZ = z;
  }

  update(f: EnemyFrame): void {
    this.perceive(f);
    const was = this.mem.mode;
    if (this.damaged) {
      // Quem leva tiro sabe de onde veio: o jogador vira o último ponto visto.
      this.lastSeenX = f.player.x;
      this.lastSeenZ = f.player.z;
    }
    this.mem = stepAi(this.mem, { sees: this.sees, heard: this.heard, allyCall: this.allyCall, damaged: this.damaged }, f.dt);
    this.enteredCombat = was !== 'combat' && this.mem.mode === 'combat';
    this.heard = this.allyCall = this.damaged = false;
    this.behave(f);
    this.applyKnock(f);
    this.recoil = updateSpring(this.recoil, 90, 12, f.dt);
    this.body.rotation.x = -this.recoil.offset * 0.04;
    this.flash = Math.max(0, this.flash - f.dt * 5);
    if (this.flash > 0 || this.flashMats[0]?.userData.lit) this.applyFlash();
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.y = this.yaw;
    this.group.updateMatrixWorld(true);
  }

  protected abstract behave(f: EnemyFrame): void;

  /** Pisca branco no acerto: mistura a cor de brilho de cada material com branco. */
  private applyFlash(): void {
    for (const m of this.flashMats) {
      const base = m.userData.baseColor as THREE.Color | undefined;
      // Material que não veio de `robotMaterial` não tem cor-base: pisca nada em vez de quebrar o laço.
      if (!base) continue;
      const f = this.flash * this.flashStrength;
      m.emissive.copy(base).lerp(WHITE, f * 0.7);
      m.emissiveIntensity = (m.userData.base as number) + f * 2;
      m.userData.lit = this.flash > 0;
    }
  }

  private perceive(f: EnemyFrame): void {
    this.losTimer -= f.dt;
    if (this.losTimer > 0) return;
    this.losTimer = LOS_INTERVAL;
    const p = f.player;
    const dx = p.x - this.x;
    const dz = p.z - this.z;
    const dist = Math.hypot(dx, dz);
    // Em patrulha enxerga menos longe: o jogador pode atravessar a sala sem ser visto de cara.
    let sees = dist < (this.mem.mode === 'combat' ? this.viewRange : PATROL_VIEW);
    // Fora de combate só vê o que está à frente.
    if (sees && this.mem.mode !== 'combat' && dist > 3) {
      const fx = Math.sin(this.yaw);
      const fz = Math.cos(this.yaw);
      sees = (fx * dx + fz * dz) / Math.max(1e-3, dist) > 0.25;
    }
    const ey = this.y + this.eyeHeight;
    sees &&= f.world.lineOfSight(this.x, ey, this.z, p.x, p.eyeY - 0.05, p.z, this.ray);
    this.sees = sees;
    if (sees) {
      this.lastSeenX = p.x;
      this.lastSeenZ = p.z;
    }
  }

  private applyKnock(f: EnemyFrame): void {
    if (Math.abs(this.knockX) + Math.abs(this.knockZ) < 0.01) return;
    moveCircle(f.world, this, this.knockX * f.dt, this.knockZ * f.dt, this.radius, this.y + 0.2, this.y + this.eyeHeight, this.scratch);
    const decay = Math.max(0, 1 - f.dt * 7);
    this.knockX *= decay;
    this.knockZ *= decay;
  }

  protected faceTowards(tx: number, tz: number, rate: number, dt: number): void {
    this.yaw = turnTowards(this.yaw, Math.atan2(tx - this.x, tz - this.z), rate * dt);
  }

  protected distanceToPlayer(f: EnemyFrame): number {
    return Math.hypot(f.player.x - this.x, f.player.z - this.z);
  }

  /** Célula livre mais próxima do alvo (o jogador pode estar em cima de uma caixa). */
  private nearestPassable(f: EnemyFrame, col: number, row: number): Cell | null {
    if (f.passable(col, row, this.flying)) return { col, row };
    for (let r = 1; r <= 3; r++) {
      for (let dr = -r; dr <= r; dr++) {
        for (let dc = -r; dc <= r; dc++) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) === r && f.passable(col + dc, row + dr, this.flying)) return { col: col + dc, row: row + dr };
        }
      }
    }
    return null;
  }

  /**
   * Anda até (tx, tz) pelo caminho da grade. Refaz o caminho de tempos em tempos e quando fica sem progresso:
   * é o que impede o robô de ficar preso numa quina. Devolve true quando chegou.
   */
  protected navigate(f: EnemyFrame, tx: number, tz: number, speed: number, accel = 8): boolean {
    const g = worldToCell(tx, tz);
    const goal = this.nearestPassable(f, g.col, g.row);
    if (!goal) return true;
    const goalKey = goal.row * f.grid.cols + goal.col;
    this.repath -= f.dt;
    if (this.repath <= 0 || goalKey !== this.pathGoal) {
      const here = worldToCell(this.x, this.z);
      const start = this.nearestPassable(f, here.col, here.row) ?? here;
      const found = findPath(f.grid, start, goal, (c, r) => f.passable(c, r, this.flying));
      this.noRoute = found === null;
      if (this.noRoute) Robot.diagnostics.noRoute++;
      this.path = found ?? [];
      this.pathI = Math.min(1, this.path.length - 1);
      this.pathGoal = goalKey;
      this.repath = REPATH_INTERVAL + Math.random() * 0.3;
    }
    // Sem rota (alvo atrás de porta fechada ou isolado): para em vez de andar reto contra a parede.
    if (this.noRoute) {
      this.stopMoving();
      return true;
    }
    const last = this.pathI >= this.path.length - 1;
    const wp = last ? null : this.path[this.pathI];
    const c = wp ? cellCenter(wp.col, wp.row) : { x: tx, z: tz };
    let dx = c.x - this.x;
    let dz = c.z - this.z;
    let dist = Math.hypot(dx, dz);
    if (!last && dist < CELL * 0.35) {
      this.pathI++;
      return false;
    }
    if (last && dist < 0.3) {
      this.vx *= 0.8;
      this.vz *= 0.8;
      return true;
    }
    dist = Math.max(dist, 1e-3);
    dx /= dist;
    dz /= dist;
    const k = Math.min(1, accel * f.dt);
    this.vx += (dx * speed - this.vx) * k;
    this.vz += (dz * speed - this.vz) * k;
    moveCircle(f.world, this, this.vx * f.dt, this.vz * f.dt, this.radius, this.y + 0.2, this.y + this.eyeHeight, this.scratch);
    this.checkStuck(f);
    return false;
  }

  private checkStuck(f: EnemyFrame): void {
    this.stuckTimer += f.dt;
    if (this.stuckTimer < STUCK_WINDOW) return;
    const moved = Math.hypot(this.x - this.stuckX, this.z - this.stuckZ);
    if (moved < 0.25) {
      // Sem progresso: refaz o caminho já e dá um passo de lado para soltar da quina.
      this.repath = 0;
      const a = Math.random() * Math.PI * 2;
      this.knockX += Math.cos(a) * 2;
      this.knockZ += Math.sin(a) * 2;
    }
    this.stuckTimer = 0;
    this.stuckX = this.x;
    this.stuckZ = this.z;
  }

  protected stopMoving(): void {
    this.vx *= 0.8;
    this.vz *= 0.8;
  }

  /** Ponto de patrulha aleatório perto de casa. */
  protected patrolPoint(f: EnemyFrame, radiusCells: number): { x: number; z: number } {
    const home = worldToCell(this.homeX, this.homeZ);
    for (let i = 0; i < 12; i++) {
      const col = home.col + Math.round((Math.random() * 2 - 1) * radiusCells);
      const row = home.row + Math.round((Math.random() * 2 - 1) * radiusCells);
      if (f.passable(col, row, this.flying)) return cellCenter(col, row);
    }
    return { x: this.homeX, z: this.homeZ };
  }

  /** Alvos extras que o robô cria (os mísseis do chefe, que o jogador pode derrubar a tiro). */
  extraTargets(): readonly Hittable[] {
    return NO_TARGETS;
  }

  /** Raio do corpo no chão; o diretor usa para separar robôs que se sobrepõem. */
  get bodyRadius(): number {
    return this.radius;
  }

  get isFlying(): boolean {
    return this.flying;
  }

  /** Empurra o robô respeitando as paredes (separação entre robôs e do jogador). */
  nudge(world: CollisionWorld, dx: number, dz: number): void {
    moveCircle(world, this, dx, dz, this.radius, this.y + 0.2, this.y + this.eyeHeight, this.scratch);
  }

  /** Centro do corpo, de onde saem os pedaços na morte. */
  center(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.x, this.y + this.eyeHeight * 0.6, this.z);
  }

  /** Som contínuo, se houver; o diretor chama ao remover o robô. */
  dispose(): void {
    // Os tipos com som contínuo sobrescrevem.
  }
}

/** Material de robô que pisca; guarda a intensidade base do brilho para voltar a ela. */
export function robotMaterial(color: number, emissive = 0x000000, emissiveIntensity = 1, metalness = 0.7, roughness = 0.4): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity, metalness, roughness });
  m.userData.base = emissiveIntensity;
  m.userData.baseColor = new THREE.Color(emissive);
  return m;
}
