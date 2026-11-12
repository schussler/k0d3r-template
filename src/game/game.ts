import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { AudioEngine } from '../audio/engine';
import { Sfx } from '../audio/sfx';
import { TrainingTarget } from '../enemies/target';
import { Decals } from '../fx/decals';
import { ParticleSystem } from '../fx/particles';
import { Shells } from '../fx/shells';
import { Tracers } from '../fx/tracers';
import { type BuiltLevel, buildLevel } from '../level/build';
import { cellCenter, parseGrid } from '../level/grid';
import { SECTORS, type SectorDef } from '../level/sectors';
import { THEMES } from '../level/themes';
import { Gunplay } from '../player/gunplay';
import { PlayerRig } from '../player/rig';
import { Viewmodel } from '../player/viewmodel';
import { createBackdrop, type Backdrop } from '../render/space';
import { addAmmo, createArsenal, giveWeapon, WEAPONS, type WeaponId } from '../rules/arsenal';
import { Hud } from '../ui/hud';
import { Screens } from '../ui/screens';
import { Input } from './input';
import { type Pickup, collect, makePickup, updatePickups } from './pickups';

export type Mode = 'title' | 'playing' | 'paused' | 'error';

const AMMO_PICKUP: Readonly<Record<WeaponId, number>> = { pistol: 0, rifle: 45, shotgun: 8 };

/** O jogo: cena, setor atual, jogador, efeitos, HUD e telas, e a máquina de modos. */
export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(78, 1, 0.05, 600);
  readonly input: Input;
  readonly audio = new AudioEngine();
  readonly sfx = new Sfx(this.audio);
  readonly hud: Hud;
  readonly screens: Screens;
  readonly rig: PlayerRig;
  readonly vm: Viewmodel;
  private readonly sparks = new ParticleSystem(900, true, 0.0);
  private readonly smoke = new ParticleSystem(300, false, 0.2);
  private readonly tracers = new Tracers();
  private readonly decals = new Decals();
  private readonly shells = new Shells();
  private readonly backdrop: Backdrop;
  private level!: BuiltLevel;
  private sector!: SectorDef;
  private targets: TrainingTarget[] = [];
  private pickups: Pickup[] = [];
  private levelRoot = new THREE.Group();
  mode: Mode = 'title';
  private time = 0;
  health = 100;
  shield = 100;
  readonly maxHealth = 100;
  readonly maxShield = 100;

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
    this.scene.add(this.backdrop.group, this.levelRoot, this.sparks.points, this.smoke.points, this.tracers.mesh, this.decals.mesh, this.shells.worldMesh);

    this.input = new Input(this.renderer.domElement);
    this.hud = new Hud(container);
    this.screens = new Screens(container);
    const gunplay = new Gunplay(this.sparks, this.smoke, this.tracers, this.decals);
    this.sector = SECTORS[0] as SectorDef;
    this.loadSector(this.sector);
    this.rig = new PlayerRig(this.level.world, this.camera, this.vm, gunplay, this.shells, this.sfx, this.audio);
    this.shells.onBounce = (x, y, z, heavy) => this.sfx.brass(x, y, z, heavy);
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
    const grid = parseGrid(def.map);
    const theme = THEMES[def.id];
    this.level = buildLevel(grid, theme);
    this.levelRoot.add(this.level.group);
    this.scene.fog = new THREE.FogExp2(theme.fogColor, theme.fogDensity);
    this.scene.environmentIntensity = theme.envIntensity;
    this.renderer.toneMappingExposure = theme.exposure;
    this.audio.setReverb(...theme.reverb);
    const spawn = this.level.spawn;
    this.targets = grid.entities.filter((e) => e.kind === 'target').map((e) => {
      const c = cellCenter(e.col, e.row);
      const t = new TrainingTarget(c.x, c.z, Math.atan2(spawn.x - c.x, spawn.z - c.z));
      this.levelRoot.add(t.group);
      return t;
    });
    this.pickups = grid.entities.flatMap((e) => {
      if (e.kind !== 'ammo' && e.kind !== 'health' && e.kind !== 'rifle' && e.kind !== 'shotgun') return [];
      const c = cellCenter(e.col, e.row);
      const p = makePickup(e.kind, c.x, c.z);
      this.levelRoot.add(p.mesh);
      return [p];
    });
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
    this.health = this.maxHealth;
    this.shield = this.maxShield;
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

  private onLockChange(locked: boolean): void {
    if (!locked && this.mode === 'playing') this.pause();
  }

  private async onAction(id: string): Promise<void> {
    this.sfx.ui();
    if (id === 'play' || id === 'resume' || id === 'restart') {
      await this.audio.unlock();
      if (id === 'play' || id === 'restart') {
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
    const report = this.rig.update(dt, this.input, this.level.world, this.targets);
    for (const shot of report.shots) {
      if (shot.result.hits > 0) this.hud.showHit(shot.result.head);
    }
    for (const t of this.targets) t.update(dt);
    this.level.update(dt);
    this.collectPickups();
    updatePickups(this.pickups, this.time);
    this.sparks.update(dt, 0);
    this.smoke.update(dt, 0);
    this.tracers.update(dt);
    this.hud.update(dt, {
      health: this.health, maxHealth: this.maxHealth, shield: this.shield, maxShield: this.maxShield,
      arsenal: this.rig.arsenal, sector: this.sector.name, spreadPx: this.rig.spreadPx(this.container.clientHeight),
    });
  }

  private collectPickups(): void {
    const c = this.rig.controller;
    const a = this.rig.arsenal;
    const got = collect(this.pickups, c.x, c.y, c.z, (k) => {
      if (k === 'health') return this.health < this.maxHealth;
      if (k === 'ammo') return a.owned.some((w) => !WEAPONS[w].infiniteReserve && a.guns[w].reserve < WEAPONS[w].reserveMax);
      return true;
    });
    if (!got) return;
    if (got.kind === 'health') this.health = Math.min(this.maxHealth, this.health + 35);
    else if (got.kind === 'ammo') this.rig.arsenal = a.owned.reduce((s, w) => addAmmo(s, w, AMMO_PICKUP[w]), a);
    else this.rig.arsenal = giveWeapon(a, got.kind);
    this.sfx.ui();
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
