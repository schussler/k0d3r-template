import * as THREE from 'three';
import { flankAngles } from '../rules/ai';
import { type Drop, rollDrop } from '../rules/drops';
import { type Grid, cellCenter } from '../level/grid';
import type { Debris } from '../fx/debris';
import type { CollisionWorld } from '../world/collision';
import { Brute } from './brute';
import { Drone } from './drone';
import type { Hittable } from './hittable';
import { type EnemyFrame, type EnemyServices, type PlayerView, Robot } from './robot';
import { Sentinel } from './sentinel';

/**
 * Diretor dos robôs de um setor: cria a partir do mapa, repassa o tiro ouvido, avisa os vizinhos quando um entra
 * em combate, distribui os ângulos de flanco, separa quem se sobrepõe e trata a morte (pedaços e drops).
 */
const FLANK_INTERVAL = 1;
const HELP_RADIUS = 22;
const SEPARATION_PAD = 0.1;
const DEATH_POWER: Readonly<Record<Robot['kind'], number>> = { drone: 4.5, sentinel: 5, brute: 4, boss: 7 };
const DEATH_SIZE: Readonly<Record<Robot['kind'], number>> = { drone: 0.6, sentinel: 0.85, brute: 1.1, boss: 2.2 };
const FLASH = new THREE.Color(1, 0.65, 0.25);

export interface DirectorContext {
  readonly dt: number;
  readonly time: number;
  readonly world: CollisionWorld;
  readonly grid: Grid;
  readonly player: PlayerView;
  readonly passable: (col: number, row: number, flying: boolean) => boolean;
  readonly damagePlayer: (amount: number, fromX: number, fromZ: number, pushX: number, pushZ: number) => void;
}

export class Director {
  readonly root = new THREE.Group();
  readonly robots: Robot[] = [];
  /** Cópia reaproveitada para o tiro do jogador: não aloca por quadro. */
  readonly hittables: Hittable[] = [];
  private flankTimer = 0;
  onDrop: (drop: Drop, x: number, z: number) => void = () => undefined;
  onDeath: (robot: Robot) => void = () => undefined;
  rng: () => number = Math.random;

  constructor(
    private readonly services: EnemyServices,
    private readonly debris: Debris,
  ) {}

  /** Cria drones, sentinelas e brutamontes do mapa. O chefe é criado pelo jogo. */
  spawnFromGrid(grid: Grid): void {
    for (const e of grid.entities) {
      const c = cellCenter(e.col, e.row);
      if (e.kind === 'drone') this.add(new Drone(c.x, c.z, this.services));
      else if (e.kind === 'sentinel') this.add(new Sentinel(c.x, c.z, this.services));
      else if (e.kind === 'brute') this.add(new Brute(c.x, c.z, this.services));
    }
  }

  add<T extends Robot>(r: T): T {
    this.robots.push(r);
    this.root.add(r.group);
    if (r instanceof Sentinel) this.root.add(r.laserMesh);
    return r;
  }

  get aliveCount(): number {
    let n = 0;
    for (const r of this.robots) if (r.alive) n++;
    return n;
  }

  /** O tiro do jogador é ouvido por perto; atrás de parede, o alcance cai. */
  hearShot(x: number, z: number, radius: number, world: CollisionWorld, eyeY: number): void {
    for (const r of this.robots) {
      if (!r.alive) continue;
      const d = Math.hypot(r.x - x, r.z - z);
      if (d > radius) continue;
      const clear = world.lineOfSight(x, eyeY, z, r.x, r.y + 1.2, r.z, SCRATCH_HIT);
      if (clear || d < radius * 0.55) r.hear(x, z);
    }
  }

  update(ctx: DirectorContext): void {
    const frame: EnemyFrame = {
      dt: ctx.dt, time: ctx.time, world: ctx.world, grid: ctx.grid, player: ctx.player,
      passable: ctx.passable, damagePlayer: ctx.damagePlayer,
    };
    for (const r of this.robots) if (r.alive) r.update(frame);
    this.callAllies();
    this.flankTimer -= ctx.dt;
    if (this.flankTimer <= 0) {
      this.assignFlanks(ctx.player);
      this.flankTimer = FLANK_INTERVAL;
    }
    this.separate(ctx);
    this.reap();
  }

  /** Quem entra em combate chama os vizinhos próximos. */
  private callAllies(): void {
    for (const r of this.robots) {
      if (!r.alive || !r.enteredCombat) continue;
      for (const o of this.robots) {
        if (o === r || !o.alive) continue;
        if (Math.hypot(o.x - r.x, o.z - r.z) < HELP_RADIUS) o.callForHelp(r.lastSeenX, r.lastSeenZ);
      }
      this.services.sfx.alert(r.x, r.y + 1, r.z, r.kind === 'brute' || r.kind === 'boss');
    }
  }

  /** Os robôs em combate se espalham em leque ao redor do jogador em vez de vir em fila. */
  private assignFlanks(player: PlayerView): void {
    const fighting = this.robots.filter((r) => r.alive && r.mem.mode === 'combat' && r.kind !== 'boss');
    if (fighting.length === 0) return;
    let cx = 0;
    let cz = 0;
    for (const r of fighting) {
      cx += r.x;
      cz += r.z;
    }
    const base = Math.atan2(cx / fighting.length - player.x, cz / fighting.length - player.z);
    const angles = flankAngles(fighting.length, base);
    const norm = (a: number) => Math.atan2(Math.sin(a - base), Math.cos(a - base));
    const sorted = [...fighting].sort((a, b) => norm(Math.atan2(a.x - player.x, a.z - player.z)) - norm(Math.atan2(b.x - player.x, b.z - player.z)));
    sorted.forEach((r, i) => {
      r.flankAngle = angles[i] ?? base;
    });
  }

  private separate(ctx: DirectorContext): void {
    const list = this.robots;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a?.alive) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (!b?.alive || a.isFlying !== b.isFlying) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const min = a.bodyRadius + b.bodyRadius + SEPARATION_PAD;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const push = (min - d) * 0.5;
        a.nudge(ctx.world, (-dx / d) * push, (-dz / d) * push);
        b.nudge(ctx.world, (dx / d) * push, (dz / d) * push);
      }
      if (!a.isFlying) {
        const dx = a.x - ctx.player.x;
        const dz = a.z - ctx.player.z;
        const min = a.bodyRadius + 0.4;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min && d2 > 0) {
          const d = Math.sqrt(d2);
          a.nudge(ctx.world, (dx / d) * (min - d), (dz / d) * (min - d));
        }
      }
    }
  }

  /** Morte: pedaços com física, explosão, faíscas e, às vezes, munição ou vida. */
  private reap(): void {
    this.hittables.length = 0;
    for (let i = this.robots.length - 1; i >= 0; i--) {
      const r = this.robots[i];
      if (!r) continue;
      if (r.alive) {
        this.hittables.push(r);
        continue;
      }
      const center = r.center(new THREE.Vector3());
      this.debris.burst(r.group, center, r.lastHitDir, DEATH_POWER[r.kind]);
      this.services.sfx.explode(r.x, center.y, r.z, DEATH_SIZE[r.kind]);
      this.services.sparks.emit({ count: 40, x: center.x, y: center.y, z: center.z, nx: 0, ny: 1, nz: 0, speed: 7, spread: 2, color: FLASH, size: 0.08, life: 0.6, gravity: 9, drag: 1 });
      this.services.smoke.emit({ count: 10, x: center.x, y: center.y, z: center.z, nx: 0, ny: 1, nz: 0, speed: 2, spread: 1.5, color: SMOKE, size: 0.5, life: 1.4, gravity: -0.6, drag: 1.5, grow: 3 });
      this.services.shake(r.kind === 'boss' ? 1 : 0.15);
      r.dispose();
      this.root.remove(r.group);
      this.robots.splice(i, 1);
      if (r.kind !== 'boss') {
        const drop = rollDrop(this.rng());
        if (drop) this.onDrop(drop, r.x, r.z);
      }
      this.onDeath(r);
    }
  }

  clear(): void {
    for (const r of this.robots) {
      r.dispose();
      this.root.remove(r.group);
    }
    this.robots.length = 0;
    this.hittables.length = 0;
  }
}

const SCRATCH_HIT = { dist: 0, x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, surface: 'floor' as const };
const SMOKE = new THREE.Color(0.3, 0.3, 0.32);
