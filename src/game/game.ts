import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { AudioEngine } from '../audio/engine';
import { Ambience } from '../audio/ambience';
import { Music } from '../audio/music';
import { EnemySfx, Sfx, WorldSfx } from '../audio/sfx';
import { Boss } from '../enemies/boss';
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
import { type BuiltLevel, type BuiltSwitch, buildLevel } from '../level/build';
import { CollisionWorld } from '../world/collision';
import { CELL, type Grid, cellCenter, entitiesOf, isLowCover, isOpenTile, parseGrid, tileAt, worldToCell } from '../level/grid';
import { SECTORS, type SectorDef, type SectorId } from '../level/sectors';
import { THEMES } from '../level/themes';
import { Gunplay } from '../player/gunplay';
import { PlayerRig } from '../player/rig';
import { Viewmodel } from '../player/viewmodel';
import { createBackdrop, type Backdrop } from '../render/space';
import { type Station, createStation } from '../render/station';
import { WEAPONS, addAmmo, createArsenal, giveWeapon } from '../rules/arsenal';
import type { Drop } from '../rules/drops';
import { type RunStats, type Snapshot, advanceClock, formatTime, newRun, recordDeath, restoreSnapshot, takeSnapshot } from '../rules/progress';
import { MAX_HEALTH, MAX_SHIELD, type Vitals, damagePlayer as applyDamage, fullVitals, heal, isDead, tickVitals } from '../rules/vitals';
import { Hud } from '../ui/hud';
import { Screens, escapeHtml } from '../ui/screens';
import { Input } from './input';
import { type Pickup, type PickupKind, collect, makePickup, updatePickups } from './pickups';

export type Mode = 'title' | 'playing' | 'paused' | 'dead' | 'transition' | 'victory' | 'error';

const AMMO_PICKUP = { pistol: 0, rifle: 45, shotgun: 8 } as const;
const HEALTH_PICKUP = 35;
const OPEN_DOOR_PROGRESS = 0.7;
const MIN_PIXEL_RATIO = 0.6;
const SWITCH_REACH = 2.9;
const TRANSITION_TIME = 1.7;
const VICTORY_DELAY = 3;
const BOSS_NAME = 'NÚCLEO — SENTINELA-0';
/** Onde o planeta aparece pelas janelas de cada setor (relativo à câmera). */
const PLANET_ANCHOR: Readonly<Record<SectorId, readonly [number, number, number]>> = {
  hangar: [-91, -57, -143],
  labs: [-91, -57, -143],
  greenhouse: [-120, 18, -150],
  core: [-91, -57, -143],
};

/** O jogo: cena, setor atual, jogador, robôs, efeitos, HUD e telas, e a máquina de modos. */
export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(78, 1, 0.05, 600);
  readonly input: Input;
  readonly audio = new AudioEngine();
  readonly sfx = new Sfx(this.audio);
  readonly enemySfx = new EnemySfx(this.audio);
  readonly worldSfx = new WorldSfx(this.audio);
  private readonly music = new Music(this.audio);
  private readonly ambience = new Ambience(this.audio);
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
  private readonly station: Station;
  private readonly stationLights = new THREE.Group();
  private readonly basePixelRatio: number;
  private frameAvg = 1 / 60;
  private slowTime = 0;
  private fastTime = 0;
  readonly director: Director;
  private level!: BuiltLevel;
  private readonly services: EnemyServices;
  private sectorIndex = 0;
  private run: RunStats = newRun();
  private snapshot: Snapshot = takeSnapshot(fullVitals(), createArsenal());
  private exitOpen = false;
  private transitionTimer = 0;
  private winTimer = -1;
  private actionBusy = false;
  private finalTime = 0;
  private boss: Boss | null = null;
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
    this.basePixelRatio = Math.min(1.5, window.devicePixelRatio);
    this.renderer.setPixelRatio(this.basePixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.autoClear = false;
    // Duas passagens por quadro (mundo e arma): a contagem do painel F3 soma as duas.
    this.renderer.info.autoReset = false;
    this.renderer.setClearColor(0x02040a);
    container.appendChild(this.renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.environment = env;
    this.vm = new Viewmodel(env);
    this.vm.scene.add(this.shells.vmMesh);
    this.backdrop = createBackdrop();
    this.station = createStation();
    const sun = new THREE.DirectionalLight(0xfff0dd, 3.4);
    sun.position.set(-30, 40, 20);
    this.stationLights.add(sun, new THREE.HemisphereLight(0x6fa8ff, 0x0a0c14, 0.5));
    this.stationLights.visible = this.station.group.visible = false;
    this.scene.add(this.station.group, this.stationLights);

    const services: EnemyServices = this.services = {
      sfx: this.enemySfx, audio: this.audio, sparks: this.sparks, smoke: this.smoke, projectiles: this.projectiles,
      spawnDrone: (x, z) => this.director.add(new Drone(x, z, services)),
      shake: (a) => this.rig.shake.add(a),
    };
    this.director = new Director(services, this.debris);
    this.director.onDrop = (drop, x, z) => this.dropPickup(drop, x, z);
    this.director.onDeath = (r) => {
      if (r.kind === 'boss') this.onBossDeath();
    };
    this.scene.add(
      this.backdrop.group, this.levelRoot, this.director.root, this.debris.root, this.sparks.points, this.smoke.points,
      this.tracers.mesh, this.decals.mesh, this.shells.worldMesh, this.projectiles.mesh,
    );

    this.input = new Input(this.renderer.domElement);
    this.hud = new Hud(container);
    this.screens = new Screens(container);
    const gunplay = new Gunplay(this.sparks, this.smoke, this.tracers, this.decals);
    // O setor é construído uma vez só, por `enterSector`; o jogador nasce com um mundo vazio de passagem.
    this.rig = new PlayerRig(new CollisionWorld(1, 1, CELL, 0, 6), this.camera, this.vm, gunplay, this.shells, this.sfx, this.audio);
    this.shells.onBounce = (x, y, z, heavy) => this.sfx.brass(x, y, z, heavy);
    this.debris.onImpact = (x, y, z) => this.enemySfx.clank(x, y, z);
    this.projectiles.onImpact = (x, y, z) => this.sfx.impact(x, y, z, 'metal');
    this.enterSector(0, this.freshState());

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

  /** Entra num setor com o estado dado (partida nova, tentar de novo, ou o setor seguinte). */
  private enterSector(index: number, state: Snapshot): void {
    this.sectorIndex = index;
    this.sector = SECTORS[index] as SectorDef;
    this.loadSector(this.sector);
    const s = this.level.spawn;
    this.rig.controller.place(s.x, s.z, s.yaw);
    this.rig.reset(state.arsenal);
    this.vitals = state.vitals;
    this.snapshot = takeSnapshot(state.vitals, state.arsenal);
    this.exitOpen = false;
    this.winTimer = -1;
    this.boss = null;
    const bossSpawn = entitiesOf(this.grid, 'boss')[0];
    if (bossSpawn) {
      const c = cellCenter(bossSpawn.col, bossSpawn.row);
      this.boss = this.director.add(new Boss(c.x, c.z, this.services));
      this.boss.yaw = 0;
      this.boss.onPhaseChange = () => this.restockArena();
    }
    this.director.rebuildHittables();
    this.refreshHittables();
    this.backdrop.placePlanet(...PLANET_ANCHOR[this.sector.id]);
    this.ambience.setSector(this.sector.id);
    this.music.setSector(this.sector.id);
    this.hud.setBoss(null, 0);
  }

  private freshState(): Snapshot {
    return takeSnapshot(fullVitals(), createArsenal());
  }

  /** A cada troca de fase do chefe os itens da arena voltam, para ninguém ficar sem saída. */
  private restockArena(): void {
    for (const p of this.pickups) {
      p.taken = false;
      p.mesh.visible = true;
    }
  }

  private onBossDeath(): void {
    this.finalTime = this.run.elapsed;
    this.winTimer = VICTORY_DELAY;
    this.hud.setBoss(null, 0);
    this.worldSfx.victory();
  }

  private resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.vm.setAspect(w / h);
    this.scaleParticles();
  }

  /** O tamanho do ponto é em pixels do buffer: acompanha a resolução adaptativa. */
  private scaleParticles(): void {
    const h = this.container.clientHeight * this.renderer.getPixelRatio();
    this.sparks.setScale(h);
    this.smoke.setScale(h);
  }

  /** Título: a estação girando com o planeta atrás; o setor fica escondido. */
  private setTitleScene(on: boolean): void {
    this.station.group.visible = this.stationLights.visible = on;
    this.levelRoot.visible = this.director.root.visible = this.debris.root.visible = !on;
    if (on) {
      this.scene.fog = null;
      this.scene.environmentIntensity = 0.45;
      this.renderer.toneMappingExposure = 1.05;
      this.backdrop.placePlanet(-62, -34, -150);
      this.station.group.position.set(17, 1, -48);
      this.camera.position.set(0, 2, 0);
      this.camera.lookAt(5, 1, -52);
      this.camera.updateMatrixWorld();
    }
  }

  private showTitle(): void {
    this.setTitleScene(true);
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
    this.audio.duck(true);
    this.screens.show('pause', {
      kicker: 'SISTEMA EM ESPERA',
      title: 'PAUSADO',
      actions: [{ id: 'resume', label: 'CONTINUAR' }, { id: 'restart', label: 'RECOMEÇAR SETOR' }, { id: 'title', label: 'SAIR PARA O TÍTULO' }],
      hint: 'Clique em continuar para travar o mouse de novo.',
    });
  }

  private die(): void {
    this.run = recordDeath(this.run);
    this.mode = 'dead';
    this.audio.duck(true);
    this.music.setTarget(0);
    this.input.releaseLock();
    this.hud.setVisible(false);
    this.screens.show('death', {
      kicker: 'SINAIS VITAIS PERDIDOS',
      title: 'VOCÊ MORREU',
      actions: [{ id: 'retry', label: 'TENTAR DE NOVO' }, { id: 'title', label: 'TÍTULO' }],
      hint: `Tentar de novo recomeça o ${this.sector.name.split('— ')[1]?.toLowerCase() ?? 'setor'} com o que você tinha ao entrar.`,
    });
  }

  private showVictory(): void {
    this.mode = 'victory';
    this.input.releaseLock();
    this.hud.setVisible(false);
    this.screens.show('victory', {
      kicker: 'NÚCLEO DESLIGADO',
      title: 'VITÓRIA',
      body: `A estação silenciou. Tempo total: <b>${formatTime(this.finalTime)}</b> · Mortes: <b>${this.run.deaths}</b>`,
      actions: [{ id: 'play', label: 'JOGAR DE NOVO' }, { id: 'title', label: 'TÍTULO' }],
    });
  }

  private onLockChange(locked: boolean): void {
    if (!locked && this.mode === 'playing') this.pause();
  }

  private async onAction(id: string): Promise<void> {
    // Duplo clique ou Enter segurado não pode reconstruir o setor duas vezes.
    if (this.actionBusy) return;
    this.actionBusy = true;
    try {
      await this.handleAction(id);
    } catch (err) {
      console.error('Erro ao tratar a ação do menu.', id, err);
      this.fail(err);
    } finally {
      this.actionBusy = false;
    }
  }

  private async handleAction(id: string): Promise<void> {
    this.sfx.ui();
    if (id === 'resume' || id === 'play' || id === 'restart' || id === 'retry') {
      await this.audio.unlock();
      this.audio.duck(false);
      this.setTitleScene(false);
      this.music.start();
      this.ambience.resume();
      if (id === 'play') {
        this.run = newRun();
        this.enterSector(0, this.freshState());
      } else if (id === 'restart' || id === 'retry') {
        this.enterSector(this.sectorIndex, restoreSnapshot(this.snapshot));
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
      this.enterSector(0, this.freshState());
      this.ambience.stop();
      this.music.stop();
      this.audio.duck(false);
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

  /** Atalho de desenvolvimento: pula direto para um setor com o estado atual. */
  jumpToSector(index: number): void {
    if (!SECTORS[index]) throw new Error(`setor ${index} não existe`);
    this.enterSector(index, takeSnapshot(this.vitals, this.rig.arsenal));
  }

  get devState(): Record<string, unknown> {
    return {
      sector: this.sectorIndex, exitOpen: this.exitOpen, elapsed: this.run.elapsed, deaths: this.run.deaths,
      switches: [...this.level.switches].sort((a, b) => a.index - b.index).map((x) => x.pressed), bossPhase: this.boss?.phase ?? 0, bossFraction: this.boss?.fraction ?? 0,
    };
  }

  pressSwitchNear(): void {
    this.input.simulateKey('KeyE', true);
  }

  get playerPosition(): { x: number; z: number } {
    return { x: this.rig.controller.x, z: this.rig.controller.z };
  }

  get exitPosition(): { x: number; z: number } | null {
    const e = this.level.exitCells[0];
    return e ? cellCenter(e.col, e.row) : null;
  }

  /** Onde ficar para acionar cada interruptor: a célula livre vizinha ao console. */
  get switchPositions(): { index: number; x: number; z: number; pressed: boolean; stand: { x: number; z: number } }[] {
    return this.level.switches.map((x) => {
      const near = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).find(([dc, dr]) => this.passable(x.col + dc, x.row + dr, false));
      const stand = near ? cellCenter(x.col + near[0], x.row + near[1]) : { x: x.x, z: x.z };
      return { index: x.index, x: x.x, z: x.z, pressed: x.pressed, stand };
    });
  }

  /** Atalho de desenvolvimento: pausa como se o mouse tivesse sido solto. */
  devPause(): void {
    this.pause();
  }

  /** Atalho de desenvolvimento: dano direto, mesmo em modo imortal. */
  devHurt(amount: number): void {
    const was = this.god;
    this.god = false;
    this.hurt(amount, this.rig.controller.x, this.rig.controller.z - 3, 0, 0);
    this.god = was;
  }

  /**
   * Resolução adaptativa: se o quadro passa do orçamento por 2 s, a resolução interna cai em passos; com folga por
   * 5 s, volta. Mantém o jogo liso em notebooks com GPU integrada.
   */
  private adaptResolution(dt: number): void {
    this.frameAvg += (dt - this.frameAvg) * 0.05;
    const ratio = this.renderer.getPixelRatio();
    if (this.frameAvg > 1 / 45) {
      this.slowTime += dt;
      this.fastTime = 0;
    } else if (this.frameAvg < 1 / 58) {
      this.fastTime += dt;
      this.slowTime = 0;
    } else {
      this.slowTime = this.fastTime = 0;
    }
    if (this.slowTime > 2 && ratio > MIN_PIXEL_RATIO) {
      this.renderer.setPixelRatio(Math.max(MIN_PIXEL_RATIO, ratio - 0.15));
      this.scaleParticles();
      this.slowTime = 0;
    } else if (this.fastTime > 5 && ratio < this.basePixelRatio) {
      this.renderer.setPixelRatio(Math.min(this.basePixelRatio, ratio + 0.1));
      this.scaleParticles();
      this.fastTime = 0;
    }
  }

  frame(dt: number, now: number): void {
    this.time = now;
    if (this.mode === 'playing') this.adaptResolution(dt);
    this.backdrop.update(dt);
    if (this.mode === 'playing') this.updatePlaying(dt);
    else if (this.mode === 'transition') this.updateTransition(dt);
    else if (this.mode === 'title') this.updateTitle(dt);
    else if (this.mode === 'dead' || this.mode === 'victory') this.updateWorldFx(dt);
    this.input.endFrame();
    this.render();
  }

  private updateTitle(dt: number): void {
    this.station.update(dt, this.time);
  }

  /** Efeitos que seguem rodando com o jogo parado por uma tela: pedaços caindo, faíscas, luzes do setor. */
  private updateWorldFx(dt: number): void {
    this.debris.update(dt, this.level.world);
    this.level.update(dt);
    updatePickups(this.pickups, this.time);
    this.sparks.update(dt, 0);
    this.smoke.update(dt, 0);
    this.tracers.update(dt);
  }

  private updateTransition(dt: number): void {
    this.updateWorldFx(dt);
    this.transitionTimer -= dt;
    if (this.transitionTimer > 0) return;
    this.enterSector(this.sectorIndex + 1, takeSnapshot(this.vitals, this.rig.arsenal));
    this.screens.hide();
    this.mode = 'playing';
    // O jogador pode ter soltado o mouse durante a transição: sem trava, vai direto para a pausa.
    if (!this.input.locked && !this.input.testMode) this.pause();
  }

  private beginTransition(): void {
    const next = SECTORS[this.sectorIndex + 1];
    if (!next) return;
    this.mode = 'transition';
    this.transitionTimer = TRANSITION_TIME;
    this.worldSfx.transition();
    this.screens.show('transition', { kicker: 'AVANÇANDO', title: next.name.replace('— ', '· '), actions: [] });
  }

  private updatePlaying(dt: number): void {
    if (import.meta.env.DEV && this.input.pressed('F2')) this.giveAll();
    const c = this.rig.controller;
    this.run = advanceClock(this.run, dt, this.winTimer < 0);
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
    this.updateWorldFx(dt);
    for (const t of this.targets) t.update(dt);
    this.collectPickups();
    this.updateSector();
    this.updateAudio(dt);
    this.hud.update(dt, {
      health: this.vitals.health, maxHealth: MAX_HEALTH, shield: this.vitals.shield, maxShield: MAX_SHIELD,
      arsenal: this.rig.arsenal, sector: this.sector.name, spreadPx: this.rig.spreadPx(this.container.clientHeight),
    });
    this.hud.setTimer(formatTime(this.run.elapsed));
    if (this.boss?.alive) this.hud.setBoss(BOSS_NAME, this.boss.fraction);
    if (this.winTimer >= 0) {
      this.winTimer -= dt;
      if (this.winTimer < 0) this.showVictory();
    } else if (isDead(this.vitals)) this.die();
  }

  /** Intensidade da música: combate acelera, alerta esquenta; a sirene do laboratório segue a luz. */
  private updateAudio(dt: number): void {
    let level = 0;
    for (const r of this.director.robots) {
      if (r.mem.mode === 'combat') {
        level = 1;
        break;
      }
      if (r.mem.mode === 'alert' || r.mem.mode === 'search') level = 0.4;
    }
    this.music.setTarget(level);
    this.music.update(dt);
    this.ambience.setAlarm(this.level.alarmPulse());
  }

  /** Objetivo do setor: interruptores, saída que destrava, seta até a saída e passagem para o próximo setor. */
  private updateSector(): void {
    const c = this.rig.controller;
    const def = this.sector;
    const pressed = this.level.switches.filter((x) => x.pressed).length;
    const total = this.level.switches.length;
    if (!this.exitOpen) {
      const ready = def.unlock === 'clear' ? this.director.aliveCount === 0 : def.unlock === 'switches' ? pressed === total : false;
      if (ready) {
        this.exitOpen = true;
        this.level.setExitOpen(true);
        this.worldSfx.unlock();
      }
    }
    let objective: string;
    if (def.unlock === 'boss') objective = 'DESLIGUE O NÚCLEO';
    else if (this.exitOpen) objective = 'VÁ ATÉ A SAÍDA';
    else if (def.unlock === 'switches') objective = `ACIONE OS INTERRUPTORES (${pressed}/${total})`;
    else objective = `ELIMINE OS ROBÔS (${this.director.aliveCount})`;
    this.hud.setObjective(objective);

    this.hud.setPrompt(this.nearSwitchPrompt());
    this.hud.setCompass(this.exitOpen ? this.exitAngle() : null);

    if (this.exitOpen && def.unlock !== 'boss') {
      const here = worldToCell(c.x, c.z);
      if (tileAt(this.grid, here.col, here.row) === 'exit') this.beginTransition();
    }
  }

  /** Interruptor ao alcance: mostra o aviso e aciona com E. */
  private nearSwitchPrompt(): string | null {
    const c = this.rig.controller;
    let nearest: BuiltSwitch | null = null;
    let best = SWITCH_REACH;
    for (const sw of this.level.switches) {
      if (sw.pressed) continue;
      const d = Math.hypot(sw.x - c.x, sw.z - c.z);
      if (d < best) {
        best = d;
        nearest = sw;
      }
    }
    if (!nearest) return null;
    if (this.input.pressed('KeyE')) {
      if (this.level.pressSwitch(nearest.index)) {
        this.worldSfx.button();
        const door = this.level.doors.find((d) => d.index === nearest?.index);
        if (door) this.worldSfx.door(door.mesh.position.x, 1.5, door.mesh.position.z);
      }
      return null;
    }
    return '[E] ACIONAR INTERRUPTOR';
  }

  private exitAngle(): number | null {
    const e = this.level.exitCells[0];
    if (!e) return null;
    const t = cellCenter(e.col, e.row);
    const c = this.rig.controller;
    const ax = t.x - c.x;
    const az = t.z - c.z;
    const front = ax * -Math.sin(c.yaw) + az * -Math.cos(c.yaw);
    const right = ax * Math.cos(c.yaw) + az * -Math.sin(c.yaw);
    return Math.atan2(right, front);
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
      // Arma já na mão com a reserva cheia: o item fica no chão, não se perde.
      return !a.owned.includes(k) || a.guns[k].reserve < WEAPONS[k].reserveMax;
    };
    const got = collect(this.pickups, c.x, c.y, c.z, accepts);
    if (!got) return;
    if (got.kind === 'health') this.vitals = heal(this.vitals, HEALTH_PICKUP);
    else if (got.kind === 'ammo') this.rig.arsenal = a.owned.reduce((s, w) => addAmmo(s, w, AMMO_PICKUP[w]), a);
    else this.rig.arsenal = giveWeapon(a, got.kind);
    this.enemySfx.pickup(got.kind);
  }

  private render(): void {
    this.renderer.info.reset();
    this.backdrop.group.position.copy(this.camera.position);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    if (this.mode === 'playing' || this.mode === 'paused') {
      this.renderer.clearDepth();
      this.renderer.render(this.vm.scene, this.vm.camera);
    }
  }

  fail(err: unknown): void {
    if (this.mode === 'error') return;
    this.mode = 'error';
    this.music.stop();
    this.ambience.stop();
    void this.audio.suspend();
    this.input.releaseLock();
    this.hud.setVisible(false);
    this.screens.show('error', {
      kicker: 'FALHA CRÍTICA',
      title: 'ERRO NO JOGO',
      body: `O jogo parou por um erro inesperado: ${escapeHtml(err instanceof Error ? err.message : String(err))}. Recarregue a página para tentar de novo.`,
      actions: [],
    });
  }
}
