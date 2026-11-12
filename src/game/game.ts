import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { AudioEngine } from '../audio/engine';
import { EnemySfx, Sfx } from '../audio/sfx';
import { Director } from '../enemies/director';
import { Drone } from '../enemies/drone';
import { Projectiles } from '../enemies/projectiles';
import type { EnemyServices, PlayerView } from '../enemies/robot';
import type { Hittable } from '../enemies/hittable';
import { TrainingTarget } from '../enemies/target';
import { Debris } from '../fx/debris';
import { Decals } from '../fx/decals';
import { ParticleSystem } from '../fx/particles';
import { Shells } from '../fx/shells';
import { Tracers } from '../fx/tracers';
import { type BuiltLevel, buildLevel } from '../level/build';
import { type Grid, cellCenter, isLowCover, isOpenTile, parseGrid, tileAt, worldToCell } from '../level/grid';
import { SECTORS, type SectorDef } from '../level/sectors';
import { THEMES } from '../level/themes';
import { Gunplay } from '../player/gunplay';
import { PlayerRig } from '../player/rig';
import { Viewmodel } from '../player/viewmodel';
import { createBackdrop, type Backdrop } from '../render/space';
import { WEAPONS, addAmmo, createArsenal, giveWeapon } from '../rules/arsenal';
import type { Drop } from '../rules/drops';
import { MAX_HEALTH, MAX_SHIELD, type Vitals, damagePlayer as applyDamage, fullVitals, heal, isDead, tickVitals } from '../rules/vitals';
import { Hud } from '../ui/hud';
import { Screens } from '../ui/screens';
import { Input } from './input';
import { type Pickup, type PickupKind, collect, makePickup, updatePickups } from './pickups';

export type Mode = 'title' | 'playing' | 'paused' | 'dead' | 'error';

const AMMO_PICKUP = { pistol: 0, rifle: 45, shotgun: 8 } as const;
const HEALTH_PICKUP = 35;
const OPEN_DOOR_PROGRESS = 0.7;

/** O jogo: cena, setor atual, jogador, robôs, efeitos, HUD e telas, e a máquina de modos. */
export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(78, 1, 0.05, 600);
  readonly input: Input;
  readonly audio = new AudioEngine();
  readonly sfx = new Sfx(this.audio);
  readonly enemySfx = new EnemySfx(this.audio);
  readonly hud: Hud;
  readonly screens: Screens;
  readonly rig: PlayerRig;
  readonly vm: Viewmodel;
  readonly sparks = new ParticleSystem(900, true, 0.0);
  readonly smoke = new ParticleSystem(300, false, 0.2);
  private readonly tracers = new Tracers();
  private readonly decals = new Decals();
  private readonly shells = new Shells();
  private readonly debris = new Debris();
  private readonly projectiles = new Projectiles(this.sparks);
  private readonly backdrop: Backdrop;
  readonly director: Director;
  private level!: BuiltLevel;
  private grid!: Grid;
  private sector!: SectorDef;
  private targets: TrainingTarget[] = [];
  private pickups: Pickup[] = [];
  private readonly levelRoot = new THREE.Group();
  private readonly hittables: Hittable[] = [];
  private readonly playerView: PlayerView = { x: 0, z: 0, feetY: 0, eyeY: 0, crouched: false, vx: 0, vz: 0 };
  private readonly playerBody = { x: 0, z: 0, feetY: 0, headY: 0 };
  mode: Mode = 'title';
  private time = 0;
  vitals: Vitals = fullVitals();
  god = false;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.autoClear = false;
    this.renderer.setClearColor(0x02040a);
    container.appendChild(this.renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.environment = env;
    this.vm = new Viewmodel(env);
    this.vm.scene.add(this.shells.vmMesh);
    this.backdrop = createBackdrop();

    const services: EnemyServices = {
      sfx: this.enemySfx, audio: this.audio, sparks: this.sparks, smoke: this.smoke, projectiles: this.projectiles,
      spawnDrone: (x, z) => this.director.add(new Drone(x, z, services)),
      shake: (a) => this.rig.shake.add(a),
    };
    this.director = new Director(services, this.debris);
    this.director.onDrop = (drop, x, z) => this.dropPickup(drop, x, z);
    this.scene.add(
      this.backdrop.group, this.levelRoot, this.director.root, this.debris.root, this.sparks.points, this.smoke.points,
      this.tracers.mesh, this.decals.mesh, this.shells.worldMesh, this.projectiles.mesh,
    );

    this.input = new Input(this.renderer.domElement);
    this.hud = new Hud(container);
    this.screens = new Screens(container);
    const gunplay = new Gunplay(this.sparks, this.smoke, this.tracers, this.decals);
    this.sector = SECTORS[0] as SectorDef;
    this.loadSector(this.sector);
    this.rig = new PlayerRig(this.level.world, this.camera, this.vm, gunplay, this.shells, this.sfx, this.audio);
    this.shells.onBounce = (x, y, z, heavy) => this.sfx.brass(x, y, z, heavy);
    this.debris.onImpact = (x, y, z) => this.enemySfx.clank(x, y, z);
    this.projectiles.onImpact = (x, y, z) => this.sfx.impact(x, y, z, 'metal');
    this.respawn();

    this.input.onLockChange = (locked) => this.onLockChange(locked);
    this.screens.onAction = (id) => void this.onAction(id);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.mode === 'playing') this.pause();
    });
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.showTitle();
  }

  private loadSector(def: SectorDef): void {
    this.levelRoot.clear();
    this.level?.dispose();
    this.director.clear();
    this.debris.clear();
    this.projectiles.clear();
    this.grid = parseGrid(def.map);
    const theme = THEMES[def.id];
    this.level = buildLevel(this.grid, theme);
    this.levelRoot.add(this.level.group);
    this.scene.fog = new THREE.FogExp2(theme.fogColor, theme.fogDensity);
    this.scene.environmentIntensity = theme.envIntensity;
    this.renderer.toneMappingExposure = theme.exposure;
    this.audio.setReverb(...theme.reverb);
    const spawn = this.level.spawn;
    this.targets = this.grid.entities.filter((e) => e.kind === 'target').map((e) => {
      const c = cellCenter(e.col, e.row);
      const t = new TrainingTarget(c.x, c.z, Math.atan2(spawn.x - c.x, spawn.z - c.z));
      this.levelRoot.add(t.group);
      return t;
    });
    this.pickups = this.grid.entities.flatMap((e) => {
      if (e.kind !== 'ammo' && e.kind !== 'health' && e.kind !== 'rifle' && e.kind !== 'shotgun') return [];
      const c = cellCenter(e.col, e.row);
      const p = makePickup(e.kind, c.x, c.z);
      this.levelRoot.add(p.mesh);
      return [p];
    });
    this.director.spawnFromGrid(this.grid);
    this.decals.clear();
    this.sparks.clear();
    this.smoke.clear();
    this.shells.clear();
    this.rig?.controller.setWorld(this.level.world);
  }

  private respawn(): void {
    const s = this.level.spawn;
    this.rig.controller.place(s.x, s.z, s.yaw);
    this.rig.reset(createArsenal());
    this.vitals = fullVitals();
  }

  private resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.vm.setAspect(w / h);
    this.sparks.setScale(h);
    this.smoke.setScale(h);
  }

  private showTitle(): void {
    this.mode = 'title';
    this.hud.setVisible(false);
    this.screens.show('title', {
      kicker: 'ÓRBITA DE KEPLER-442B · DIA 61',
      title: 'ESTAÇÃO KEPLER',
      body: 'A inteligência da estação virou os robôs de manutenção contra a tripulação. Você é a última técnica acordada. Atravesse a estação até o núcleo e desligue-a.',
      actions: [{ id: 'play', label: 'JOGAR' }],
      hint: 'WASD mover · Espaço pular · Ctrl/C agachar · Shift correr · 1 2 3 ou roda trocar arma · R recarregar · Esc pausar',
    });
  }

  private pause(): void {
    if (this.mode !== 'playing') return;
    this.mode = 'paused';
    this.screens.show('pause', {
      kicker: 'SISTEMA EM ESPERA',
      title: 'PAUSADO',
      actions: [{ id: 'resume', label: 'CONTINUAR' }, { id: 'restart', label: 'RECOMEÇAR SETOR' }, { id: 'title', label: 'SAIR PARA O TÍTULO' }],
      hint: 'Clique em continuar para travar o mouse de novo.',
    });
  }

  private die(): void {
    this.mode = 'dead';
    this.input.releaseLock();
    this.hud.setVisible(false);
    this.screens.show('death', {
      kicker: 'SINAIS VITAIS PERDIDOS',
      title: 'VOCÊ MORREU',
      actions: [{ id: 'retry', label: 'TENTAR DE NOVO' }, { id: 'title', label: 'TÍTULO' }],
      hint: 'Tentar de novo recomeça o setor.',
    });
  }

  private onLockChange(locked: boolean): void {
    if (!locked && this.mode === 'playing') this.pause();
  }

  private async onAction(id: string): Promise<void> {
    this.sfx.ui();
    if (id === 'play' || id === 'resume' || id === 'restart' || id === 'retry') {
      await this.audio.unlock();
      if (id !== 'resume') {
        this.loadSector(this.sector);
        this.respawn();
      }
      const ok = await this.input.requestLock();
      if (!ok) {
        this.mode = 'playing';
        this.pause();
        return;
      }
      this.screens.hide();
      this.hud.setVisible(true);
      this.mode = 'playing';
    } else if (id === 'title') {
      this.input.releaseLock();
      this.showTitle();
    }
  }

  /** Dá todas as armas (atalho de desenvolvimento para testar a sensação de tiro). */
  giveAll(): void {
    let a = this.rig.arsenal;
    for (const w of ['rifle', 'shotgun'] as const) a = giveWeapon(a, w);
    this.rig.arsenal = a;
  }

  /** Atalho de desenvolvimento: elimina os robôs do setor. */
  killAll(): void {
    for (const r of this.director.robots) r.health = 0;
  }

  frame(dt: number, now: number): void {
    this.time = now;
    this.backdrop.update(dt);
    if (this.mode === 'playing') this.updatePlaying(dt);
    else if (this.mode === 'title') this.updateTitle(dt);
    this.input.endFrame();
    this.render();
  }

  private updateTitle(dt: number): void {
    const s = this.level.spawn;
    const t = this.time * 0.08;
    this.camera.position.set(s.x + Math.sin(t) * 6, 3.2, s.z - 8 + Math.cos(t) * 4);
    this.camera.lookAt(s.x - 10, 2.4, s.z - 24);
    this.camera.updateMatrixWorld();
    this.level.update(dt);
  }

  private updatePlaying(dt: number): void {
    if (import.meta.env.DEV && this.input.pressed('F2')) this.giveAll();
    const c = this.rig.controller;
    const report = this.rig.update(dt, this.input, this.level.world, this.hittables);
    for (const shot of report.shots) {
      if (shot.result.hits > 0) this.hud.showHit(shot.result.head);
      this.director.hearShot(c.x, c.z, WEAPONS[shot.weapon].noiseRadius, this.level.world, c.eyeY);
    }
    this.vitals = tickVitals(this.vitals, dt);
    this.syncPlayerViews();
    this.director.update({
      dt, time: this.time, world: this.level.world, grid: this.grid, player: this.playerView,
      passable: this.passable, damagePlayer: this.hurt,
    });
    const bolts = this.projectiles.update(dt, this.level.world, this.playerBody);
    if (bolts.damage > 0) this.hurt(bolts.damage, bolts.fromX, bolts.fromZ, 0, 0);
    this.refreshHittables();
    this.debris.update(dt, this.level.world);
    for (const t of this.targets) t.update(dt);
    this.level.update(dt);
    this.collectPickups();
    updatePickups(this.pickups, this.time);
    this.sparks.update(dt, 0);
    this.smoke.update(dt, 0);
    this.tracers.update(dt);
    this.hud.update(dt, {
      health: this.vitals.health, maxHealth: MAX_HEALTH, shield: this.vitals.shield, maxShield: MAX_SHIELD,
      arsenal: this.rig.arsenal, sector: this.sector.name, spreadPx: this.rig.spreadPx(this.container.clientHeight),
    });
    if (isDead(this.vitals)) this.die();
  }

  private syncPlayerViews(): void {
    const c = this.rig.controller;
    const v = this.playerView;
    v.x = c.x;
    v.z = c.z;
    v.feetY = c.y;
    v.eyeY = c.eyeY;
    v.crouched = c.crouched;
    v.vx = c.vx;
    v.vz = c.vz;
    const b = this.playerBody;
    b.x = c.x;
    b.z = c.z;
    b.feetY = c.y;
    b.headY = c.y + c.height;
  }

  private refreshHittables(): void {
    this.hittables.length = 0;
    for (const t of this.targets) this.hittables.push(t);
    for (const h of this.director.hittables) this.hittables.push(h);
  }

  /** Célula livre para andar: piso, e porta aberta. Voadores passam também sobre obstáculos baixos. */
  private readonly passable = (col: number, row: number, flying: boolean): boolean => {
    const t = tileAt(this.grid, col, row);
    if (t === 'floor') return true;
    if (t === 'door') return this.level.doors.some((d) => d.col === col && d.row === row && d.progress >= OPEN_DOOR_PROGRESS);
    return flying && isLowCover(t);
  };

  /** Dano ao jogador: o escudo absorve primeiro; empurra, treme a câmera e aponta de onde veio. */
  private readonly hurt = (amount: number, fromX: number, fromZ: number, pushX: number, pushZ: number): void => {
    if (this.god || this.mode !== 'playing') return;
    const c = this.rig.controller;
    const shielded = this.vitals.shield > 0;
    this.vitals = applyDamage(this.vitals, amount);
    c.vx += pushX;
    c.vz += pushZ;
    const ax = fromX - c.x;
    const az = fromZ - c.z;
    const front = ax * -Math.sin(c.yaw) + az * -Math.cos(c.yaw);
    const right = ax * Math.cos(c.yaw) + az * -Math.sin(c.yaw);
    this.hud.showDamage(Math.atan2(right, front));
    this.enemySfx.hurt(shielded);
    this.rig.shake.add(0.25 + amount * 0.012);
  };

  /** Onde um item pode cair: o ponto do robô se for piso, senão a célula livre mais próxima. */
  private dropPoint(x: number, z: number): { x: number; z: number } | null {
    const here = worldToCell(x, z);
    for (let r = 0; r <= 2; r++) {
      for (let dr = -r; dr <= r; dr++) {
        for (let dc = -r; dc <= r; dc++) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== r) continue;
          if (isOpenTile(tileAt(this.grid, here.col + dc, here.row + dr))) return r === 0 ? { x, z } : cellCenter(here.col + dc, here.row + dr);
        }
      }
    }
    return null;
  }

  private dropPickup(drop: Drop, x: number, z: number): void {
    const at = this.dropPoint(x, z);
    if (!at) return;
    const p = makePickup(drop, at.x, at.z);
    this.levelRoot.add(p.mesh);
    this.pickups.push(p);
  }

  private collectPickups(): void {
    const c = this.rig.controller;
    const a = this.rig.arsenal;
    const accepts = (k: PickupKind): boolean => {
      if (k === 'health') return this.vitals.health < MAX_HEALTH;
      if (k === 'ammo') return a.owned.some((w) => !WEAPONS[w].infiniteReserve && a.guns[w].reserve < WEAPONS[w].reserveMax);
      return true;
    };
    const got = collect(this.pickups, c.x, c.y, c.z, accepts);
    if (!got) return;
    if (got.kind === 'health') this.vitals = heal(this.vitals, HEALTH_PICKUP);
    else if (got.kind === 'ammo') this.rig.arsenal = a.owned.reduce((s, w) => addAmmo(s, w, AMMO_PICKUP[w]), a);
    else this.rig.arsenal = giveWeapon(a, got.kind);
    this.enemySfx.pickup(got.kind);
  }

  private render(): void {
    this.backdrop.group.position.copy(this.camera.position);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    if (this.mode === 'playing' || this.mode === 'paused') {
      this.renderer.clearDepth();
      this.renderer.render(this.vm.scene, this.vm.camera);
    }
  }

  fail(err: unknown): void {
    this.mode = 'error';
    this.input.releaseLock();
    this.hud.setVisible(false);
    this.screens.show('error', {
      kicker: 'FALHA CRÍTICA',
      title: 'ERRO NO JOGO',
      body: `O jogo parou por um erro inesperado: ${err instanceof Error ? err.message : String(err)}. Recarregue a página para tentar de novo.`,
      actions: [],
    });
  }
}
