import * as THREE from 'three';
import { Boss } from '../enemies/boss';
import { Brute } from '../enemies/brute';
import { Drone } from '../enemies/drone';
import type { Enemy } from '../enemies/enemy';
import { Sentinel } from '../enemies/sentinel';
import { assignFlankTargets } from '../logic/ai';
import { raySphere, raycastGrid, type RayHit } from '../logic/collision';
import type { HitZone } from '../logic/combat';
import { CELL, parseLevel, type EnemyKind, type LevelData, type PickupKind } from '../logic/level';
import type { SectorDef } from '../logic/maps';
import { buildSector, type SectorVisual, type SwitchVisual } from '../world/build-level';
import { glowTexture } from '../world/textures';
import type { GameContext } from './context';
import { Projectiles } from './projectiles';

const DOOR_TIME = 0.9;
const DIRECTOR_INTERVAL = 0.5;
const PICKUP_RADIUS = 1.3;
const INTERACT_RANGE = 2.4;
/** Distância em que um robô que entra em combate avisa os vizinhos. */
const SHOUT_RADIUS = 14;

export interface Pickup {
  readonly kind: PickupKind;
  readonly mesh: THREE.Group;
  readonly base: THREE.Vector3;
  taken: boolean;
}

export interface EnemyHit {
  readonly enemy: Enemy;
  readonly zone: HitZone;
  readonly t: number;
}

const pickupMats = {
  white: new THREE.MeshStandardMaterial({ color: 0xe8edf2, roughness: 0.4, metalness: 0.3 }),
  red: new THREE.MeshBasicMaterial({ color: 0xff3838 }),
  olive: new THREE.MeshStandardMaterial({ color: 0x4f5a3a, roughness: 0.6, metalness: 0.4 }),
  brass: new THREE.MeshStandardMaterial({ color: 0xd9a441, roughness: 0.3, metalness: 0.9 }),
  gun: new THREE.MeshStandardMaterial({ color: 0x2b3036, roughness: 0.35, metalness: 0.85 }),
  orange: new THREE.MeshStandardMaterial({ color: 0xc8611c, roughness: 0.45, metalness: 0.5 }),
  grip: new THREE.MeshStandardMaterial({ color: 0x3a2f28, roughness: 0.85 }),
};
const pickupGlow: Readonly<Record<PickupKind, number>> = { health: 0xff5050, ammo: 0xffc040, rifle: 0x5fd0ff, shotgun: 0x5fd0ff };

function boxMesh(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

function pickupModel(kind: PickupKind): THREE.Group {
  const g = new THREE.Group();
  if (kind === 'health') {
    g.add(boxMesh(0.5, 0.36, 0.36, pickupMats.white));
    g.add(boxMesh(0.12, 0.3, 0.38, pickupMats.red), boxMesh(0.3, 0.12, 0.38, pickupMats.red));
  } else if (kind === 'ammo') {
    g.add(boxMesh(0.55, 0.3, 0.35, pickupMats.olive));
    for (let n = 0; n < 4; n++) g.add(boxMesh(0.06, 0.16, 0.06, pickupMats.brass, -0.18 + n * 0.12, 0.22, 0));
  } else if (kind === 'rifle') {
    g.add(boxMesh(0.08, 0.1, 0.9, pickupMats.gun), boxMesh(0.06, 0.16, 0.1, pickupMats.orange, 0, -0.12, -0.1));
    g.add(boxMesh(0.06, 0.12, 0.25, pickupMats.grip, 0, -0.02, 0.4));
  } else {
    g.add(boxMesh(0.07, 0.07, 1.0, pickupMats.gun), boxMesh(0.09, 0.09, 0.3, pickupMats.grip, 0, -0.05, 0.4));
    g.add(boxMesh(0.08, 0.08, 0.2, pickupMats.grip, 0, -0.06, -0.15));
  }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: pickupGlow[kind], transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.set(1.4, 1.4, 1);
  g.add(glow);
  return g;
}

export function createEnemy(kind: EnemyKind): Enemy {
  switch (kind) {
    case 'drone':
      return new Drone();
    case 'sentinel':
      return new Sentinel();
    case 'brute':
      return new Brute();
    case 'boss':
      return new Boss();
  }
}

/**
 * Setor em execução: mapa, visual, robôs, itens, portas e interruptores. Recriado do zero em cada
 * entrada e em cada "Tentar de novo" (os dados do mapa são a fonte).
 */
export class Sector {
  readonly level: LevelData;
  readonly visual: SectorVisual;
  readonly group = new THREE.Group();
  readonly projectiles = new Projectiles();
  readonly enemies: Enemy[] = [];
  readonly pickups: Pickup[] = [];
  private readonly doorProgress = new Map<string, number>();
  private readonly switchOn = new Set<SwitchVisual>();
  private directorTimer = 0;
  boss: Boss | null = null;
  /** Maior tempo preso de qualquer robô do setor, inclusive dos que já morreram. */
  maxStuck = 0;

  constructor(readonly def: SectorDef) {
    this.level = parseLevel(def.rows);
    this.visual = buildSector(def, this.level);
    this.group.add(this.visual.group, this.projectiles.group);
  }

  get grid() {
    return this.level.grid;
  }

  get ceiling(): number {
    return this.def.ceiling;
  }

  populate(ctx: GameContext): void {
    for (const spawn of this.level.enemies) {
      const c = this.grid.cellCenter(spawn.cell);
      this.spawnEnemy(spawn.kind, c.x, c.z, ctx);
    }
    for (const spawn of this.level.pickups) {
      const c = this.grid.cellCenter(spawn.cell);
      this.addPickup(spawn.kind, new THREE.Vector3(c.x, 0.7, c.z));
    }
  }

  spawnEnemy(kind: EnemyKind, x: number, z: number, ctx: GameContext): Enemy {
    const enemy = createEnemy(kind);
    enemy.placeAt(x, z, ctx);
    this.enemies.push(enemy);
    this.group.add(enemy.root);
    if (enemy instanceof Boss) this.boss = enemy;
    if (kind === 'drone' && this.boss) {
      // Drone chamado pelo chefe já nasce caçando.
      enemy.alertTo(ctx.player.position);
      ctx.fx.glow(enemy.position, new THREE.Color(0x5fd0ff), 2, 0.4);
    }
    return enemy;
  }

  addPickup(kind: PickupKind, at: THREE.Vector3): void {
    const mesh = pickupModel(kind);
    mesh.position.copy(at);
    this.group.add(mesh);
    this.pickups.push({ kind, mesh, base: at.clone(), taken: false });
  }

  countAlive(kind: EnemyKind): number {
    return this.enemies.filter((e) => e.alive && e.kind === kind).length;
  }

  /** Interruptor ao alcance e na frente da jogadora, ainda desligado. */
  interactable(eye: THREE.Vector3, look: THREE.Vector3): SwitchVisual | null {
    for (const s of this.visual.switches) {
      if (this.switchOn.has(s)) continue;
      const to = s.position.clone().sub(eye);
      const dist = to.length();
      if (dist > INTERACT_RANGE) continue;
      if (to.normalize().dot(look) > 0.55) return s;
    }
    return null;
  }

  activate(s: SwitchVisual, ctx: GameContext): void {
    if (this.switchOn.has(s)) return;
    this.switchOn.add(s);
    s.screen.color.setHex(0x3dff7a);
    s.beacon.visible = false;
    this.doorProgress.set(s.spawn.door, 0);
    ctx.audio.switchOn(s.position);
    const door = this.visual.doors.get(s.spawn.door);
    if (door) ctx.audio.door(door.center);
  }

  /** Todas as portas abertas por interruptor (atalho do `?debug`). */
  activateAll(ctx: GameContext): void {
    this.visual.switches.forEach((s) => this.activate(s, ctx));
  }

  isOnExit(pos: THREE.Vector3): boolean {
    const c = this.grid.worldToCell(pos.x, pos.z);
    return this.grid.charAt(c.i, c.j) === 'x';
  }

  /** Ruído de tiro: robôs no raio entram em alerta. */
  emitNoise(source: THREE.Vector3, radius: number, ctx: GameContext): void {
    for (const e of this.enemies) e.hear(source, radius, ctx);
  }

  /** Primeiro robô atingido pelo raio antes de `maxT` (geralmente a distância até a parede). */
  raycastEnemies(origin: THREE.Vector3, dir: THREE.Vector3, maxT: number): EnemyHit | null {
    let best: EnemyHit | null = null;
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      // Descarte rápido pela esfera envolvente do robô.
      const bound = raySphere(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, enemy.position.x, enemy.position.y + 2, enemy.position.z, enemy.kind === 'boss' ? 7 : 2.6);
      if (bound === null || bound > (best?.t ?? maxT)) continue;
      const hit = this.closestZone(enemy, origin, dir);
      if (hit && hit.t < (best?.t ?? maxT)) best = hit;
    }
    return best;
  }

  /** Zona mais próxima no raio; cabeça e pontos fracos ganham do corpo quando quase empatam. */
  private closestZone(enemy: Enemy, origin: THREE.Vector3, dir: THREE.Vector3): EnemyHit | null {
    const center = new THREE.Vector3();
    const hits: EnemyHit[] = [];
    for (const z of enemy.zones) {
      z.object.getWorldPosition(center);
      const t = raySphere(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, center.x, center.y, center.z, z.radius);
      if (t !== null) hits.push({ enemy, zone: z.zone, t });
    }
    if (hits.length === 0) return null;
    const nearest = hits.reduce((a, b) => (b.t < a.t ? b : a));
    if (nearest.zone !== 'body') return nearest;
    const special = hits.filter((h) => h.zone !== 'body' && h.t < nearest.t + 0.05);
    return special.length > 0 ? special.reduce((a, b) => (b.t < a.t ? b : a)) : nearest;
  }

  raycastWorld(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): RayHit | null {
    return raycastGrid(this.grid, origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, maxDist, this.ceiling, 'bullet');
  }

  /** 1 quando algum robô está em combate (a música acelera), 0 caso contrário. */
  combatIntensity(): number {
    return this.enemies.some((e) => e.alive && e.state === 'combat') ? 1 : 0;
  }

  update(dt: number, time: number, ctx: GameContext): Pickup[] {
    this.visual.update(time, dt);
    this.updateDoors(dt);
    this.directorTimer -= dt;
    if (this.directorTimer <= 0) {
      this.directorTimer = DIRECTOR_INTERVAL;
      this.direct(ctx);
    }
    for (const e of this.enemies) {
      e.update(dt, ctx);
      this.maxStuck = Math.max(this.maxStuck, e.longestStuck);
    }
    this.separate();
    for (let n = this.enemies.length - 1; n >= 0; n--) if (!this.enemies[n]!.alive) this.enemies.splice(n, 1);
    this.projectiles.update(dt, this.grid, ctx);
    return this.updatePickups(time, ctx);
  }

  /** Todas as portas do setor abertas (passáveis). */
  get allDoorsOpen(): boolean {
    return [...this.level.doors.keys()].every((id) => this.grid.doorAmount(id) >= 0.7);
  }

  /** Alguma porta abrindo neste quadro (as sombras estáticas precisam ser refeitas). */
  get doorsMoving(): boolean {
    for (const p of this.doorProgress.values()) if (p < 1) return true;
    return false;
  }

  private updateDoors(dt: number): void {
    for (const [id, progress] of this.doorProgress) {
      if (progress >= 1) continue;
      const next = Math.min(1, progress + dt / DOOR_TIME);
      this.doorProgress.set(id, next);
      this.grid.setDoorOpen(id, next);
      const door = this.visual.doors.get(id);
      if (!door) continue;
      const eased = next * next * (3 - 2 * next);
      for (const m of door.meshes) m.position.y = door.height / 2 + eased * (door.height - 0.15);
    }
  }

  /** Diretor de cerco: distribui vagas em volta da jogadora e espalha o alerta entre vizinhos. */
  private direct(ctx: GameContext): void {
    const fighters = this.enemies.filter((e) => e.alive && e.state === 'combat' && e.kind !== 'boss');
    const ranges: Readonly<Record<EnemyKind, number>> = { drone: 8, sentinel: 16, brute: 2.5, boss: 0 };
    const targets = assignFlankTargets(
      this.grid,
      ctx.player.position,
      fighters.map((e) => ({ id: e.id, x: e.position.x, z: e.position.z, range: ranges[e.kind], fly: e.fly })),
    );
    for (const e of fighters) e.flankTarget = targets.get(e.id) ?? null;
    for (const f of fighters) {
      for (const e of this.enemies) {
        if (e !== f && e.state !== 'combat' && e.position.distanceTo(f.position) < SHOUT_RADIUS) e.alertTo(ctx.player.position);
      }
    }
  }

  /** Robôs de chão não se sobrepõem: empurrão simples par a par. */
  private separate(): void {
    const list = this.enemies;
    for (let a = 0; a < list.length; a++) {
      for (let b = a + 1; b < list.length; b++) {
        const ea = list[a]!;
        const eb = list[b]!;
        if (ea.fly !== eb.fly || !ea.alive || !eb.alive) continue;
        const min = ea.kind === 'brute' || eb.kind === 'brute' ? 1.6 : 1;
        const dx = eb.position.x - ea.position.x;
        const dz = eb.position.z - ea.position.z;
        const d = Math.hypot(dx, dz);
        if (d >= min || d < 1e-4) continue;
        const push = (min - d) * 0.5;
        const heavyA = ea.kind === 'boss' || ea.kind === 'brute' ? 0.2 : 1;
        const heavyB = eb.kind === 'boss' || eb.kind === 'brute' ? 0.2 : 1;
        ea.position.x -= (dx / d) * push * heavyA;
        ea.position.z -= (dz / d) * push * heavyA;
        eb.position.x += (dx / d) * push * heavyB;
        eb.position.z += (dz / d) * push * heavyB;
      }
    }
  }

  private updatePickups(time: number, ctx: GameContext): Pickup[] {
    const touched: Pickup[] = [];
    const p = ctx.player.position;
    for (const item of this.pickups) {
      if (item.taken) continue;
      item.mesh.position.y = item.base.y + Math.sin(time * 2.5 + item.base.x) * 0.12;
      item.mesh.rotation.y = time * 1.4 + item.base.z;
      if (Math.hypot(p.x - item.base.x, p.z - item.base.z) < PICKUP_RADIUS && p.y < item.base.y + 1) touched.push(item);
    }
    return touched;
  }

  takePickup(item: Pickup): void {
    item.taken = true;
    item.mesh.removeFromParent();
  }

  /** Posição de um ponto da saída (atalho do `?debug`). */
  exitPoint(): THREE.Vector3 | null {
    const exit = this.level.exits[0];
    if (!exit) return null;
    return new THREE.Vector3(exit.i * CELL + CELL / 2, 0, exit.j * CELL + CELL / 2);
  }

  dispose(): void {
    for (const p of this.pickups) {
      p.mesh.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
        if (o instanceof THREE.Sprite) o.material.dispose();
      });
    }
    this.enemies.forEach((e) => e.dispose());
    this.enemies.length = 0;
    this.projectiles.clear();
    this.group.removeFromParent();
    this.visual.dispose();
  }
}
